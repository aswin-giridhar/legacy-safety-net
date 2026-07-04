import { useEffect, useMemo, useRef, useState } from "react";
import GraphView from "./components/GraphView";
import Icon from "./components/Icon";
import SourcePeek, { type PeekTarget } from "./components/SourcePeek";
import { ImpactTab, SpecTab, TestsTab, AuditTab } from "./components/panels";
import { analyzeRequest, analyzeTarget, getRepo, parseFiles, type Analysis } from "./engine/analyze";
import { getKey, hasKey, llmResolveTarget, llmSpecProse, setKey } from "./engine/llm";
import { simulate, rateDiff } from "./engine/simulate";
import { changePlanMarkdown, download } from "./engine/export";
import { hash, type AuditEntry } from "./engine/audit";
import type { ParsedRepo } from "./engine/types";
import "./App.css";

const EXAMPLES = [
  "add a 15% VAT tier",
  "change how account interest & fees are accrued",
  "modify the invoice layout",
  "update the tax report for a new HMRC rule",
];

type Tab = "impact" | "spec" | "tests" | "audit";

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

  // toasts (aria-live feedback)
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const toastId = useRef(0);
  function toast(msg: string) {
    const id = (toastId.current += 1);
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }

  // deep link: read #t=TARGET on mount, write it on target change
  useEffect(() => {
    const m = location.hash.match(/t=([A-Za-z0-9-]+)/);
    const id = m?.[1]?.toUpperCase();
    if (id && getRepo().programs[id]) { setAnalysis(analyzeTarget(id, getRepo())); setRequest(""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (isSample) { try { history.replaceState(null, "", `#t=${analysis.target}`); } catch { /* ignore */ } }
  }, [analysis.target, isSample]);

  const b = analysis.blast;

  const baselineConst = useMemo(
    () => analysis.spec?.constants.find((c) => /RATE/i.test(c.name)) ?? analysis.spec?.constants[0] ?? null,
    [analysis],
  );
  const baselineRate = baselineConst ? parseFloat(baselineConst.value) : null;
  const canSim = baselineRate != null && analysis.tests.some((t) => t.simKind === "compute");
  const [simRate, setSimRate] = useState<number | null>(baselineRate);
  useEffect(() => { setSimRate(baselineRate); }, [analysis.target, baselineRate]);
  const simResults = canSim && simRate != null ? simulate(analysis.tests, baselineRate!, simRate) : null;
  const simChanged = canSim && simRate != null && baselineRate != null && Math.abs(simRate - baselineRate) > 1e-9;
  const failCount = simResults?.filter((r) => r.status === "fail").length ?? 0;
  const failing = simChanged && failCount > 0;

  const coverage = useMemo(() => {
    const covered = new Set(analysis.tests.filter((t) => t.kind === "regression").map((t) => t.program));
    return { covered: b.highRisk.filter((id) => covered.has(id)).length, total: b.highRisk.length };
  }, [analysis.tests, b.highRisk]);

  const diff = useMemo(() => {
    if (!canSim || !baselineConst || simRate == null || !analysis.spec) return null;
    const line = repo.sources[analysis.spec.file]?.split("\n")[baselineConst.line - 1];
    return rateDiff(line, baselineConst.value, simRate);
  }, [canSim, baselineConst, simRate, analysis.spec, repo]);

  function resetLocal() { setApproved(false); setAiProse(null); }

  async function enhance(a: Analysis) {
    if (!aiOn || !hasKey() || !a.spec) return;
    setAiBusy(true);
    try { const prose = await llmSpecProse(repo, a.spec); if (prose) setAiProse({ target: a.target, text: prose }); }
    finally { setAiBusy(false); }
  }

  async function run(req: string) {
    setRequest(req); resetLocal();
    let a = analyzeRequest(req, repo);
    setAnalysis(a);
    if (aiOn && hasKey()) {
      setAiBusy(true);
      const t = await llmResolveTarget(repo, req);
      if (t && t.id !== a.target && repo.programs[t.id]) { a = analyzeTarget(t.id, repo); setAnalysis(a); }
      setAiBusy(false); enhance(a);
    }
  }

  function retarget(id: string) {
    if (!repo.programs[id]) return;
    const a = analyzeTarget(id, repo);
    setAnalysis(a); resetLocal(); enhance(a);
  }

  async function onFiles(list: FileList | null) {
    if (!list || !list.length) return;
    const files = await Promise.all(Array.from(list).map(async (f) => ({ path: f.name, content: await f.text() })));
    const name = files.length === 1 ? files[0].path : `Uploaded (${files.length} files)`;
    const r = parseFiles(files, name);
    const nprog = Object.keys(r.programs).length;
    if (nprog === 0) { setUploadError("No PROGRAM-ID found in those files — is this COBOL? Keeping the sample loaded."); return; }
    setUploadError(null); setRepo(r);
    setAnalysis(analyzeTarget(Object.keys(r.programs)[0], r));
    setRequest(""); resetLocal();
    toast(`Loaded ${name} — ${nprog} program${nprog > 1 ? "s" : ""}`);
  }

  function resetToSample() {
    const s = getRepo(); setRepo(s); setUploadError(null);
    setAnalysis(analyzeRequest(EXAMPLES[0], s)); setRequest(EXAMPLES[0]); resetLocal();
  }

  function approve() {
    const base: Omit<AuditEntry, "hash"> = {
      id: hash(analysis.target + ":" + toastId.current + ":" + audit.length),
      time: new Date().toISOString(),
      request: request || analysis.target,
      target: analysis.target, affected: b.affected.length, highRisk: b.highRisk.length,
      approver: approver || "engineer",
    };
    setAudit([{ ...base, hash: hash(JSON.stringify(base)) }, ...audit]);
    setApproved(true);
    toast("Change plan approved & logged to the audit trail");
  }

  function exportChangePlan() {
    download(`change-plan-${analysis.target}.md`, changePlanMarkdown(analysis, request, repo.name, new Date().toLocaleString()), "text/markdown");
    toast(`Downloaded change-plan-${analysis.target}.md`);
  }

  const targetNode = repo.nodes.find((n) => n.id === analysis.target);
  const proseForTarget = aiProse?.target === analysis.target ? aiProse.text : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="glyph" aria-hidden /><b>LEGACY SAFETY NET</b></div>
        <div className="repometa">
          <span className="repo">{repo.name}</span>
          {!isSample && <span className="custom">custom</span>}
          <span className="sep">·</span><span>{repo.fileCount} files</span>
          <span className="sep">·</span><span>{repo.loc.toLocaleString()} LOC</span>
        </div>
        <div className="topright">
          <input ref={fileInput} type="file" accept=".cbl,.cob,.cpy,.txt,.cobol" multiple hidden
                 onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
          <button className="ghostbtn" onClick={() => fileInput.current?.click()}><Icon name="upload" size={13} /> Upload COBOL</button>
          {!isSample && <button className="ghostbtn" onClick={resetToSample}><Icon name="reset" size={13} /> Sample</button>}
          <div className="aiwrap">
            <button className={aiOn && hasKey() ? "aibtn on" : "aibtn"} onClick={() => setAiPanel((p) => !p)}>
              <Icon name="sparkle" size={13} /> AI {aiOn && hasKey() ? "on" : "off"}
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
                  <button onClick={() => { setKey(keyDraft); setAiPanel(false); toast("API key saved locally"); }}>Save</button>
                  <span className="ainote">Falls back to the deterministic engine if unset.</span>
                </div>
              </div>
            )}
          </div>
          <div className="privacy" title="Parsing runs entirely in your browser"><span className="dot" /> local &amp; private</div>
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
        <div className={failing ? "graphpanel alert" : "graphpanel"}>
          <div className="panelhead">
            DEPENDENCY GRAPH<span className="hint"> — click any node to re-target</span>
            {failing && <span className="alertchip"><Icon name="alert" size={12} /> simulated change breaks {failCount} test{failCount > 1 ? "s" : ""}</span>}
          </div>
          <div className="graphcanvas"><GraphView repo={repo} blast={b} onSelect={retarget} alert={failing} /></div>
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

          <div className="tabs" role="tablist">
            {(["impact", "spec", "tests", "audit"] as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "tab on" : "tab"} onClick={() => setTab(t)}>
                {t === "impact" ? "Impact" : t === "spec" ? "Spec" : t === "tests" ? `Tests (${analysis.tests.length})` : `Audit (${audit.length})`}
              </button>
            ))}
          </div>

          <div className="tabbody">
            {tab === "impact" && <ImpactTab analysis={analysis} onSelect={retarget} onExport={exportChangePlan} />}
            {tab === "spec" && <SpecTab analysis={analysis} targetName={targetNode?.id ?? ""} aiProse={proseForTarget} aiBusy={aiBusy} onPeek={setPeek} />}
            {tab === "tests" && (
              <TestsTab analysis={analysis} canSim={canSim} baselineRate={baselineRate} simRate={simRate} setSimRate={setSimRate}
                        simResults={simResults} baselineConst={baselineConst} coverage={coverage} diff={diff} onToast={toast} />
            )}
            {tab === "audit" && <AuditTab audit={audit} approver={approver} setApprover={setApprover} onClear={() => setAudit([])} onToast={toast} />}
          </div>

          <div className="approve">
            <button className={approved ? "approvebtn done" : "approvebtn"} onClick={approve} disabled={approved}>
              {approved ? <><Icon name="check" size={15} /> Change plan approved &amp; logged</> : "Approve change plan"}
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
      <div className="toasthost" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className="toast"><Icon name="check" size={13} /> {t.msg}</div>)}
      </div>
    </div>
  );
}

function Metric({ n, label, color }: { n: number; label: string; color: string }) {
  return <div className="metric"><div className="mn" style={{ color }}>{n}</div><div className="mk">{label}</div></div>;
}
