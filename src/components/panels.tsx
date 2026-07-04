import Icon from "./Icon";
import type { PeekTarget } from "./SourcePeek";
import type { Analysis } from "../engine/analyze";
import type { AuditEntry } from "../engine/audit";
import type { SimResult } from "../engine/simulate";
import { download, testsToGherkin, testsToJSON, testsToPytest } from "../engine/export";

export function ImpactTab({ analysis, onSelect, onExport }: {
  analysis: Analysis; onSelect: (id: string) => void; onExport: () => void;
}) {
  const b = analysis.blast;
  if (b.affected.length === 0)
    return <p className="empty">Nothing else depends on <b>{b.target}</b> — this change is self-contained.</p>;
  const risk = new Set(b.highRisk);
  const ordered = [...b.affected].sort((x, y) => (b.paths[x]?.length ?? 0) - (b.paths[y]?.length ?? 0));
  return (
    <div className="impact">
      <div className="tabtoolbar">
        <p className="lede">Changing <b>{b.target}</b> ripples to <b>{b.affected.length}</b> programs across <b>{b.interfaces.length}</b> interfaces.</p>
        <button className="minibtn" onClick={onExport}><Icon name="download" size={13} /> Change plan</button>
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

export function SpecTab({ analysis, targetName, aiProse, aiBusy, onPeek }: {
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
              <span className="cprov">{s.file}:{c.line} <Icon name="arrowUR" size={11} /></span>
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
            <div className="citesrc"><span className="fl">{c.file}:{c.line}</span> <code>{c.text}</code></div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function TestsTab({ analysis, canSim, baselineRate, simRate, setSimRate, simResults, baselineConst, coverage, diff, onToast }: {
  analysis: Analysis; canSim: boolean; baselineRate: number | null;
  simRate: number | null; setSimRate: (n: number) => void; simResults: SimResult[] | null;
  baselineConst: { name: string; value: string; line: number } | null;
  coverage: { covered: number; total: number };
  diff: { before: string; after: string } | null;
  onToast: (m: string) => void;
}) {
  const tests = analysis.tests;
  if (tests.length === 0) return <p className="empty">No characterization tests generated for this node.</p>;
  const changed = canSim && simRate != null && baselineRate != null && Math.abs(simRate - baselineRate) > 1e-9;
  const fails = simResults?.filter((r) => r.status === "fail").length ?? 0;
  const stale = simResults?.filter((r) => r.status === "stale").length ?? 0;

  function exportTests(fmt: "gherkin" | "json" | "pytest") {
    const t = analysis.target;
    if (fmt === "gherkin") { download(`${t}.feature`, testsToGherkin(tests, t), "text/plain"); onToast(`Downloaded ${t}.feature`); }
    else if (fmt === "json") { download(`${t}.tests.json`, testsToJSON(tests, t), "application/json"); onToast(`Downloaded ${t}.tests.json`); }
    else { download(`test_${t.toLowerCase()}.py`, testsToPytest(tests, t, baselineRate ?? 0.2), "text/x-python"); onToast(`Downloaded test_${t.toLowerCase()}.py`); }
  }

  return (
    <div className="tests">
      <div className="tabtoolbar">
        <p className="lede">Golden-master tests that pin today's behaviour. A change that alters any fails loudly.</p>
      </div>
      {coverage.total > 0 && (
        <div className="coverage">
          <span className="covbar"><span className="covfill" style={{ width: `${(coverage.covered / coverage.total) * 100}%` }} /></span>
          Tests cover <b>{coverage.covered} of {coverage.total}</b> high-risk paths
        </div>
      )}
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
                   onChange={(e) => setSimRate(parseFloat(e.target.value))} aria-label="Proposed rate value" />
            <span className="simval">{(simRate * 100).toFixed(1)}%</span>
            <span className="simbase">baseline {(baselineRate * 100).toFixed(1)}%</span>
          </div>
          {changed && (
            <>
              <div className="simverdict">
                {fails > 0 ? <b className="vfail">{fails} test{fails > 1 ? "s" : ""} FAILING</b> : <b className="vok">behaviour preserved</b>}
                {stale > 0 && <span className="vstale"> · {stale} must re-run</span>}
                <span className="vhint"> — the six-month bug, caught in one click.</span>
              </div>
              {diff && (
                <div className="diff">
                  <div className="difftitle">Proposed edit{baselineConst ? ` · line ${baselineConst.line}` : ""}</div>
                  <div className="diffline del"><span className="dsign">-</span>{diff.before}</div>
                  <div className="diffline add"><span className="dsign">+</span>{diff.after}</div>
                </div>
              )}
            </>
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

export function AuditTab({ audit, approver, setApprover, onClear, onToast }: {
  audit: AuditEntry[]; approver: string; setApprover: (s: string) => void; onClear: () => void; onToast: (m: string) => void;
}) {
  function exportLog() {
    const md = ["# Change audit trail", ""].concat(
      audit.map((e) => `- \`${e.hash}\` · ${e.time} · **${e.target}** (${e.affected} affected, ${e.highRisk} high-risk) · approved by ${e.approver} · _"${e.request}"_`),
    ).join("\n");
    download("audit-trail.md", md, "text/markdown");
    onToast("Downloaded audit-trail.md");
  }
  return (
    <div className="audit">
      <div className="tabtoolbar">
        <label className="approverfield">Approver <input value={approver} onChange={(e) => setApprover(e.target.value)} /></label>
        {audit.length > 0 && <button className="minibtn" onClick={exportLog}><Icon name="download" size={13} /> Export</button>}
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
