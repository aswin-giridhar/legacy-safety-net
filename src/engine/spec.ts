import type { ParsedRepo, Provenance } from "./types";

export interface SpecCitation {
  claim: string;
  file: string;
  line: number;
  text: string;
}

export interface Spec {
  id: string;
  file: string;
  line: number;
  loc: number;
  summary: string;
  purpose: string[];
  citations: SpecCitation[];
  constants: { name: string; value: string; line: number }[];
  onboarding: string; // plain-English "new here? before you touch it…" brief
}

// Build a plain-English spec purely from parsed structure — every claim is
// anchored to a real file:line so nothing is "hallucinated".
export function generateSpec(repo: ParsedRepo, id: string): Spec | null {
  const prog = repo.programs[id];
  if (!prog) return null;

  const cite = (claim: string, p: Provenance): SpecCitation => ({
    claim,
    file: p.file,
    line: p.line,
    text: p.text,
  });

  const citations: SpecCitation[] = [];
  const purpose: string[] = [];

  for (const c of prog.calls) {
    const target = c.text.match(/CALL\s+['"]([A-Z0-9-]+)['"]/i)?.[1]?.toUpperCase() ?? "?";
    purpose.push(`Invokes ${target} to delegate part of its work.`);
    citations.push(cite(`Calls ${target}`, c));
  }

  const dataEdges = repo.edges.filter((e) => e.from === id && (e.kind === "reads" || e.kind === "writes"));
  for (const e of dataEdges) {
    const verb = e.kind === "writes" ? "Writes to" : "Reads from";
    const kind = repo.nodes.find((n) => n.id === e.to)?.kind === "file" ? "file" : "table";
    purpose.push(`${verb} the ${e.to} ${kind}.`);
    citations.push(cite(`${verb} ${e.to}`, e.prov));
  }

  for (const cp of prog.copies) {
    const n = repo.nodes.find((x) => x.id === cp);
    purpose.push(`Includes copybook ${cp}${n?.comment ? ` — ${n.comment.toLowerCase()}` : ""}.`);
  }

  // business constants (e.g. the VAT rate literal), extracted with provenance
  const constants: Spec["constants"] = [];
  prog.source.split("\n").forEach((raw, i) => {
    // capture only the numeric literal, NOT a following COBOL statement terminator '.'
    const m = raw.match(/^\s*\d\d\s+([A-Z0-9-]+)\b.*\bVALUE\s+([0-9]+(?:\.[0-9]+)?)/i);
    if (m) {
      constants.push({ name: m[1].toUpperCase(), value: m[2], line: i + 1 });
      citations.push({ claim: `Constant ${m[1].toUpperCase()} = ${m[2]}`, file: prog.file, line: i + 1, text: raw.trim() });
    }
  });

  // knowledge-transfer brief for a new engineer (the retiring-COBOL-expert problem)
  const watch: string[] = [];
  const writes = dataEdges.filter((e) => e.kind === "writes").map((e) => e.to);
  if (writes.length) watch.push(`it writes to ${writes.join(", ")} — changes here alter stored data`);
  if (constants.length) watch.push(`the ${constants.map((c) => c.name).join(", ")} business rule${constants.length > 1 ? "s live" : " lives"} here`);
  if (prog.calls.length) watch.push(`it delegates to ${prog.calls.length} program${prog.calls.length > 1 ? "s" : ""} — follow the graph before editing`);
  const onboarding = watch.length ? `Before you touch it: ${watch.join("; ")}.` : "";

  return {
    id,
    file: prog.file,
    line: prog.line,
    loc: prog.loc,
    summary: prog.comment || "No leading documentation found in source.",
    purpose,
    citations,
    constants,
    onboarding,
  };
}
