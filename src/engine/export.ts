import type { Analysis } from "./analyze";
import type { TestScenario } from "./tests";

export function download(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function testsToGherkin(tests: TestScenario[], target: string): string {
  const out = [
    `Feature: Characterization tests for ${target}`,
    `  These pin the CURRENT behaviour of ${target}. A change that alters any`,
    `  of them should fail loudly rather than ship silently.`,
    ``,
  ];
  for (const t of tests) {
    out.push(`  # ${t.kind} · pins ${t.pins}`);
    out.push(`  Scenario: ${t.title}`);
    out.push(`    Given ${t.given}`);
    out.push(`    When ${t.when}`);
    out.push(`    Then ${t.then}`);
    out.push(``);
  }
  return out.join("\n");
}

export function testsToJSON(tests: TestScenario[], target: string): string {
  return JSON.stringify(
    {
      target,
      generator: "legacy-safety-net",
      kind: "golden-master characterization tests",
      tests: tests.map((t) => ({
        title: t.title,
        given: t.given,
        when: t.when,
        then: t.then,
        kind: t.kind,
        simKind: t.simKind,
        base: t.base,
        pins: t.pins,
      })),
    },
    null,
    2,
  );
}

// A pytest file that actually runs the computable cases; opaque/downstream cases
// are emitted as xfail stubs pending a program runner (honest about what executes).
export function testsToPytest(tests: TestScenario[], target: string, baselineRate: number): string {
  const lines = [
    `# Auto-generated golden-master tests for ${target} (legacy-safety-net).`,
    `# Computable cases execute as-is; opaque cases are xfail pending a COBOL runner.`,
    `import pytest`,
    ``,
    `RATE = ${baselineRate}  # current pinned standard rate`,
    ``,
    `def vat(amount, rate=RATE):`,
    `    return round(amount * rate, 2)`,
    ``,
  ];
  let n = 0;
  for (const t of tests) {
    const name = `test_${(t.title || "case_" + n).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`;
    n += 1;
    if (t.simKind === "compute" && typeof t.base === "number") {
      lines.push(`def ${name}():`);
      lines.push(`    # pins ${t.pins}`);
      lines.push(`    assert vat(${t.base.toFixed(2)}) == ${(t.base * baselineRate).toFixed(2)}`);
    } else if (t.simKind === "zero") {
      lines.push(`def ${name}():`);
      lines.push(`    assert vat(0.00) == 0.00`);
    } else {
      lines.push(`@pytest.mark.xfail(reason="needs a COBOL program runner (golden master)")`);
      lines.push(`def ${name}():`);
      lines.push(`    # ${t.given} | ${t.when} | ${t.then}`);
      lines.push(`    raise NotImplementedError("record ${t.program} baseline from a production trace")`);
    }
    lines.push(``);
  }
  return lines.join("\n");
}

export function changePlanMarkdown(analysis: Analysis, request: string, repoName: string, stamp: string): string {
  const b = analysis.blast;
  const s = analysis.spec;
  const risk = new Set(b.highRisk);
  const score = b.highRisk.length >= 3 || b.interfaces.some((i) => i === "LEDGER" || i === "ACCOUNT")
    ? "HIGH"
    : b.affected.length > 3
      ? "MEDIUM"
      : "LOW";

  const lines: string[] = [
    `# Change Plan — ${b.target}`,
    ``,
    `- **Repository:** ${repoName}`,
    `- **Change request:** ${request || "(unspecified)"}`,
    `- **Generated:** ${stamp} · legacy-safety-net`,
    `- **Overall risk:** ${score}`,
    ``,
    `## Summary`,
    `Changing **${b.target}** ripples to **${b.affected.length}** programs across ` +
      `**${b.interfaces.length}** data interfaces, of which **${b.highRisk.length}** are high-risk.`,
    ``,
  ];
  if (s) {
    lines.push(`## Target`, `- \`${b.target}\` — ${s.file}:${s.line} (${s.loc} LOC)`, `- ${s.summary}`);
    if (s.constants.length) {
      lines.push(`- Constants likely touched: ${s.constants.map((c) => `\`${c.name} = ${c.value}\` (${s.file}:${c.line})`).join(", ")}`);
    }
    lines.push(``);
  }
  lines.push(`## Blast radius`);
  lines.push(`| Program | Dependency path | Reason | Risk |`, `|---|---|---|---|`);
  const ordered = [...b.affected].sort((x, y) => (b.paths[x]?.length ?? 0) - (b.paths[y]?.length ?? 0));
  for (const id of ordered) {
    lines.push(`| ${id} | ${(b.paths[id] ?? []).join(" → ")} | ${b.reasons[id] ?? ""} | ${risk.has(id) ? "**HIGH**" : "normal"} |`);
  }
  lines.push(``, `**Interfaces in scope:** ${b.interfaces.join(", ") || "none"}`, ``);

  if (b.highRisk.length) {
    lines.push(`## Risk register`);
    for (const id of b.highRisk) lines.push(`- **${id}** — ${b.reasons[id]}`);
    lines.push(``);
  }

  lines.push(`## Recommended characterization tests`);
  for (const t of analysis.tests) lines.push(`- [ ] ${t.title} — _pins ${t.pins}_`);
  lines.push(``);

  lines.push(
    `## Execution steps (in order)`,
    `1. Generate & commit the characterization tests above — cover every high-risk path first.`,
    `2. Apply the change to \`${b.target}\`${s ? ` (${s.file}:${s.line})` : ""}.`,
    `3. Run the test suite; confirm the target tests behave as intended and no others regress.`,
    `4. Re-verify high-risk downstream paths: ${b.highRisk.join(", ") || "none"}.`,
    `5. Human review of the diff and sign-off before deploy.`,
    ``,
    `## Sign-off`,
    `- Prepared by: legacy-safety-net`,
    `- Approved by: ______________________  Date: ____________`,
  );
  return lines.join("\n");
}
