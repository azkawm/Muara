/**
 * The pool quotes linear annual rates in RAY. Display them as APY with continuous
 * compounding, which is what a position earns when interest accrues every block.
 */
export function rayToApy(ray: bigint | undefined): number {
  if (!ray) return 0;
  return Math.expm1(Number(ray) / 1e27);
}

export function rayToFraction(ray: bigint | undefined): number {
  if (!ray) return 0;
  return Number(ray) / 1e27;
}
