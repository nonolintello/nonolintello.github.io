import type {
  AppNotification,
  Athlete,
  Club,
  ContentItem,
  RouteSuggestion,
  SportEvent,
} from '../domain/types';
import { addDays, toISODate } from '../analytics/time';
import { mulberry32, phasesFor, range, smoothNoise, type Rng } from './random';

/**
 * The world outside the athlete's own data: content, clubs, events and routes.
 *
 * Static by design — none of it is derived from training, so generating it
 * would add variance without adding realism.
 */
export const CONTENT: ContentItem[] = [
  {
    id: 'content-1',
    title: 'How I went from a 3:45 to a 3:15 marathon',
    authorName: 'Mara Laurent',
    authorId: 'athlete-mara',
    kind: 'video',
    durationLabel: '8:12',
    topic: 'Marathon',
    accent: '#FF5A36',
    dataBacked: true,
    summary:
      'Two years of training, shown as data: weekly mileage, long-run progression and the three workouts that moved the needle.',
  },
  {
    id: 'content-2',
    title: '5 workouts that took my 5K under 20 minutes',
    authorName: 'Inès Kaddouri',
    authorId: 'athlete-ines',
    kind: 'video',
    durationLabel: '6:40',
    topic: 'Speed',
    accent: '#38BDF8',
    dataBacked: true,
    summary: 'Session by session, with the paces and the heart-rate response behind each one.',
  },
  {
    id: 'content-3',
    title: 'How elite runners actually structure recovery',
    authorName: 'Dr. Alice Moreau',
    kind: 'education',
    durationLabel: '11:05',
    topic: 'Recovery',
    accent: '#A78BFA',
    summary: 'Sleep, HRV and the difference between rest and recovery.',
  },
  {
    id: 'content-4',
    title: 'My first Ironman — the whole build',
    authorName: 'Priya Raman',
    authorId: 'athlete-priya',
    kind: 'story',
    durationLabel: '14:22',
    topic: 'Triathlon',
    accent: '#34D399',
    dataBacked: true,
  },
  {
    id: 'content-5',
    title: 'Zone 2 is not as easy as you think',
    authorName: 'Tomás Ferreira',
    authorId: 'athlete-tomas',
    kind: 'article',
    durationLabel: '5 min read',
    topic: 'Training',
    accent: '#FBBF24',
  },
  {
    id: 'content-6',
    title: 'Fuelling a marathon: what I got wrong twice',
    authorName: 'Jonas Beck',
    authorId: 'athlete-jonas',
    kind: 'story',
    durationLabel: '9:30',
    topic: 'Racing',
    accent: '#F87171',
  },
];

export const CLUBS: Club[] = [
  {
    id: 'club-philly-runners',
    name: 'Philadelphia Runners',
    sport: 'running',
    location: 'Philadelphia, PA',
    memberCount: 4821,
    description: 'Tuesday track, Saturday long run from Rittenhouse. All paces.',
    joined: true,
  },
  {
    id: 'club-schuylkill',
    name: 'Schuylkill Banks Striders',
    sport: 'running',
    location: 'Philadelphia, PA',
    memberCount: 1206,
    description: 'River loop regulars. Early mornings, year round.',
  },
  {
    id: 'club-sub3',
    name: 'Sub-3 Project',
    sport: 'running',
    location: 'Global',
    memberCount: 8934,
    description: 'For athletes chasing a sub-three-hour marathon. Workout threads and race reports.',
  },
  {
    id: 'club-trail-north',
    name: 'Wissahickon Trail Club',
    sport: 'trail_running',
    location: 'Philadelphia, PA',
    memberCount: 742,
    description: 'Technical trails, weekly hill sessions, no pace pressure.',
  },
];

const PHILLY = { lat: 39.9526, lon: -75.1652 };

/**
 * Race courses are point-to-point or loops through the city rather than the
 * closed harmonic loops used for routes: a marathon course that reads as a
 * long wandering line is what makes the roadmap feel like a journey.
 */
const courseShape = (seed: number, distanceM: number, origin: { lat: number; lon: number }) => {
  const rng = mulberry32(seed);
  const phases = phasesFor(rng, 4);
  const metresPerDegLat = 111_320;
  const metresPerDegLon = metresPerDegLat * Math.cos((origin.lat * Math.PI) / 180);
  // A loop that never quite closes: out along the river, back through the park.
  const radius = distanceM / (2 * Math.PI) / 1.15;
  const orientation = rng() * Math.PI * 2;
  const sweep = Math.PI * 1.7;
  const lat: number[] = [];
  const lon: number[] = [];
  for (let i = 0; i <= 200; i++) {
    const t = i / 200;
    const angle = orientation + t * sweep;
    const r = radius * (1 + smoothNoise(phases, t * 3) * 0.45);
    lat.push(origin.lat + (Math.sin(angle) * r) / metresPerDegLat);
    lon.push(origin.lon + (Math.cos(angle) * r) / metresPerDegLon);
  }
  return { lat, lon };
};

/**
 * The Philadelphia Marathon course, traced from the official course map:
 * out from the Art Museum through Old City and the river wards, west past
 * Penn, up through Fairmount Park to the half, then the long out-and-back
 * along Kelly Drive to Manayunk and home along the river.
 *
 * Traced in map pixels (1280 × 1508) and projected onto a plausible lat/lon
 * box so it renders through the same path as any GPS course.
 */
const PHILLY_MARATHON_PIXELS: readonly [number, number][] = [
  [720, 1000], [745, 1035], [790, 1100], [890, 1122], [1030, 1148], [1035, 1130], [1120, 1130],
  [1118, 1200], [1116, 1300], [1112, 1400], [1105, 1455], [1065, 1450], [1062, 1370], [1060, 1312],
  [978, 1318], [978, 1250], [980, 1215], [900, 1213], [860, 1212], [760, 1190], [650, 1185],
  [612, 1160], [525, 1160], [525, 1090], [535, 1040], [525, 960], [520, 900], [490, 860],
  [470, 845], [440, 812], [400, 800], [330, 790], [300, 790], [250, 770], [215, 720], [200, 705],
  [230, 690], [285, 685], [320, 715], [360, 760], [385, 790], [455, 808], [495, 800], [545, 800],
  [580, 765], [560, 720], [520, 700], [500, 670], [515, 650], [500, 610], [520, 578], [545, 590],
  [540, 620], [505, 660], [470, 690], [430, 700], [455, 645], [505, 585], [540, 530], [545, 470],
  [540, 420], [520, 370], [485, 300], [430, 275], [390, 240], [330, 200], [270, 150], [230, 110],
  [205, 75], [165, 75], [190, 100], [245, 175], [300, 215], [340, 250], [400, 290], [450, 335],
  [500, 400], [530, 465], [512, 490], [470, 560], [420, 625], [440, 690], [480, 740], [500, 765],
  [530, 800], [545, 830], [600, 880], [650, 910], [670, 935], [700, 965],
];

const tracedCourse = (pixels: readonly [number, number][], origin: { lat: number; lon: number }) => {
  // One map pixel ≈ 9 m at this zoom; the same scale on both axes keeps the
  // traced proportions once the renderer applies its longitude correction.
  const metresPerPixel = 9;
  const metresPerDegLat = 111_320;
  const metresPerDegLon = metresPerDegLat * Math.cos((origin.lat * Math.PI) / 180);
  const cx = 640;
  const cy = 754;
  const lat: number[] = [];
  const lon: number[] = [];
  for (const [x, y] of pixels) {
    lat.push(origin.lat - ((y - cy) * metresPerPixel) / metresPerDegLat);
    lon.push(origin.lon + ((x - cx) * metresPerPixel) / metresPerDegLon);
  }
  return { lat, lon };
};

export const events = (now: Date): SportEvent[] => [
  {
    id: 'event-philly-marathon',
    name: 'Philadelphia Marathon',
    date: toISODate(addDays(now, 73)),
    location: 'Philadelphia, PA',
    distanceM: 42195,
    kind: 'race',
    participantCount: 12400,
    course: tracedCourse(PHILLY_MARATHON_PIXELS, PHILLY),
  },
  {
    id: 'event-broad-street',
    name: 'Broad Street Run',
    date: toISODate(addDays(now, 118)),
    location: 'Philadelphia, PA',
    distanceM: 16093,
    kind: 'race',
    participantCount: 40000,
    course: courseShape(16093, 16093, PHILLY),
  },
  {
    id: 'event-philly-half',
    name: 'Philadelphia Half Marathon',
    date: toISODate(addDays(now, 45)),
    location: 'Philadelphia, PA',
    distanceM: 21097,
    kind: 'race',
    participantCount: 9800,
    course: courseShape(21097, 21097, PHILLY),
  },
  {
    id: 'event-rothman-8k',
    name: 'Rothman 8K',
    date: toISODate(addDays(now, 19)),
    location: 'Philadelphia, PA',
    distanceM: 8000,
    kind: 'race',
    participantCount: 5200,
    course: courseShape(8000, 8000, PHILLY),
  },
  {
    id: 'event-track-night',
    name: 'Summer Track Night',
    date: toISODate(addDays(now, 12)),
    location: 'Franklin Field',
    kind: 'local',
    participantCount: 180,
  },
  {
    id: 'event-trail-series',
    name: 'Wissahickon Trail Series — Race 3',
    date: toISODate(addDays(now, 26)),
    location: 'Wissahickon Valley Park',
    distanceM: 15000,
    kind: 'competition',
    participantCount: 430,
    course: courseShape(15000, 15000, { lat: 40.02, lon: -75.21 }),
  },
];

/**
 * Route shapes are generated the same way activity routes are — a closed loop
 * from a few harmonics — so a suggested route looks like something someone
 * actually ran rather than a drawn squiggle.
 */
const routeShape = (rng: Rng, distanceM: number, origin: { lat: number; lon: number }) => {
  const phases = phasesFor(rng, 3);
  const radius = distanceM / (2 * Math.PI);
  const metresPerDegLat = 111_320;
  const metresPerDegLon = metresPerDegLat * Math.cos((origin.lat * Math.PI) / 180);
  const orientation = rng() * Math.PI * 2;

  const lat: number[] = [];
  const lon: number[] = [];
  for (let i = 0; i <= 160; i++) {
    const t = i / 160;
    const theta = t * Math.PI * 2;
    const r = radius * (1 + smoothNoise(phases, t * 2) * 0.32);
    const angle = theta + orientation;
    lat.push(origin.lat + (Math.sin(angle) * r) / metresPerDegLat);
    lon.push(origin.lon + (Math.cos(angle) * r) / metresPerDegLon);
  }
  return { lat, lon };
};

export const routes = (rng: Rng): RouteSuggestion[] =>
  [
    {
      id: 'route-schuylkill-loop',
      name: 'Schuylkill River Loop',
      sport: 'running' as const,
      distanceM: 13200,
      elevationGainM: 42,
      location: 'Philadelphia, PA',
      popularity: 9840,
    },
    {
      id: 'route-kelly-drive',
      name: 'Kelly Drive Out and Back',
      sport: 'running' as const,
      distanceM: 16000,
      elevationGainM: 65,
      location: 'Philadelphia, PA',
      popularity: 6210,
    },
    {
      id: 'route-wissahickon',
      name: 'Forbidden Drive Trail',
      sport: 'trail_running' as const,
      distanceM: 18500,
      elevationGainM: 240,
      location: 'Wissahickon Valley',
      popularity: 3480,
    },
    {
      id: 'route-fairmount',
      name: 'Fairmount Park Hills',
      sport: 'running' as const,
      distanceM: 11000,
      elevationGainM: 185,
      location: 'Philadelphia, PA',
      popularity: 2115,
    },
  ].map((route) => ({
    ...route,
    shape: routeShape(rng, route.distanceM, {
      lat: PHILLY.lat + range(rng, -0.03, 0.03),
      lon: PHILLY.lon + range(rng, -0.03, 0.03),
    }),
  }));

export interface NotificationFacts {
  /** Percent change in HRV, last 7 days against the previous three weeks. */
  hrvChangePercent: number;
  bestWeekLabel: string;
  recentPrLabel: string | null;
  longRunLabel: string;
  raceName: string;
  raceWeeksAway: number;
}

/**
 * Notification copy is generated from the same numbers the rest of the app
 * shows. Hardcoding "your HRV is down 12%" would eventually contradict the
 * recovery chart two taps away.
 */
export const notifications = (
  now: Date,
  friends: readonly Athlete[],
  recentActivityId: string | undefined,
  facts: NotificationFacts,
): AppNotification[] => {
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
  const [mara, tomas, ines, jonas] = friends;

  return [
    {
      id: 'notif-1',
      kind: 'insight',
      title:
        facts.hrvChangePercent < -2
          ? 'Your recovery is trending down'
          : 'Your recovery is holding steady',
      body:
        facts.hrvChangePercent < -2
          ? `HRV is down ${Math.abs(Math.round(facts.hrvChangePercent))}% against your four-week baseline. Worth an easier session tomorrow.`
          : `HRV is within ${Math.abs(Math.round(facts.hrvChangePercent))}% of your four-week baseline despite the current block.`,
      createdAt: hoursAgo(2),
      read: false,
    },
    {
      id: 'notif-2',
      kind: 'like',
      title: `${ines?.displayName ?? 'Inès'} and 11 others gave you kudos`,
      body: facts.longRunLabel,
      createdAt: hoursAgo(5),
      read: false,
      actorId: ines?.id,
      activityId: recentActivityId,
    },
    {
      id: 'notif-3',
      kind: 'recommendation',
      title: 'Tomorrow’s tempo may be too aggressive',
      body: 'MOOV suggests a 45-minute easy aerobic run instead.',
      createdAt: hoursAgo(9),
      read: false,
    },
    {
      id: 'notif-4',
      kind: 'comment',
      title: `${mara?.displayName ?? 'Mara'} commented on your run`,
      body: '“Splits are so even — textbook pacing.”',
      createdAt: hoursAgo(22),
      read: true,
      actorId: mara?.id,
      activityId: recentActivityId,
    },
    {
      id: 'notif-5',
      kind: 'challenge',
      title: 'Head-to-head: you lead by 2.7 miles',
      body: 'Three days remaining in the weekly challenge.',
      createdAt: hoursAgo(28),
      read: true,
      challengeId: 'ch-head-to-head',
    },
    {
      id: 'notif-6',
      kind: 'personal_record',
      title: facts.recentPrLabel ? 'New personal record' : 'Personal records up to date',
      body: facts.recentPrLabel ?? 'No new records in the last month — the current block is volume-focused.',
      createdAt: hoursAgo(52),
      read: true,
    },
    {
      id: 'notif-7',
      kind: 'follow',
      title: `${tomas?.displayName ?? 'Tomás'} started following you`,
      body: 'Wissahickon Trail Club · 54 km a week',
      createdAt: hoursAgo(70),
      read: true,
      actorId: tomas?.id,
    },
    {
      id: 'notif-8',
      kind: 'race_reminder',
      title: `${facts.raceName} in ${facts.raceWeeksAway} weeks`,
      body: 'Open Training to see race readiness and what is limiting it.',
      createdAt: hoursAgo(96),
      read: true,
    },
    {
      id: 'notif-9',
      kind: 'achievement',
      title: 'Your biggest week of this block',
      body: facts.bestWeekLabel,
      createdAt: hoursAgo(120),
      read: true,
      actorId: jonas?.id,
    },
  ];
};
