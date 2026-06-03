/**
 * Cohort assignment. CURRENTLY EVERYONE is in the `hypothesis` cohort (TREATMENT_FRACTION = 1) —
 * the feature is on for all users. The control/holdout machinery is kept so you can later run an
 * A/B test (does it beat content-blind nudges?) by lowering TREATMENT_FRACTION below 1.
 * See HYPOTHESIS_NUDGE_ENGINE.md §9.
 */

/** Bump to re-randomize the split (only matters if TREATMENT_FRACTION < 1). */
export const EXPERIMENT_SALT = "hypothesis-v1";

/** Fraction of users in the hypothesis (treatment) cohort. 1 = everyone (holdout disabled);
 * set e.g. 0.5 to re-enable an even A/B split with a content-blind control group. */
export const TREATMENT_FRACTION = 1;

export type Cohort = "control" | "hypothesis";

/** djb2 string hash -> uint32. Deterministic, no RNG (stable across runs/processes). */
function hash(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

/** Stable per-user cohort assignment. Same user always lands in the same cohort. */
export function assignCohort(userId: string): Cohort {
  const bucket = (hash(`${userId}:${EXPERIMENT_SALT}`) % 1000) / 1000; // [0,1)
  return bucket < TREATMENT_FRACTION ? "hypothesis" : "control";
}

export type Proportion = { n: number; successes: number };
export type Comparison = {
  controlRate: number;
  treatmentRate: number;
  absoluteLift: number;
  relativeLiftPct: number;
  z: number;
  /** Two-sided significance at ~95% (|z| > 1.96). */
  significant: boolean;
};

/**
 * Two-proportion z-test comparing a treatment rate against control (e.g. retention, self-reported
 * helpfulness, "wrote a longer entry"). Pure. Returns z=0 when undefined (empty groups).
 */
export function compareProportions(control: Proportion, treatment: Proportion): Comparison {
  const p1 = control.n > 0 ? control.successes / control.n : 0;
  const p2 = treatment.n > 0 ? treatment.successes / treatment.n : 0;
  const absoluteLift = p2 - p1;
  const relativeLiftPct = p1 > 0 ? (absoluteLift / p1) * 100 : 0;

  let z = 0;
  if (control.n > 0 && treatment.n > 0) {
    const pPool = (control.successes + treatment.successes) / (control.n + treatment.n);
    const se = Math.sqrt(pPool * (1 - pPool) * (1 / control.n + 1 / treatment.n));
    z = se > 0 ? absoluteLift / se : 0;
  }

  return {
    controlRate: p1,
    treatmentRate: p2,
    absoluteLift,
    relativeLiftPct,
    z,
    significant: Math.abs(z) > 1.96,
  };
}
