import { useEffect, useMemo, useRef, useState } from "react";
import GraphView from "./components/GraphView";
import SourcePeek, { type PeekTarget } from "./components/SourcePeek";
import { analyzeRequest, analyzeTarget, getRepo, parseFiles, type Analysis } from "./engine/analyze";
import { getKey, hasKey, llmResolveTarget, llmSpecProse, setKey } from "./engine/llm";
import { simulate } from "./engine/simulate";
import { changePlanMarkdown, download, testsToGherkin, testsToJSON, testsToPytest } from "./engine/export";
import type { ParsedRepo } from "./engine/types";
import "./App.css";

const EXAMPLES = [
  "add a 15% VAT tier",
  "change how account interest & fees are accrued",
  "modify the invoice layout",
  "update the tax report for a new HMRC rule",
];

type Tab = "impact" | "spec" | "tests" | "audit";
interface AuditEntry {
  id: string;
  time: string;
  request: string;
  target: string;
  affected: number;
  highRisk: number;
  approver: string;
  hash: string;
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

export default function App() {
  const [repo, setRepo] = useState<ParsedRepo>(() => getRepo());
  const isSample = repo === getRepo();
  const [request, setRequest] = useState(EXAMPLES[0]);
  const [analysis, setAnalysis] = useState<Analysis>(() => analyzeRequest(EXAMPLES[0]));
  const [tab, setTab] = useState<Tab>("impact");
  const [approved, setApproved] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [aiOn, setAiOn] = useState(false);
  const [aiPanel, setAiPanel] = useState(false);
  const [keyDraft, setKeyDraft] = useState(getKey());
  const [aiBusy, setAiBusy] = useState(false);
  const [aiProse, setAiProse] = useState<{ target: string; text: string } | null>(null);

  const [peek, setPeek] = useState<PeekTarget | null>(null);

  const [audit, setAudit] = useState<AuditEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem("lsn.audit") || "[]"); } catch { return []; }
  });
  const [approver, setApprover] = useState("Aswin Giridhar");
  useEffect(() => {
    try { localStorage.setItem("lsn.audit", JSON.stringify(audit)); } catch { /* ignore */ }
  }, [audit]);

  const b = analysis.blast;

  // simulation knob: the target's numeric constant (e.g. the VAT rate)
  const baselineConst = useMemo(
    () => analysis.spec?.constants.find((c) => /RATE/i.test(c.name)) ?? analysis.spec?.constants[0] ?? null,
    [analysis],
  );
  const baselineRate = baselineConst ? parseFloat(baselineConst.value) : null;
  const canSim = baselineRate != null && analysis.tests.some((t) => t.simKind === "compute");
  const [simRate, setSimRate] = useState<number | null>(baselineRate);
  useEffect(() => { setSimRate(baselineRate); }, [analysis.target, baselineRate]);
  const simResults = canSim && simRate != null ? simulate(analysis.tests, baselineRate!, simRate) : null;

  function reset() { setApproved(false); setAiProse(null); }

  async function enhance(a: Analysis) {
    if (!aiOn || !hasKey() || !a.spec) return;
    setAiBusy(true);
    try {
      const prose = await llmSpecProse(repo, a.spec);
      if (prose) setAiProse({ target: a.target, text: prose });
    } finally { setAiBusy(false); }
  }

  async function run(req: string) {
    setRequest(req);
    reset();
    let a = analyzeRequest(req, repo);
    setAnalysis(a);
    if (aiOn && hasKey()) {
      setAiBusy(true);
      const t = await llmResolveTarget(repo, req);
      if (t && t.id !== a.target && repo.programs[t.id]) { a = analyzeTarget(t.id, repo); setAnalysis(a); }
      setAiBusy(false);
      enhance(a);
    }
  }

  function retarget(id: string) {
    if (!repo.programs[id]) return;
    const a = analyzeTarget(id, repo);
    setAnalysis(a);
    reset();
    enhance(a);
  }

  async function onFiles(list: FileList | null) {
    if (!list || !list.length) return;
    const files = await Promise.all(Array.from(list).map(async (f) => ({ path: f.name, content: await f.text() })));
    const name = files.length === 1 ? files[0].path : `Uploaded (${files.length} files)`;
    const r = parseFiles(files, name);
    if (Object.keys(r.programs).length === 0) {
      setUploadError("No PROGRAM-ID found in those files — is this COBOL? Keeping the sample loaded.");
      return;
    }
    setUploadError(null);
    setRepo(r);
    const first = Object.keys(r.programs)[0];
    setAnalysis(analyzeTarget(first, r));
    setRequest("");
    reset();
  }

  function resetToSample() {
    const s = getRepo();
    setRepo(s);
    setUploadError(null);
    setAnalysis(analyzeRequest(EXAMPLES[0], s));
    setRequest(EXAMPLES[0]);
    reset();
  }

  function approve() {
    const base: Omit<AuditEntry, "hash"> = {
      id: hash(analysis.target + ":" + Date.now()),
      time: new Date().toISOString(),
      request: request || analysis.target,
      target: analysis.target,
      affected: b.affected.length,
      highRisk: b.highRisk.length,
      approver: approver || "engineer",
    };
    const entry: AuditEntry = { ...base, hash: hash(JSON.stringify(base)) };
    setAudit([entry, ...audit]);
    setApproved(true);
  }

  const targetNode = repo.nodes.find((n) => n.id === analysis.target);
  const proseForTarget = aiProse?.target === analysis.target ? aiProse.text : null;

  function exportChangePlan() {
    const md = changePlanMarkdown(analysis, request, repo.name, new Date().toLocaleString());
    download(`change-plan-${analysis.target}.md`, md, "text/markdown");
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="glyph" aria-hidden />
          <b>LEGACY SAFETY NET</b>
        </div>
        <div className="repometa">
          <span className="repo">{repo.name}</span>
          {!isSample && <span className="custom">custom</span>}
          <span className="sep">·</span>
          <span>{repo.fileCount} files</span>
          <span className="sep">·</span>
          <span>{repo.loc.toLocaleString()} LOC</span>
        </div>
        <div className="topright">
          <input ref={fileInput} type="file" accept=".cbl,.cob,.cpy,.txt,.cobol" multiple hidden
                 onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
          <button className="ghostbtn" onClick={() => fileInput.current?.click()}>⬆ Upload COBOL</button>
          {!isSample && <button className="ghostbtn" onClick={resetToSample}>↺ Sample</button>}
          <div className="aiwrap">
            <button className={aiOn && hasKey() ? "aibtn on" : "aibtn"} onClick={() => setAiPanel((p) => !p)}>
              ✨ AI {aiOn && hasKey() ? "on" : "off"}
            </button>
            {aiPanel && (
              <div className="aipanel">
                <label className="aitoggle">
                  <input type="checkbox" checked={aiOn} onChange={(e) => setAiOn(e.target.checked)} />
                  Enhance spec &amp; matching with Claude
                </label>
                <input type="password" placeholder="Anthropic API key (stored locally)"
                       value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} />
                <div className="airow">
                  <button onClick={() => { setKey(keyDraft); setAiPanel(false); }}>Save</button>
                  <span className="ainote">Falls back to the deterministic engine if unset.</span>
                </div>
              </div>
            )}
          </div>
          <div className="privacy" title="Parsing runs entirely in your browser">● local &amp; private</div>
        </div>
      </header>

      <section className="query">
        <form onSubmit={(e) => { e.preventDefault(); run(request); }}>
          <span className="qlabel">CHANGE REQUEST</span>
          <input value={request} onChange={(e) => setRequest(e.target.value)}
                 placeholder="Describe a change in plain English…" aria-label="Change request" />
          <button type="submit">Trace impact →</button>
        </form>
        {isSample && (
          <div className="examples">
            {EXAMPLES.map((ex) => (
              <button key={ex} className={ex === request ? "chip on" : "chip"} onClick={() => run(ex)}>{ex}</button>
            ))}
          </div>
        )}
        <div className="resolution">
          Resolved to <b>{analysis.target}</b>
          {aiBusy ? <span className="muted"> — asking Claude…</span>
            : analysis.resolvedScore > 0 ? <span className="muted"> — matched from your request</span>
            : <span className="muted"> — best guess</span>}
          {analysis.alternatives.length > 0 && (
            <span className="alts"> other candidates:{" "}
              {analysis.alternatives.map((a) => <button key={a} className="altlink" onClick={() => retarget(a)}>{a}</button>)}
            </span>
          )}
          {uploadError && <span className="uperr"> · {uploadError}</span>}
        </div>
      </section>

      <main className="workspace">
        <div className="graphpanel">
          <div className="panelhead">DEPENDENCY GRAPH<span className="hint"> — click any node to re-target</span></div>
          <div className="graphcanvas"><GraphView repo={repo} blast={b} onSelect={retarget} /></div>
          <div className="legend">
            <span><i style={{ background: "#F5A623" }} /> blast radius</span>
            <span><i style={{ background: "#EA4F54" }} /> high-risk</span>
            <span><i style={{ background: "#5B6577" }} /> unaffected</span>
            <span className="shape">◇ copybook · ○ program</span>
          </div>
        </div>

        <aside className="side">
          <div className="metrics">
            <Metric n={b.affected.length} label="Programs affected" color="#F5A623" />
            <Metric n={b.interfaces.length} label="Tables & interfaces" color="#46C7E8" />
            <Metric n={b.highRisk.length} label="Flagged high-risk" color="#EA4F54" />
          </div>

          <div className="tabs">
            {(["impact", "spec", "tests", "audit"] as Tab[]).map((t) => (
              <button key={t} className={tab === t ? "tab on" : "tab"} onClick={() => setTab(t)}>
                {t === "impact" ? "Impact" : t === "spec" ? "Spec" : t === "tests" ? `Tests (${analysis.tests.length})` : `Audit (${audit.length})`}
              </button>
            ))}
          </div>

          <div className="tabbody">
            {tab === "impact" && <ImpactTab analysis={analysis} onSelect={retarget} onExport={exportChangePlan} />}
            {tab === "spec" && <SpecTab analysis={analysis} targetName={targetNode?.id ?? ""} aiProse={proseForTarget} aiBusy={aiBusy} onPeek={setPeek} />}
            {tab === "tests" && (
              <TestsTab analysis={analysis} canSim={canSim} baselineRate={baselineRate}
                        simRate={simRate} setSimRate={setSimRate} simResults={simResults} baselineConst={baselineConst} />
            )}
            {tab === "audit" && <AuditTab audit={audit} approver={approver} setApprover={setApprover} onClear={() => setAudit([])} />}
          </div>

          <div className="approve">
            <button className={approved ? "approvebtn done" : "approvebtn"} onClick={approve} disabled={approved}>
              {approved ? "✓ Change plan approved & logged" : "Approve change plan"}
            </button>
            <p className="note">
              {approved
                ? "Logged to the audit trail. Nothing was applied to the source — the engineer keeps the pen."
                : "Human-in-the-loop: review the blast radius and tests, then sign off. The tool never auto-applies."}
            </p>
          </div>
        </aside>
      </main>

      {peek && <SourcePeek sources={repo.sources} target={peek} onClose={() => setPeek(null)} />}
    </div>
  );
}

function Metric({ n, label, color }: { n: number; label: string; color: string }) {
  return <div className="metric"><div className="mn" style={{ color }}>{n}</div><div className="mk">{label}</div></div>;
}

function ImpactTab({ analysis, onSelect, onExport }: { analysis: Analysis; onSelect: (id: string) => void; onExport: () => void }) {
  const b = analysis.blast;
  if (b.affected.length === 0)
    return <p className="empty">Nothing else depends on <b>{b.target}</b> — this change is self-contained.</p>;
  const risk = new Set(b.highRisk);
  const ordered = [...b.affected].sort((x, y) => (b.paths[x]?.length ?? 0) - (b.paths[y]?.length ?? 0));
  return (
    <div className="impact">
      <div className="tabtoolbar">
        <p className="lede">Changing <b>{b.target}</b> ripples to <b>{b.affected.length}</b> programs across <b>{b.interfaces.length}</b> interfaces.</p>
        <button className="minibtn" onClick={onExport}>⬇ Change plan</button>
      </div>
      <ul className="afflist">
        {ordered.map((id) => (
          <li key={id} className={risk.has(id) ? "aff risk" : "aff"}>
            <button className="affname" onClick={() => onSelect(id)}>{id}</button>
            {risk.has(id) && <span className="riskpill">HIGH-RISK</span>}
            <div className="affpath">{(b.paths[id] ?? []).join(" → ")}</div>
            <div className="affreason">{b.reasons[id]}</div>
          </li>
        ))}
      </ul>
      <div className="ifaces">
        <span className="ifhead">Interfaces in scope</span>
        {b.interfaces.map((i) => <span key={i} className="iftag">{i}</span>)}
      </div>
    </div>
  );
}

function SpecTab({ analysis, targetName, aiProse, aiBusy, onPeek }: {
  analysis: Analysis; targetName: string; aiProse: string | null; aiBusy: boolean; onPeek: (t: PeekTarget) => void;
}) {
  const s = analysis.spec;
  if (!s) return <p className="empty">{targetName} is an external/interface node — no source to document.</p>;
  return (
    <div className="spec">
      <div className="spechead">
        <b>{s.id}</b>
        <button className="loclink" onClick={() => onPeek({ file: s.file, line: s.line })}>{s.file}:{s.line} · {s.loc} LOC</button>
      </div>
      {aiProse ? <p className="summary"><span className="aitag">AI</span> {aiProse}</p>
        : <p className="summary">{aiBusy ? <span className="muted">Enhancing with Claude…</span> : s.summary}</p>}
      {s.constants.length > 0 && (
        <div className="consts">
          {s.constants.map((c) => (
            <button key={c.name} className="const" onClick={() => onPeek({ file: s.file, line: c.line })}>
              <code>{c.name} = {c.value}</code>
              <span className="cprov">{s.file}:{c.line} ↗</span>
            </button>
          ))}
        </div>
      )}
      <ul className="purpose">{s.purpose.map((p, i) => <li key={i}>{p}</li>)}</ul>
      <div className="citations">
        <span className="cithead">Grounded in source — click to view</span>
        {s.citations.map((c, i) => (
          <button key={i} className="cite" onClick={() => onPeek({ file: c.file, line: c.line })}>
            <div className="citeclaim">{c.claim}</div>
            <div className="citesrc"><span className="fl">{c.file}:{c.line} ↗</span> <code>{c.text}</code></div>
          </button>
        ))}
      </div>
    </div>
  );
}

function TestsTab({ analysis, canSim, baselineRate, simRate, setSimRate, simResults, baselineConst }: {
  analysis: Analysis; canSim: boolean; baselineRate: number | null;
  simRate: number | null; setSimRate: (n: number) => void; simResults: ReturnType<typeof simulate> | null;
  baselineConst: { name: string; value: string; line: number } | null;
}) {
  const tests = analysis.tests;
  if (tests.length === 0) return <p className="empty">No characterization tests generated for this node.</p>;
  const changed = canSim && simRate != null && baselineRate != null && Math.abs(simRate - baselineRate) > 1e-9;
  const fails = simResults?.filter((r) => r.status === "fail").length ?? 0;
  const stale = simResults?.filter((r) => r.status === "stale").length ?? 0;

  function exportTests(fmt: "gherkin" | "json" | "pytest") {
    const t = analysis.target;
    if (fmt === "gherkin") download(`${t}.feature`, testsToGherkin(tests, t), "text/plain");
    else if (fmt === "json") download(`${t}.tests.json`, testsToJSON(tests, t), "application/json");
    else download(`test_${t.toLowerCase()}.py`, testsToPytest(tests, t, baselineRate ?? 0.2), "text/x-python");
  }

  return (
    <div className="tests">
      <div className="tabtoolbar">
        <p className="lede">Golden-master tests that pin today's behaviour. A change that alters any fails loudly.</p>
      </div>
      <div className="exportrow">
        <span className="exlabel">Export:</span>
        <button className="minibtn" onClick={() => exportTests("gherkin")}>.feature</button>
        <button className="minibtn" onClick={() => exportTests("json")}>.json</button>
        <button className="minibtn" onClick={() => exportTests("pytest")}>pytest</button>
      </div>

      {canSim && baselineRate != null && simRate != null && (
        <div className={changed ? "simbox on" : "simbox"}>
          <div className="simhead">
            <span>Simulate a change — <code>{baselineConst?.name}</code></span>
            <button className="minibtn" onClick={() => setSimRate(baselineRate)} disabled={!changed}>reset</button>
          </div>
          <div className="simctl">
            <input type="range" min={0} max={0.4} step={0.005} value={simRate}
                   onChange={(e) => setSimRate(parseFloat(e.target.value))} aria-label="Proposed rate" />
            <span className="simval">{(simRate * 100).toFixed(1)}%</span>
            <span className="simbase">baseline {(baselineRate * 100).toFixed(1)}%</span>
          </div>
          {changed && (
            <div className="simverdict">
              {fails > 0 ? <b className="vfail">{fails} test{fails > 1 ? "s" : ""} FAILING</b> : <b className="vok">behaviour preserved</b>}
              {stale > 0 && <span className="vstale"> · {stale} must re-run</span>}
              <span className="vhint"> — this is the six-month bug, caught in one click.</span>
            </div>
          )}
        </div>
      )}

      {tests.map((t, i) => {
        const r = simResults?.[i];
        const st = changed ? r?.status : undefined;
        return (
          <div key={i} className={`test${st ? " s-" + st : ""}`}>
            <div className="testtop">
              <span className={`tkind ${t.kind}`}>{t.kind}</span>
              <span className="ttitle">{t.title}</span>
              {st && <span className={`sbadge ${st}`}>{st === "pass" ? "PASS" : st === "fail" ? "FAIL" : "STALE"}</span>}
            </div>
            <dl>
              <div><dt>GIVEN</dt><dd>{t.given}</dd></div>
              <div><dt>WHEN</dt><dd>{t.when}</dd></div>
              <div><dt>THEN</dt><dd>{t.then}</dd></div>
            </dl>
            {st && st !== "pass" && r && (
              <div className="simrow">expected <code>{r.expected}</code> · now <code className={st === "fail" ? "bad" : ""}>{r.actual}</code></div>
            )}
            <div className="pins">Pins {t.pins}</div>
          </div>
        );
      })}
    </div>
  );
}

function AuditTab({ audit, approver, setApprover, onClear }: {
  audit: AuditEntry[]; approver: string; setApprover: (s: string) => void; onClear: () => void;
}) {
  function exportLog() {
    const md = ["# Change audit trail", ""].concat(
      audit.map((e) => `- \`${e.hash}\` · ${e.time} · **${e.target}** (${e.affected} affected, ${e.highRisk} high-risk) · approved by ${e.approver} · _"${e.request}"_`),
    ).join("\n");
    download("audit-trail.md", md, "text/markdown");
  }
  return (
    <div className="audit">
      <div className="tabtoolbar">
        <label className="approverfield">Approver <input value={approver} onChange={(e) => setApprover(e.target.value)} /></label>
        {audit.length > 0 && <button className="minibtn" onClick={exportLog}>⬇ Export</button>}
      </div>
      {audit.length === 0 ? (
        <p className="empty">No approvals yet. Approve a change plan and it's logged here with a content hash for traceability.</p>
      ) : (
        <>
          <ul className="auditlist">
            {audit.map((e) => (
              <li key={e.id} className="aentry">
                <div className="atop"><span className="ahash">{e.hash}</span><span className="atime">{new Date(e.time).toLocaleString()}</span></div>
                <div className="atarget"><b>{e.target}</b> — {e.affected} affected · {e.highRisk} high-risk</div>
                <div className="areq">"{e.request}" — approved by {e.approver}</div>
              </li>
            ))}
          </ul>
          <button className="minibtn danger" onClick={onClear}>Clear log</button>
        </>
      )}
    </div>
  );
}
