import { MIN } from './time';
import type { Snapshot, ZoneId, ZoneStep } from './types';

/** The forecast as the screens consume it: only the steps from "now" onward. */
export interface View {
  /** Start of each remaining 15-minute bucket; index 0 contains "now". */
  steps: number[];
  byZone: Record<ZoneId, ZoneStep[]>;
  stepMs: number;
}

/** Index of the forecast step containing `now` (above zero for an older saved snapshot). */
export function currentStep(snapshot: Snapshot, now: number): number {
  const stepMs = snapshot.forecast.stepMin * MIN;
  return Math.max(0, Math.floor((now - snapshot.forecast.steps[0]) / stepMs));
}

/** Returns `null` once a saved snapshot has run out of forecast. */
export function buildView(snapshot: Snapshot, nowIdx: number): View | null {
  const steps = snapshot.forecast.steps.slice(nowIdx);
  if (steps.length === 0) return null;
  const byZone = {} as Record<ZoneId, ZoneStep[]>;
  for (const zone of snapshot.forecast.zones) byZone[zone.zoneId] = zone.steps.slice(nowIdx);
  return { steps, byZone, stepMs: snapshot.forecast.stepMin * MIN };
}
