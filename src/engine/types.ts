export type NodeKind = "program" | "copybook" | "table" | "file";
export type EdgeKind = "call" | "copy" | "reads" | "writes";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  file?: string; // source path (for program/copybook)
  line?: number; // 1-based line of PROGRAM-ID / definition
  loc?: number; // lines of code
  comment?: string; // leading business comment, for the spec
}

export interface Provenance {
  file: string;
  line: number; // 1-based
  text: string; // the exact source line
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  prov: Provenance;
}

export interface Program {
  id: string;
  file: string;
  line: number;
  loc: number;
  comment: string;
  source: string;
  calls: Provenance[]; // resolved by target below via edges
  paragraphs: { name: string; line: number }[];
  tablesRead: string[];
  tablesWritten: string[];
  files: string[];
  copies: string[];
}

export interface ParsedRepo {
  nodes: GraphNode[];
  edges: GraphEdge[];
  programs: Record<string, Program>;
  fileCount: number;
  loc: number;
}

export interface BlastResult {
  target: string;
  affected: string[]; // program/copybook ids that transitively depend on target
  interfaces: string[]; // tables + files touched across the blast radius
  highRisk: string[]; // subset of affected flagged high-risk
  reasons: Record<string, string>; // id -> why it's affected / risky
  paths: Record<string, string[]>; // id -> shortest dependency path to target
}
