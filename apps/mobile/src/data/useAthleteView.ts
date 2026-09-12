import { useEffect, useState } from 'react';
import {
  buildAthleteProfile,
  buildRoadmap,
  type Activity,
  type Athlete,
  type AthleteProfile,
  type Insight,
  type PlannedWorkout,
  type Race,
  type Roadmap,
  type TrainingPlan,
} from '@ai/core';
import { useApp } from './store';

export interface AthleteView {
  athlete: Athlete;
  activities: Activity[];
  profile: AthleteProfile;
  races: Race[];
  plan: PlannedWorkout[];
  plans: TrainingPlan[];
  roadmap: Roadmap;
  insights: Insight[];
}

/**
 * Everything MOOV knows about one athlete, assembled the same way the athlete's
 * own Intelligence tab assembles it. The coach sees exactly what the athlete
 * sees — same profile, same insights, same roadmap — which is the point: the
 * coach coaches from MOOV's understanding, not from a separate, thinner view.
 *
 * `version` forces a reload after the coach changes the plan.
 */
export const useAthleteView = (athleteId: string | undefined, version = 0): AthleteView | null => {
  const { repository, insightProvider, events } = useApp();
  const [view, setView] = useState<AthleteView | null>(null);

  useEffect(() => {
    if (!athleteId) return;
    let cancelled = false;
    (async () => {
      const athlete = await repository.getAthlete(athleteId);
      if (!athlete) return;
      const [activities, races, plan, plans, wellness, objectives, block] = await Promise.all([
        repository.getActivities(athleteId),
        repository.getRaces(athleteId),
        repository.getPlan(athleteId),
        repository.getPlans(athleteId),
        repository.getWellness(athleteId),
        repository.getObjectives(athleteId),
        repository.getCurrentBlock(athleteId),
      ]);
      const now = new Date();
      const profile = buildAthleteProfile(athlete, activities, null, now, { races, wellness, objectives });
      const roadmap = buildRoadmap({
        profile,
        activities,
        plan,
        races,
        block,
        events,
        now,
        unit: athlete.unitPreference,
      });
      const insights = await insightProvider.generateWeeklyInsights({ profile });
      if (cancelled) return;
      setView({ athlete, activities, profile, races, plan, plans, roadmap, insights });
    })();
    return () => {
      cancelled = true;
    };
  }, [athleteId, version, repository, insightProvider, events]);

  return view;
};
