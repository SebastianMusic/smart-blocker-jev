export type Decision = "block" | "allow";

/** Pages jev scores below the threshold are blocked; at or above it they are allowed. */
export function decide(noul: number, threshold: number): Decision {
  return noul < threshold ? "block" : "allow";
}

/** The rule behind a block, phrased for the blocked page. */
export function thresholdRule(threshold: number): string {
  return `pages below ${Math.round(threshold * 100)}% are blocked`;
}
