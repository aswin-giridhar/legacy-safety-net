import type { BlastResult, ParsedRepo } from "./types";

const FINANCIAL_STORES = new Set(["LEDGER", "ACCOUNT"]);
// interfaces holding PII or financial data — a change touching these needs a data-safety review
const SENSITIVE_RE = /(CUSTOMER|CUST|PERSON|EMPLOYEE|ACCOUNT|LEDGER|PAYMENT|CARD|SSN|STATEMENT|STMT|BALANCE)/i;

// Programs/copybooks that (transitively) depend on `target` — i.e. the things
// that break when `target` changes. Computed by reverse BFS over call+copy edges.
export function blastRadius(repo: ParsedRepo, target: string): BlastResult {
  // parents[x] = nodes that depend on x (callers / includers of x)
  const parents = new Map<string, Set<string>>();
  const fanIn = new Map<string, number>();
  for (const e of repo.edges) {
    if (e.kind !== "call" && e.kind !== "copy") continue;
    if (!parents.has(e.to)) parents.set(e.to, new Set());
    parents.get(e.to)!.add(e.from);
    if (e.kind === "call") fanIn.set(e.to, (fanIn.get(e.to) || 0) + 1);
  }

  const affected: string[] = [];
  const reasons: Record<string, string> = {};
  const pred = new Map<string, string>(); // node -> next hop toward target
  const seen = new Set<string>([target]);
  const queue = [target];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const p of parents.get(cur) || []) {
      if (seen.has(p)) continue;
      seen.add(p);
      pred.set(p, cur);
      affected.push(p);
      queue.push(p);
    }
  }

  // dependency path from each affected node back to the target
  const paths: Record<string, string[]> = {};
  for (const a of affected) {
    const path = [a];
    let c = a;
    while (pred.has(c)) {
      c = pred.get(c)!;
      path.push(c);
    }
    paths[a] = path;
  }

  // interfaces (tables + files) touched across target + blast radius
  const interfaces = new Set<string>();
  const scope = [target, ...affected];
  for (const id of scope) {
    const prog = repo.programs[id];
    if (!prog) continue;
    prog.tablesRead.forEach((t) => interfaces.add(t));
    prog.tablesWritten.forEach((t) => interfaces.add(t));
    prog.files.forEach((t) => interfaces.add(t));
  }

  // high-risk: affected programs that mutate a shared financial store,
  // or that are called from many places (a change fans out widely).
  const highRisk: string[] = [];
  for (const id of affected) {
    const prog = repo.programs[id];
    if (!prog) continue;
    const writesFinancial = prog.tablesWritten.find((t) => FINANCIAL_STORES.has(t));
    const fi = fanIn.get(id) || 0;
    if (writesFinancial) {
      highRisk.push(id);
      reasons[id] = `writes to shared financial store ${writesFinancial}`;
    } else if (fi >= 2) {
      highRisk.push(id);
      reasons[id] = `called from ${fi} places — wide fan-out`;
    } else {
      reasons[id] = `depends on ${paths[id]?.[1] ?? target}`;
    }
  }

  const ifaceList = Array.from(interfaces);
  const sensitive = ifaceList.filter((i) => SENSITIVE_RE.test(i));
  return { target, affected, interfaces: ifaceList, sensitive, highRisk, reasons, paths };
}

// Map a plain-English change request to the most likely target program.
export function resolveTarget(repo: ParsedRepo, request: string): { id: string; score: number; alts: string[] } {
  const tokens = request
    .toLowerCase()
    .replace(/[^a-z0-9%\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));

  const scored = Object.values(repo.programs).map((p) => {
    const hay = `${p.id} ${p.comment}`.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      const bare = t.replace(/%$/, "");
      if (!bare) continue;
      if (p.id.toLowerCase().includes(bare)) score += 3;
      else if (hay.includes(bare)) score += 1;
    }
    return { id: p.id, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0] ?? { id: "VATCALC", score: 0 };
  const alts = scored.filter((s) => s.score > 0 && s.id !== best.id).slice(0, 3).map((s) => s.id);
  return { id: best.score > 0 ? best.id : "VATCALC", score: best.score, alts };
}

const STOP = new Set([
  "add", "the", "new", "and", "for", "with", "make", "change", "into", "from",
  "that", "this", "when", "how", "our", "per", "all", "tier", "rate", "logic",
]);
