import type { BlastResult, ParsedRepo } from "./types";

export interface TestScenario {
  program: string;
  title: string;
  given: string;
  when: string;
  then: string;
  pins: string; // what behavior this locks in
  kind: "target" | "boundary" | "regression";
  // simulation model: how this test reacts when the target constant is changed
  simKind: "compute" | "zero" | "needs-run";
  base?: number; // base amount for `compute` tests (expected = base * rate)
}

// Generate characterization ("golden master") test scaffolds: they capture
// the CURRENT behavior so any change that alters it fails loudly.
export function generateTests(repo: ParsedRepo, blast: BlastResult): TestScenario[] {
  const out: TestScenario[] = [];
  const t = blast.target;
  const prog = repo.programs[t];

  // Constant-driven behavior on the target (e.g. the VAT rate)
  const rate = prog?.source.match(/VAT-RATE\s+PIC[^V]*V?[9]*\s+VALUE\s+([0-9.]+)/i)?.[1];
  if (rate) {
    const pct = Math.round(parseFloat(rate) * 100);
    out.push({
      program: t,
      title: `${t}: standard rate holds at ${pct}%`,
      given: `LK-LINE-AMOUNT = 100.00, LK-CURRENCY = 'GBP'`,
      when: `${t} is called`,
      then: `LK-VAT-AMOUNT = ${(100 * parseFloat(rate)).toFixed(2)}`,
      pins: `the current ${pct}% standard rate — the exact value a change is likely to touch`,
      kind: "target",
      simKind: "compute",
      base: 100,
    });
    out.push({
      program: t,
      title: `${t}: zero amount yields zero tax`,
      given: `LK-LINE-AMOUNT = 0.00, LK-CURRENCY = 'GBP'`,
      when: `${t} is called`,
      then: `LK-VAT-AMOUNT = 0.00`,
      pins: `the boundary at zero — guards against divide/rounding regressions`,
      kind: "boundary",
      simKind: "zero",
      base: 0,
    });
    if (prog?.calls.some((c) => /FXRATE/i.test(c.text))) {
      out.push({
        program: t,
        title: `${t}: foreign currency is normalised before tax`,
        given: `LK-LINE-AMOUNT = 100.00, LK-CURRENCY = 'USD'`,
        when: `${t} is called (exercises FXRATE)`,
        then: `LK-VAT-AMOUNT = round(FXRATE(USD→GBP, 100.00) * ${rate}, 2)`,
        pins: `the currency-normalisation path — a common source of silent drift`,
        kind: "boundary",
        simKind: "needs-run",
      });
    }
  } else if (prog) {
    out.push({
      program: t,
      title: `${t}: record current output as golden master`,
      given: `representative inputs captured from a production trace`,
      when: `${t} is called`,
      then: `outputs and side-effects match the recorded baseline byte-for-byte`,
      pins: `whatever ${t} does today, before you touch it`,
      kind: "target",
      simKind: "needs-run",
    });
  }

  // One regression test per high-risk downstream program — the ones most
  // likely to break silently when the target changes.
  const covered = new Set([t]);
  for (const id of blast.highRisk) {
    if (covered.has(id)) continue;
    covered.add(id);
    const p = repo.programs[id];
    const store = p?.tablesWritten[0];
    out.push({
      program: id,
      title: `${id}: end-to-end value is unchanged`,
      given: `a fixed transaction fixture through ${id}`,
      when: `${id} runs the ${blast.paths[id]?.join(" → ") ?? id} path`,
      then: store
        ? `the row written to ${store} matches the baseline (amount, VAT, balance)`
        : `the produced output matches the baseline`,
      pins: `the downstream financial result — ${blast.reasons[id] ?? "high blast-radius"}`,
      kind: "regression",
      simKind: "needs-run",
    });
  }

  return out;
}
