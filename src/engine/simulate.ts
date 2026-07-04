import type { TestScenario } from "./tests";

export type SimStatus = "pass" | "fail" | "stale";

export interface SimResult {
  status: SimStatus;
  expected: string;
  actual: string;
}

// Re-evaluate each characterization test against a proposed new constant value.
// - compute tests recompute exactly (base * rate) → pass if unchanged, else FAIL
// - zero-boundary tests are invariant to the rate → always pass (a nice nuance)
// - opaque / downstream tests can't be evaluated statically → STALE ("must re-run")
export function simulate(tests: TestScenario[], baselineRate: number, newRate: number): SimResult[] {
  const changed = Math.abs(newRate - baselineRate) > 1e-9;
  return tests.map((t) => {
    if (t.simKind === "compute") {
      const base = t.base ?? 0;
      const expected = base * baselineRate;
      const actual = base * newRate;
      return {
        status: Math.abs(actual - expected) < 0.005 ? "pass" : "fail",
        expected: expected.toFixed(2),
        actual: actual.toFixed(2),
      };
    }
    if (t.simKind === "zero") {
      return { status: "pass", expected: "0.00", actual: "0.00" };
    }
    return changed
      ? { status: "stale", expected: "recorded baseline", actual: "must re-run" }
      : { status: "pass", expected: "recorded baseline", actual: "recorded baseline" };
  });
}

export function simSummary(results: SimResult[]): { fail: number; stale: number; pass: number } {
  return results.reduce(
    (a, r) => ({ ...a, [r.status]: a[r.status] + 1 }),
    { fail: 0, stale: 0, pass: 0 },
  );
}

// The concrete source edit a simulated change implies — a real diff to approve.
export function rateDiff(sourceLine: string | undefined, oldValue: string, newRate: number): { before: string; after: string } | null {
  if (!sourceLine) return null;
  const decimals = (oldValue.split(".")[1] || "").length || 3;
  const newStr = newRate.toFixed(decimals);
  if (newStr === oldValue) return null;
  const before = sourceLine.trim();
  const after = before.replace(oldValue, newStr);
  if (after === before) return null;
  return { before, after };
}
