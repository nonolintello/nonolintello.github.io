-- Athlete Intelligence Platform — initial schema
-- Postgres 15+. Designed for Supabase (auth.users) but portable: the only
-- Supabase-specific pieces are the auth.uid() references in the RLS policies.

create extension if not exists "uuid-ossp";
create extension if not exists "postgis";
create extension if not exists "citext";

-- ---------------------------------------------------------------------------
-- Enums. Sport is deliberately broad: the MVP ships running only, but the
-- activity model must not need a migration to admit cycling or swimming.
-- ---------------------------------------------------------------------------

create type sport as enum (
  'running', 'trail_running', 'treadmill_running',
  'cycling', 'gravel_cycling', 'mountain_biking', 'indoor_cycling',
  'swimming', 'open_water_swimming',
  'hiking', 'walking', 'rowing', 'skiing', 'ski_touring',
  'strength', 'other'
);

create type visibility as enum ('public', 'followers', 'private');

create type activity_source as enum (
  'manual', 'garmin', 'coros', 'apple_health', 'fitbit', 'polar', 'suunto', 'wahoo', 'file_upload'
);

create type goal_metric as enum ('distance', 'duration', 'activity_count', 'elevation_gain', 'training_load');
create type goal_period as enum ('week', 'month', 'custom');

create type challenge_kind as enum ('distance', 'duration', 'activity_count', 'elevation_gain', 'streak', 'personal_best', 'head_to_head');

create type insight_kind as enum ('fact', 'metric', 'prediction', 'recommendation');
create type insight_scope as enum ('activity', 'week', 'month', 'athlete');

-- ---------------------------------------------------------------------------
-- Athlete
-- ---------------------------------------------------------------------------

create table athlete (
  id              uuid primary key default uuid_generate_v4(),
  -- In Supabase this equals auth.users.id. Kept as a plain column so the
  -- schema also runs on vanilla Postgres.
  auth_user_id    uuid unique,
  handle          text unique not null check (handle ~ '^[a-z0-9_]{3,30}$'),
  display_name    text not null,
  email           citext unique,
  avatar_url      text,
  bio             text check (char_length(bio) <= 500),
  location        text,
  birth_date      date,
  sex             text check (sex in ('m', 'f', 'other', 'undisclosed')),
  resting_hr      smallint check (resting_hr between 25 and 120),
  max_hr          smallint check (max_hr between 120 and 230),
  weight_kg       numeric(5,2) check (weight_kg between 20 and 300),
  primary_sport   sport not null default 'running',
  unit_preference text not null default 'metric' check (unit_preference in ('metric', 'imperial')),

  -- Privacy (section 22). Defaults are deliberately conservative.
  profile_visibility   visibility not null default 'public',
  default_activity_visibility visibility not null default 'followers',
  location_visibility  visibility not null default 'private',
  -- Radius in metres around home/start-end points to hide from route polylines.
  route_privacy_radius_m integer not null default 200 check (route_privacy_radius_m between 0 and 2000),
  requires_follow_approval boolean not null default false,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index athlete_handle_idx on athlete (handle);

-- ---------------------------------------------------------------------------
-- Activity. Scalar summary metrics live here; high-frequency samples live in
-- activity_stream so the feed never has to read them.
-- ---------------------------------------------------------------------------

create table activity (
  id              uuid primary key default uuid_generate_v4(),
  athlete_id      uuid not null references athlete(id) on delete cascade,
  sport           sport not null,
  title           text,
  description     text,

  started_at      timestamptz not null,
  -- Offset captured separately so "morning run" stays correct across travel.
  start_timezone  text not null default 'UTC',

  -- Wall-clock elapsed vs. time actually moving. Pace is derived from moving.
  elapsed_seconds integer not null check (elapsed_seconds > 0),
  moving_seconds  integer not null check (moving_seconds > 0),
  distance_m      numeric(10,2) not null check (distance_m >= 0),

  elevation_gain_m   numeric(8,2) check (elevation_gain_m >= 0),
  elevation_loss_m   numeric(8,2) check (elevation_loss_m >= 0),
  avg_heart_rate     smallint check (avg_heart_rate between 30 and 240),
  max_heart_rate     smallint check (max_heart_rate between 30 and 240),
  avg_cadence_spm    numeric(5,1) check (avg_cadence_spm >= 0),
  avg_power_w        numeric(6,1),
  calories           integer check (calories >= 0),
  perceived_exertion smallint check (perceived_exertion between 1 and 10),

  -- Derived by the analytics engine, persisted so feeds and scores stay cheap.
  training_load      numeric(7,2),
  intensity_factor   numeric(4,3),

  -- Simplified polyline for map previews (full fidelity lives in the stream).
  route_geom      geography(linestring, 4326),
  route_polyline  text,
  start_point     geography(point, 4326),

  visibility      visibility not null default 'followers',

  -- Import provenance + de-duplication (section 15).
  source          activity_source not null default 'manual',
  source_activity_id text,
  raw_payload     jsonb,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint moving_lte_elapsed check (moving_seconds <= elapsed_seconds)
);

-- The same watch activity must never land twice, regardless of retry or
-- re-import. Partial index: manual activities have no source id to collide on.
create unique index activity_source_dedup_idx
  on activity (athlete_id, source, source_activity_id)
  where source_activity_id is not null;

create index activity_athlete_time_idx on activity (athlete_id, started_at desc);
create index activity_sport_idx on activity (athlete_id, sport, started_at desc);
create index activity_feed_idx on activity (visibility, started_at desc) where visibility <> 'private';
create index activity_route_gix on activity using gist (route_geom);

-- ---------------------------------------------------------------------------
-- Streams. One row per activity, arrays of samples — far cheaper than a row
-- per sample, and the analytics engine always consumes whole streams anyway.
-- ---------------------------------------------------------------------------

create table activity_stream (
  activity_id     uuid primary key references activity(id) on delete cascade,
  sample_count    integer not null,
  -- Seconds from activity start. Parallel arrays, all same length.
  time_offset_s   integer[] not null,
  distance_m      real[],
  latitude        double precision[],
  longitude       double precision[],
  altitude_m      real[],
  heart_rate      smallint[],
  cadence_spm     smallint[],
  velocity_mps    real[],
  power_w         real[]
);

create table activity_split (
  id              bigserial primary key,
  activity_id     uuid not null references activity(id) on delete cascade,
  split_index     integer not null,
  distance_m      numeric(10,2) not null,
  elapsed_seconds integer not null,
  avg_heart_rate  smallint,
  elevation_gain_m numeric(7,2),
  avg_cadence_spm numeric(5,1),
  unique (activity_id, split_index)
);

-- ---------------------------------------------------------------------------
-- Personal records. Standard distances ship first; custom distances are
-- admitted by storing the distance itself rather than an enum.
-- ---------------------------------------------------------------------------

create table personal_record (
  id              uuid primary key default uuid_generate_v4(),
  athlete_id      uuid not null references athlete(id) on delete cascade,
  sport           sport not null default 'running',
  distance_m      integer not null check (distance_m > 0),
  elapsed_seconds numeric(9,2) not null check (elapsed_seconds > 0),
  activity_id     uuid references activity(id) on delete set null,
  achieved_at     timestamptz not null,
  -- Chain to the record this one beat, so "previous PR / improvement" is a
  -- lookup rather than a scan.
  previous_record_id uuid references personal_record(id) on delete set null,
  is_current      boolean not null default true,
  created_at      timestamptz not null default now()
);

create unique index personal_record_current_idx
  on personal_record (athlete_id, sport, distance_m)
  where is_current;

create index personal_record_history_idx on personal_record (athlete_id, distance_m, achieved_at desc);

-- ---------------------------------------------------------------------------
-- Goals
-- ---------------------------------------------------------------------------

create table goal (
  id              uuid primary key default uuid_generate_v4(),
  athlete_id      uuid not null references athlete(id) on delete cascade,
  sport           sport,
  metric          goal_metric not null,
  period          goal_period not null default 'week',
  target_value    numeric(12,2) not null check (target_value > 0),
  starts_on       date not null,
  ends_on         date not null,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create index goal_active_idx on goal (athlete_id, starts_on desc);

-- ---------------------------------------------------------------------------
-- Athlete score. Components are stored, not just the composite, so the score
-- can be explained to the athlete and recomputed if weights change.
-- ---------------------------------------------------------------------------

create table athlete_score (
  id              uuid primary key default uuid_generate_v4(),
  athlete_id      uuid not null references athlete(id) on delete cascade,
  -- Monday of the ISO week this score summarises.
  week_start      date not null,
  overall         numeric(5,2) not null,
  speed           numeric(5,2) not null,
  endurance       numeric(5,2) not null,
  consistency     numeric(5,2) not null,
  climbing        numeric(5,2) not null,
  progression     numeric(5,2) not null,
  -- Full breakdown: sub-component values, weights, and the baselines each was
  -- measured against. Keeps scores auditable.
  breakdown       jsonb not null default '{}'::jsonb,
  algorithm_version text not null,
  computed_at     timestamptz not null default now(),
  unique (athlete_id, week_start)
);

-- ---------------------------------------------------------------------------
-- Gamification
-- ---------------------------------------------------------------------------

create table xp_event (
  id              bigserial primary key,
  athlete_id      uuid not null references athlete(id) on delete cascade,
  amount          integer not null,
  reason          text not null,
  activity_id     uuid references activity(id) on delete cascade,
  challenge_id    uuid,
  -- Idempotency key: prevents the same PR or goal awarding XP twice.
  dedup_key       text not null,
  occurred_at     timestamptz not null default now(),
  unique (athlete_id, dedup_key)
);

create index xp_event_athlete_idx on xp_event (athlete_id, occurred_at desc);

create table achievement (
  id              uuid primary key default uuid_generate_v4(),
  athlete_id      uuid not null references athlete(id) on delete cascade,
  kind            text not null,
  tier            text,
  title           text not null,
  description     text,
  activity_id     uuid references activity(id) on delete set null,
  metadata        jsonb not null default '{}'::jsonb,
  earned_at       timestamptz not null default now(),
  unique (athlete_id, kind, tier)
);

create table challenge (
  id              uuid primary key default uuid_generate_v4(),
  slug            text unique not null,
  name            text not null,
  description     text,
  sport           sport,
  kind            challenge_kind not null,
  target_value    numeric(12,2),
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  created_by      uuid references athlete(id) on delete set null,
  is_official     boolean not null default false,
  xp_reward       integer not null default 0,
  banner_url      text,
  created_at      timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table challenge_participation (
  challenge_id    uuid not null references challenge(id) on delete cascade,
  athlete_id      uuid not null references athlete(id) on delete cascade,
  progress_value  numeric(12,2) not null default 0,
  completed_at    timestamptz,
  joined_at       timestamptz not null default now(),
  primary key (challenge_id, athlete_id)
);

create index challenge_leaderboard_idx
  on challenge_participation (challenge_id, progress_value desc);

-- ---------------------------------------------------------------------------
-- Social graph
-- ---------------------------------------------------------------------------

create table follow (
  follower_id     uuid not null references athlete(id) on delete cascade,
  following_id    uuid not null references athlete(id) on delete cascade,
  -- Supports requires_follow_approval on private profiles.
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create index follow_reverse_idx on follow (following_id, follower_id);

create table activity_like (
  athlete_id      uuid not null references athlete(id) on delete cascade,
  activity_id     uuid not null references activity(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (activity_id, athlete_id)
);

create table activity_comment (
  id              uuid primary key default uuid_generate_v4(),
  activity_id     uuid not null references activity(id) on delete cascade,
  athlete_id      uuid not null references athlete(id) on delete cascade,
  body            text not null check (char_length(body) between 1 and 2000),
  created_at      timestamptz not null default now(),
  edited_at       timestamptz,
  deleted_at      timestamptz
);

create index activity_comment_thread_idx
  on activity_comment (activity_id, created_at) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Insights produced by the analytics engine / AI reasoning layer.
-- kind is mandatory so the UI can never render a prediction as a fact.
-- ---------------------------------------------------------------------------

create table insight (
  id              uuid primary key default uuid_generate_v4(),
  athlete_id      uuid not null references athlete(id) on delete cascade,
  scope           insight_scope not null,
  kind            insight_kind not null,
  activity_id     uuid references activity(id) on delete cascade,
  period_start    date,
  headline        text not null,
  body            text not null,
  -- The structured metrics the statement was derived from, so any claim can be
  -- traced back to the numbers that produced it.
  evidence        jsonb not null default '{}'::jsonb,
  confidence      numeric(3,2) check (confidence between 0 and 1),
  generator       text not null,
  generator_version text not null,
  created_at      timestamptz not null default now()
);

create index insight_athlete_idx on insight (athlete_id, created_at desc);
create index insight_activity_idx on insight (activity_id) where activity_id is not null;

-- ---------------------------------------------------------------------------
-- Third-party connections
-- ---------------------------------------------------------------------------

create table provider_connection (
  id              uuid primary key default uuid_generate_v4(),
  athlete_id      uuid not null references athlete(id) on delete cascade,
  provider        activity_source not null,
  provider_user_id text,
  -- Encrypted at rest by the application layer before insert.
  access_token    text,
  refresh_token   text,
  expires_at      timestamptz,
  scopes          text[],
  last_synced_at  timestamptz,
  sync_cursor     text,
  status          text not null default 'active' check (status in ('active', 'expired', 'revoked', 'error')),
  created_at      timestamptz not null default now(),
  unique (athlete_id, provider)
);

-- ---------------------------------------------------------------------------
-- Row level security. Visibility is enforced in the database, not only in the
-- application, so a query bug cannot leak a private activity.
-- ---------------------------------------------------------------------------

alter table athlete enable row level security;
alter table activity enable row level security;
alter table activity_stream enable row level security;
alter table personal_record enable row level security;
alter table goal enable row level security;
alter table activity_like enable row level security;
alter table activity_comment enable row level security;
alter table insight enable row level security;
alter table provider_connection enable row level security;

create or replace function current_athlete_id() returns uuid
language sql stable as $$
  select id from athlete where auth_user_id = auth.uid()
$$;

create or replace function follows(viewer uuid, target uuid) returns boolean
language sql stable as $$
  select exists (
    select 1 from follow
    where follower_id = viewer and following_id = target and approved_at is not null
  )
$$;

create policy athlete_self_write on athlete
  for all using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

create policy athlete_read on athlete
  for select using (
    profile_visibility = 'public'
    or id = current_athlete_id()
    or (profile_visibility = 'followers' and follows(current_athlete_id(), id))
  );

create policy activity_owner on activity
  for all using (athlete_id = current_athlete_id())
  with check (athlete_id = current_athlete_id());

create policy activity_read on activity
  for select using (
    athlete_id = current_athlete_id()
    or visibility = 'public'
    or (visibility = 'followers' and follows(current_athlete_id(), athlete_id))
  );

create policy stream_read on activity_stream
  for select using (
    exists (select 1 from activity a where a.id = activity_id)
  );

create policy pr_owner on personal_record
  for all using (athlete_id = current_athlete_id());
create policy pr_read on personal_record
  for select using (
    athlete_id = current_athlete_id()
    or exists (select 1 from athlete t where t.id = athlete_id and t.profile_visibility = 'public')
  );

create policy goal_owner on goal
  for all using (athlete_id = current_athlete_id());

create policy insight_owner on insight
  for all using (athlete_id = current_athlete_id());

create policy connection_owner on provider_connection
  for all using (athlete_id = current_athlete_id());

create policy like_read on activity_like for select using (true);
create policy like_write on activity_like
  for all using (athlete_id = current_athlete_id())
  with check (athlete_id = current_athlete_id());

create policy comment_read on activity_comment for select using (deleted_at is null);
create policy comment_write on activity_comment
  for all using (athlete_id = current_athlete_id())
  with check (athlete_id = current_athlete_id());
