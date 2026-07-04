import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { ParsedRepo, BlastResult } from "../engine/types";

const COL = {
  amber: "#F5A623",
  risk: "#EA4F54",
  cyan: "#46C7E8",
  dim: "#5B6577",
  text: "#E7EBF2",
  ink: "#0B0F17",
};

type State = "target" | "risk" | "affected" | "interface" | "mapped";

function colorFor(s: State) {
  return s === "target" || s === "affected" ? COL.amber
    : s === "risk" ? COL.risk
    : s === "interface" ? COL.cyan
    : COL.dim;
}

export default function GraphView({
  repo,
  blast,
  onSelect,
}: {
  repo: ParsedRepo;
  blast: BlastResult;
  onSelect: (id: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [size, setSize] = useState({ w: 800, h: 520 });

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: Math.max(320, r.width), h: Math.max(360, r.height) });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const stateOf = useMemo(() => {
    const affected = new Set(blast.affected);
    const risk = new Set(blast.highRisk);
    const iface = new Set(blast.interfaces);
    return (id: string): State => {
      if (id === blast.target) return "target";
      if (risk.has(id)) return "risk";
      if (affected.has(id)) return "affected";
      if (iface.has(id)) return "interface";
      return "mapped";
    };
  }, [blast]);

  const data = useMemo(() => {
    const nodes = repo.nodes
      .filter((n) => n.kind === "program" || n.kind === "copybook")
      .map((n) => ({
        id: n.id,
        kind: n.kind,
        state: stateOf(n.id),
        file: n.file,
        line: n.line,
      }));
    const links = repo.edges
      .filter((e) => e.kind === "call" || e.kind === "copy")
      .map((e) => ({ source: e.from, target: e.to, kind: e.kind }));
    return { nodes, links };
  }, [repo, stateOf]);

  useEffect(() => {
    // gentle re-center whenever the analysis changes
    const t = setTimeout(() => fgRef.current?.zoomToFit?.(500, 60), 300);
    return () => clearTimeout(t);
  }, [blast.target, size.w]);

  return (
    <div ref={wrapRef} style={{ position: "absolute", inset: 0 }}>
      <ForceGraph2D
        ref={fgRef}
        width={size.w}
        height={size.h}
        graphData={data}
        backgroundColor="rgba(0,0,0,0)"
        cooldownTicks={90}
        d3VelocityDecay={0.28}
        linkColor={(l: any) => {
          const s = typeof l.source === "object" ? l.source.state : "mapped";
          const t = typeof l.target === "object" ? l.target.state : "mapped";
          const hot = ["target", "affected", "risk"].includes(s) && ["target", "affected", "risk"].includes(t);
          return hot ? "rgba(245,166,35,0.45)" : "rgba(91,101,119,0.28)";
        }}
        linkWidth={(l: any) => {
          const s = typeof l.source === "object" ? l.source.state : "mapped";
          const t = typeof l.target === "object" ? l.target.state : "mapped";
          return ["target", "affected", "risk"].includes(s) && ["target", "affected", "risk"].includes(t) ? 1.8 : 0.7;
        }}
        linkDirectionalParticles={0}
        onNodeClick={(n: any) => onSelect(n.id)}
        nodeLabel={(n: any) => `${n.id} · ${n.kind}${n.file ? ` · ${n.file}:${n.line}` : ""}`}
        nodePointerAreaPaint={(n: any, color: string, ctx: CanvasRenderingContext2D) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(n.x, n.y, 9, 0, 2 * Math.PI);
          ctx.fill();
        }}
        nodeCanvasObject={(n: any, ctx: CanvasRenderingContext2D, scale: number) => {
          const c = colorFor(n.state);
          const isTarget = n.state === "target";
          const r = n.kind === "program" ? (isTarget ? 7 : 5.2) : 4;
          const dim = n.state === "mapped";
          ctx.globalAlpha = dim ? 0.55 : 1;

          // glow for in-radius programs
          if (!dim && n.kind === "program") {
            ctx.beginPath();
            ctx.arc(n.x, n.y, r + 4, 0, 2 * Math.PI);
            ctx.fillStyle = c + "22";
            ctx.fill();
          }

          ctx.beginPath();
          if (n.kind === "program") {
            ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
          } else if (n.kind === "copybook") {
            // diamond
            ctx.moveTo(n.x, n.y - r); ctx.lineTo(n.x + r, n.y); ctx.lineTo(n.x, n.y + r); ctx.lineTo(n.x - r, n.y); ctx.closePath();
          } else {
            // table / file = square
            ctx.rect(n.x - r, n.y - r, r * 2, r * 2);
          }
          ctx.fillStyle = c;
          ctx.fill();
          if (isTarget) {
            ctx.lineWidth = 1.6 / scale;
            ctx.strokeStyle = COL.amber;
            ctx.beginPath();
            ctx.arc(n.x, n.y, r + 3, 0, 2 * Math.PI);
            ctx.stroke();
          }

          // label
          const fs = Math.max(3.5, 9 / scale);
          ctx.globalAlpha = dim ? 0.5 : 1;
          ctx.font = `${isTarget ? "700 " : ""}${fs}px ui-monospace, Menlo, monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillStyle = dim ? COL.dim : COL.text;
          ctx.fillText(n.id, n.x, n.y + r + 1.5);
          ctx.globalAlpha = 1;
        }}
      />
    </div>
  );
}
