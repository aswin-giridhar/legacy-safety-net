import { SAMPLE_FILES, SAMPLE_NAME } from "../sample/cbsa";
import { parseRepo } from "./parser";
import { blastRadius, resolveTarget } from "./graph";
import { generateSpec, type Spec } from "./spec";
import { generateTests, type TestScenario } from "./tests";
import type { BlastResult, ParsedRepo } from "./types";

let _repo: ParsedRepo | null = null;
export function getRepo(): ParsedRepo {
  if (!_repo) _repo = parseRepo(SAMPLE_FILES);
  return _repo;
}
export const repoName = SAMPLE_NAME;

export interface Analysis {
  target: string;
  resolvedScore: number;
  alternatives: string[];
  blast: BlastResult;
  spec: Spec | null;
  tests: TestScenario[];
}

export function analyzeRequest(request: string): Analysis {
  const repo = getRepo();
  const { id, score, alts } = resolveTarget(repo, request);
  return analyzeTarget(id, { score, alts });
}

export function analyzeTarget(id: string, meta?: { score: number; alts: string[] }): Analysis {
  const repo = getRepo();
  const blast = blastRadius(repo, id);
  return {
    target: id,
    resolvedScore: meta?.score ?? 0,
    alternatives: meta?.alts ?? [],
    blast,
    spec: generateSpec(repo, id),
    tests: generateTests(repo, blast),
  };
}
