import { SAMPLE_FILES, SAMPLE_NAME, type SourceFile } from "../sample/cbsa";
import { parseRepo } from "./parser";
import { blastRadius, resolveTarget } from "./graph";
import { generateSpec, type Spec } from "./spec";
import { generateTests, type TestScenario } from "./tests";
import type { ParsedRepo, BlastResult } from "./types";

let _sample: ParsedRepo | null = null;

export function getRepo(): ParsedRepo {
  if (!_sample) _sample = parseRepo(SAMPLE_FILES, SAMPLE_NAME);
  return _sample;
}

// Parse an arbitrary set of uploaded files into a fresh repo.
export function parseFiles(files: SourceFile[], name: string): ParsedRepo {
  return parseRepo(files, name);
}

export interface Analysis {
  target: string;
  resolvedScore: number;
  alternatives: string[];
  blast: BlastResult;
  spec: Spec | null;
  tests: TestScenario[];
}

export function analyzeRequest(request: string, repo: ParsedRepo = getRepo()): Analysis {
  const { id, score, alts } = resolveTarget(repo, request);
  return analyzeTarget(id, repo, { score, alts });
}

export function analyzeTarget(
  id: string,
  repo: ParsedRepo = getRepo(),
  meta?: { score: number; alts: string[] },
): Analysis {
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
