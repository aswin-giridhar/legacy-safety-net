// Optional LLM enhancement layer. Everything here is best-effort: if there is
// no API key, or the call fails, callers fall back to the deterministic engine.
// The key is user-provided at runtime (stored locally) and never bundled.

import type { ParsedRepo } from "./types";
import type { Spec } from "./spec";

const KEY_LS = "lsn.anthropic.key";
const MODEL = "claude-haiku-4-5-20251001";

export function getKey(): string {
  try {
    return localStorage.getItem(KEY_LS) || "";
  } catch {
    return "";
  }
}
export function setKey(k: string) {
  try {
    if (k) localStorage.setItem(KEY_LS, k);
    else localStorage.removeItem(KEY_LS);
  } catch {
    /* ignore */
  }
}
export function hasKey(): boolean {
  return getKey().length > 10;
}

async function callClaude(system: string, user: string, maxTokens = 400): Promise<string | null> {
  const key = getKey();
  if (!key) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.content?.[0]?.text;
    return typeof text === "string" ? text.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Fuzzier request → target than keyword matching. Returns a known program id or null.
export async function llmResolveTarget(repo: ParsedRepo, request: string): Promise<{ id: string; reason: string } | null> {
  const list = Object.values(repo.programs)
    .map((p) => `${p.id}: ${p.comment}`)
    .join("\n");
  const out = await callClaude(
    "You map a plain-English change request to exactly one COBOL program that must change. Reply with ONLY a JSON object {\"id\":\"PROGID\",\"reason\":\"<8 words\"}. The id MUST be one of the listed program ids.",
    `Programs:\n${list}\n\nChange request: "${request}"`,
    120,
  );
  if (!out) return null;
  try {
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    const id = String(parsed.id || "").toUpperCase();
    if (repo.programs[id]) return { id, reason: String(parsed.reason || "matched by AI") };
  } catch {
    /* ignore */
  }
  return null;
}

// Richer plain-English spec prose, grounded in the actual source (no invention).
export async function llmSpecProse(repo: ParsedRepo, spec: Spec): Promise<string | null> {
  const prog = repo.programs[spec.id];
  if (!prog) return null;
  return callClaude(
    "You document legacy COBOL for an engineer about to change it. In 2-3 sentences, plainly explain what the program does and the single biggest risk when changing it. Use ONLY facts visible in the source. Do not invent behaviour, tables, or numbers. No preamble.",
    `Program ${spec.id} (${spec.file}):\n\n${prog.source}`,
    260,
  );
}
