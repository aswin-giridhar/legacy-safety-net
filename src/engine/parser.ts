import type { SourceFile } from "../sample/cbsa";
import type { GraphEdge, GraphNode, ParsedRepo, Program, Provenance } from "./types";

const isComment = (line: string) => /^\s{0,6}\*/.test(line) || /^\s*\*>/.test(line);

// Pull the leading block comment (the business description) of a program.
function leadingComment(lines: string[], pidLine: number): string {
  const out: string[] = [];
  // scan a window after PROGRAM-ID for a comment block
  for (let i = pidLine; i < Math.min(pidLine + 8, lines.length); i++) {
    const l = lines[i];
    if (isComment(l)) {
      const t = l.replace(/^\s*\*[>=-]?\s?/, "").replace(/[*=-]+$/, "").trim();
      if (t) out.push(t);
    }
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

export function parseRepo(files: SourceFile[]): ParsedRepo {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const programs: Record<string, Program> = {};
  let totalLoc = 0;

  const ensure = (id: string, kind: GraphNode["kind"]): GraphNode => {
    let n = nodes.get(id);
    if (!n) {
      n = { id, kind };
      nodes.set(id, n);
    }
    // upgrade an inferred stub (e.g. a CALL target) to a real program later
    return n;
  };

  for (const f of files) {
    const lines = f.content.split("\n");
    totalLoc += lines.length;

    const pidIdx = lines.findIndex((l) => /PROGRAM-ID\./i.test(l));
    const copyIdx = f.path.toLowerCase().endsWith(".cpy");

    if (copyIdx) {
      const id = f.path.split("/").pop()!.replace(/\.cpy$/i, "").toUpperCase();
      const n = ensure(id, "copybook");
      n.file = f.path;
      n.line = 1;
      n.loc = lines.length;
      n.comment = leadingComment(lines, 0) || "Shared data definitions.";
      continue;
    }

    if (pidIdx === -1) continue;
    const pid = lines[pidIdx].match(/PROGRAM-ID\.\s+([A-Z0-9-]+)/i)?.[1]?.toUpperCase();
    if (!pid) continue;

    const node = ensure(pid, "program");
    node.file = f.path;
    node.line = pidIdx + 1;
    node.loc = lines.length;
    node.comment = leadingComment(lines, pidIdx);

    const prog: Program = {
      id: pid,
      file: f.path,
      line: pidIdx + 1,
      loc: lines.length,
      comment: node.comment || "",
      source: f.content,
      calls: [],
      paragraphs: [],
      tablesRead: [],
      tablesWritten: [],
      files: [],
      copies: [],
    };

    let inProc = false;
    let sql: { text: string; startLine: number } | null = null;

    lines.forEach((raw, i) => {
      const line = raw;
      const ln = i + 1;
      const prov = (): Provenance => ({ file: f.path, line: ln, text: line.trim() });

      if (/PROCEDURE\s+DIVISION/i.test(line)) inProc = true;
      if (isComment(line)) return;

      // COPY
      const copy = line.match(/\bCOPY\s+([A-Z0-9-]+)/i);
      if (copy) {
        const cid = copy[1].toUpperCase();
        ensure(cid, "copybook");
        edges.push({ from: pid, to: cid, kind: "copy", prov: prov() });
        prog.copies.push(cid);
      }

      // CALL 'PROG'
      const call = line.match(/\bCALL\s+['"]([A-Z0-9-]+)['"]/i);
      if (call) {
        const cid = call[1].toUpperCase();
        ensure(cid, "program");
        edges.push({ from: pid, to: cid, kind: "call", prov: prov() });
        prog.calls.push(prov());
      }

      // paragraphs (a label in the procedure division, alone on the line ending with '.')
      if (inProc) {
        const para = line.match(/^\s{7}([A-Z0-9][A-Z0-9-]+)\.\s*$/i);
        if (para && !/DIVISION|SECTION/i.test(para[1])) {
          prog.paragraphs.push({ name: para[1].toUpperCase(), line: ln });
        }
      }

      // file SELECT ... ASSIGN TO dd
      const sel = line.match(/SELECT\s+[A-Z0-9-]+\s+ASSIGN\s+TO\s+([A-Z0-9-]+)/i);
      if (sel) {
        const dd = sel[1].toUpperCase();
        ensure(dd, "file");
        edges.push({ from: pid, to: dd, kind: "reads", prov: prov() });
        prog.files.push(dd);
      }

      // SQL block accumulation
      if (/EXEC\s+SQL/i.test(line)) sql = { text: "", startLine: ln };
      if (sql) {
        sql.text += " " + line;
        if (/END-EXEC/i.test(line)) {
          const t = sql.text;
          const write = /\b(INSERT|UPDATE|DELETE|MERGE)\b/i.test(t);
          const tableRe = /\b(?:FROM|INTO|UPDATE|JOIN|DELETE\s+FROM)\s+([A-Z][A-Z0-9_-]*)/gi;
          let m: RegExpExecArray | null;
          const seen = new Set<string>();
          while ((m = tableRe.exec(t))) {
            const tbl = m[1].toUpperCase();
            if (tbl === "FROM" || seen.has(tbl)) continue;
            seen.add(tbl);
            ensure(tbl, "table");
            edges.push({ from: pid, to: tbl, kind: write ? "writes" : "reads", prov: { file: f.path, line: sql.startLine, text: t.trim().replace(/\s+/g, " ").slice(0, 90) } });
            (write ? prog.tablesWritten : prog.tablesRead).push(tbl);
          }
          sql = null;
        }
      }
    });

    programs[pid] = prog;
  }

  return {
    nodes: Array.from(nodes.values()),
    edges,
    programs,
    fileCount: files.length,
    loc: totalLoc,
  };
}
