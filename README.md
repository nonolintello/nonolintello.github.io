# MOOV

An intelligent social platform for athletes.

Not "what did I do?" but **what is happening to me, what should I do about it,
what are the people around me doing, and what else can I explore?**

Running first, with a generalised activity model so other endurance sports can
be added without a rewrite.

## The four tabs

The product is built as a loop, not a set of features:

| Tab | Question | What it does |
| --- | --- | --- |
| **Intelligence** | What is happening to me? | Athlete status, fitness/recovery/fatigue/load, proactive insights, race readiness, goal projections, Ask MOOV |
| **Training** | What should I do about it? | Roadmap to the goal race, today's session, calendar, adaptive recommendations |
| **Community** | What are people around me doing? | Feed with real context, challenges, leaderboards, athlete profiles |
| **Discover** | What else can I explore? | Creators, athletes, clubs, events, routes |

Profile, search and notifications are global — reached from the header, not the
tab bar. Logging an activity is an action, so it lives behind the "+" rather
than occupying a fifth of the navigation.

## Getting started

```bash
npm install
npm test          # analytics engine
npm run typecheck # both packages
npm run mobile    # Expo dev server (i for iOS simulator, w for browser)
```

## Layout

```
packages/core     Athlete data layer — pure TypeScript, no dependencies
apps/mobile       Expo Router app — iOS first, Android and web from one codebase
db/migrations     Postgres schema with row-level security
.github/workflows Deploy the web build to GitHub Pages
```

### `packages/core` — the defensible part

```
domain/       Types and unit handling
analytics/    Best efforts, training load, fitness/recovery, scoring,
              goals, race readiness, coaching, activity context, XP
insights/     The InsightProvider port and its implementations
ports/        AthleteRepository — the seam to storage
demo/         Physiological run simulator and a six-month athlete
```

The pipeline everything is built around:

```
Activity data → Analytics engine → Athlete profile → Insight provider → User insight
```

`buildAthleteProfile()` produces the single structured object every screen and
every insight generator reads. Nothing downstream touches raw activity rows.
That boundary is what makes the language model swappable — it receives the
profile, never the database.

## Decisions worth knowing

**Scoring rewards improvement, not genetics.** Each dimension blends an absolute
band (35%) with progress against the athlete's own past (65%). A beginner
improving quickly out-scores a plateaued fast runner, and consistency plus
progression carry half the overall weight. Enforced by tests, not convention.

**Volume is not rewarded without limit.** The weekly volume component peaks
between 1.0× and 1.3× the athlete's own four-week baseline and *declines* above
1.6×. The score should never push someone toward the ramp rate that injures them.

**XP resists grinding.** Activity XP is square-root scaled in duration and capped
per day, so junk mileage and split uploads earn nothing extra. Every event
carries a dedup key, so replaying the ledger after a re-import cannot inflate a
total.

**Predictions are never dressed as facts.** Every insight is typed `fact`,
`metric`, `prediction` or `recommendation`, and the UI renders each differently.
Every insight carries the evidence it came from — tap "show the numbers".

**Race projections use the best effort, not the nearest.** Long "records" are
routinely set during easy long runs, so a 21 km best effort from a conversational
Sunday would drag a marathon projection an hour slow. Projecting from whichever
distance yields the fastest estimate is the honest reading of potential.

**Records are found, not filed.** Best efforts come from a sliding window over
the distance stream, so a 5K PR set mid-way through a 10-mile run counts.
Detection replays chronologically, so a backfilled import lands in the right
place in history rather than looking like today's breakthrough.

**Recovery is measured against yourself.** HRV means nothing between people, so
every component is scored against the athlete's own baseline. Wellness data in
the demo responds to training — HRV falls and resting heart rate rises after
hard sessions — because otherwise every insight drawn from it would be fiction.

**Trends ignore the current week.** It is always partial. Including it would
report a decline every Monday morning as an artefact of the clock.

**Community context is comparative.** "Ran 8 miles" is something any app can
render. "First run back after nine days", "fastest 10K this year", "biggest week
in two months" require knowing the athlete's history — which is the whole point.

**Privacy is enforced in the database.** Activity visibility lives in row-level
security policies, not only in application code. Route traces are trimmed at
both ends before rendering for anyone but the owner.

## Current state

**Working end to end** — all four tabs, activity detail with interactive charts
and splits, profile, notifications, global search, manual logging, the full
analytics engine, and deterministic insight generation over a generated
six-month athlete (David Hart, building toward a sub-3 Philadelphia Marathon).

**Deliberately deferred** — the app runs against an in-memory `DemoRepository`
implementing `AthleteRepository`. The Postgres schema is written and ready; the
swap is one adapter. Auth, real provider imports (Garmin, COROS, Apple Health,
WHOOP) and the Claude-backed `LlmInsightProvider` are scaffolded at their seams
but not wired to live services.

**Not a real map.** Routes render as normalised SVG traces rather than map tiles
— no API key, no network round-trip, identical on every platform. A tile
provider can sit behind `RouteMap` without touching the screens.

## Deploying the demo

Pushing to `main` builds and publishes the web app to GitHub Pages. The workflow
runs the tests and typecheck first, so a broken projection never reaches a link
someone has been sent.

`EXPO_BASE_URL` is set from the repository name, because project sites are served
from `/<repo>/` while expo-router emits absolute paths. `404.html` is a copy of
`index.html` so client-side routes survive a refresh or a shared deep link.

## Verifying changes

The analytics engine is covered by tests. For the UI, the web build is the
fastest full check — it catches every resolution and bundling error without a
simulator:

```bash
cd apps/mobile && npx expo export --platform web --output-dir /tmp/web
```
