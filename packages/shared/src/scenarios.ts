/**
 * Price scenarios for the admin panel. Moves are relative to the anchor price
 * (the "normal" price, $150 by default) so every run of the demo lands on the same numbers.
 */
export type ScenarioId = "miss" | "beat" | "weekendGap" | "reset";

export interface ScenarioDef {
  id: ScenarioId;
  label: string;
  /** Percent change from the anchor; 0 for reset. */
  changePct: number;
  /** Gradual moves step over the configured duration; gaps jump in one update. */
  mode: "gradual" | "gap";
  description: string;
}

export const SCENARIOS: Record<ScenarioId, ScenarioDef> = {
  miss: {
    id: "miss",
    label: "Earnings miss",
    changePct: -20,
    mode: "gradual",
    description: "Price slides 20% below the anchor over the scenario duration.",
  },
  beat: {
    id: "beat",
    label: "Earnings beat",
    changePct: 25,
    mode: "gradual",
    description: "Price climbs 25% above the anchor over the scenario duration.",
  },
  weekendGap: {
    id: "weekendGap",
    label: "Weekend gap",
    changePct: -12,
    mode: "gap",
    description: "Price gaps 12% down in a single update, like a Monday open after bad weekend news.",
  },
  reset: {
    id: "reset",
    label: "Reset",
    changePct: 0,
    mode: "gradual",
    description: "Price returns to the anchor.",
  },
};

export const SCENARIO_IDS = Object.keys(SCENARIOS) as ScenarioId[];
