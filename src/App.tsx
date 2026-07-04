import { useMemo, useState } from "react";
import GraphView from "./components/GraphView";
import { analyzeRequest, analyzeTarget, getRepo, repoName, type Analysis } from "./engine/analyze";
import { getKey, hasKey, llmResolveTarget, llmSpecProse, setKey } from "./engine/llm";
import "./App.css";

const EXAMPLES = [
  "add a 15% VAT tier",
  "change how account interest & fees are accrued",
  "modify the invoice layout",
  "update the tax report for a new HMRC rule",
];

type Tab = "impact" | "spec" | "tests";

export default function App() {
  const repo = useMemo(() => getRepo(), []);
  const [request, setRequest] = useState(EXAMPLES[0]);
  const [analysis, setAnalysis] = useState<Analysis>(() => analyzeRequest(EXAMPLES[0]));
  const [tab, setTab] = useState<Tab>("impact");
  const [approved, setApproved] = useState(false);

  const [aiOn, setAiOn] = useState(false);
  const [aiPanel, setAiPanel] = useState(false);
  const [keyDraft, setKeyDraft] = useState(getKey());
  const [aiBusy, setAiBusy] = useState(false);
  const [aiProse, setAiProse] = useState<{ target: string; text: string } | null>(null);

  async function enhance(a: Analysis) {
    if (!aiOn || !hasKey() || !a.spec) return;
    setAiBusy(true);
    try {
      const prose = await llmSpecProse(repo, a.spec);
      if (prose) setAiProse({ target: a.target, text: prose });
    } finally {
      setAiBusy(false);
    }
  }

  async function run(req: string) {
    setRequest(req);
    setApproved(false);
    setAiProse(null);
    let a = analyzeRequest(req);
    setAnalysis(a);
    if (aiOn && hasKey()) {
      setAiBusy(true);
      const t = await llmResolveTarget(repo, req);
      if (t && t.id !== a.target) {
        a = analyzeTarget(t.id);
        setAnalysis(a);
      }
      setAiBusy(false);
      enhance(a);
    }
  }

  function retarget(id: string) {
    if (!repo.programs[id]) return; // ignore clicks on tables/copybooks
    const a = analyzeTarget(id);
    setAnalysis(a);
    setApproved(false);
    setAiProse(null);
    enhance(a);
  }

  const b = analysis.blast;
  const targetNode = repo.nodes.find((n) => n.id === analysis.target);
  const proseForTarget = aiProse?.target === analysis.target ? aiProse.text : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="glyph" aria-hidden />
          <b>LEGACY SAFETY NET</b>
        </div>
        <div className="repometa">
          <span className="repo">{repoName}</span>
          <span className="sep">·</span>
          <span>{repo.fileCount} files</span>
          <span className="sep">·</span>
          <span>{repo.loc.toLocaleString()} LOC</span>
        </div>
        <div className="topright">
          <div className="aiwrap">
            <button className={aiOn && hasKey() ? "aibtn on" : "aibtn"} onClick={() => setAiPanel((p) => !p)} title="Optional AI enhancement">
              ✨ AI {aiOn && hasKey() ? "on" : "off"}
            </button>
            {aiPanel && (
              <div className="aipanel">
                <label className="aitoggle">
                  <input type="checkbox" checked={aiOn} onChange={(e) => setAiOn(e.target.checked)} />
                  Enhance spec &amp; matching with Claude
                </label>
                <input
                  type="password"
                  placeholder="Anthropic API key (stored locally)"
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                />
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(request);
          }}
        >
          <span className="qlabel">CHANGE REQUEST</span>
          <input
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="Describe a change in plain English…"
            aria-label="Change request"
          />
          <button type="submit">Trace impact →</button>
        </form>
        <div className="examples">
          {EXAMPLES.map((ex) => (
            <button key={ex} className={ex === request ? "chip on" : "chip"} onClick={() => run(ex)}>
              {ex}
            </button>
          ))}
        </div>
        <div className="resolution">
          Resolved to <b>{analysis.target}</b>
          {aiBusy ? (
            <span className="muted"> — asking Claude…</span>
          ) : analysis.resolvedScore > 0 ? (
            <span className="muted"> — matched from your request</span>
          ) : (
            <span className="muted"> — best guess</span>
          )}
          {analysis.alternatives.length > 0 && (
            <span className="alts">
              {" "}other candidates:{" "}
              {analysis.alternatives.map((a) => (
                <button key={a} className="altlink" onClick={() => retarget(a)}>
                  {a}
                </button>
              ))}
            </span>
          )}
        </div>
      </section>

      <main className="workspace">
        <div className="graphpanel">
          <div className="panelhead">
            DEPENDENCY GRAPH<span className="hint"> — click any node to re-target</span>
          </div>
          <div className="graphcanvas">
            <GraphView repo={repo} blast={b} onSelect={retarget} />
          </div>
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
            {(["impact", "spec", "tests"] as Tab[]).map((t) => (
              <button key={t} className={tab === t ? "tab on" : "tab"} onClick={() => setTab(t)}>
                {t === "impact" ? "Impact" : t === "spec" ? "Spec" : `Tests (${analysis.tests.length})`}
              </button>
            ))}
          </div>

          <div className="tabbody">
            {tab === "impact" && <ImpactTab analysis={analysis} onSelect={retarget} />}
            {tab === "spec" && <SpecTab analysis={analysis} targetName={targetNode?.id ?? ""} aiProse={proseForTarget} aiBusy={aiBusy} />}
            {tab === "tests" && <TestsTab analysis={analysis} />}
          </div>

          <div className="approve">
            <button className={approved ? "approvebtn done" : "approvebtn"} onClick={() => setApproved(true)} disabled={approved}>
              {approved ? "✓ Change plan approved & logged" : "Approve change plan"}
            </button>
            <p className="note">
              {approved
                ? "Logged for the change record. Nothing was applied to the source — the engineer keeps the pen."
                : "Human-in-the-loop: review the blast radius and tests, then sign off. The tool never auto-applies."}
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}

function Metric({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div className="metric">
      <div className="mn" style={{ color }}>{n}</div>
      <div className="mk">{label}</div>
    </div>
  );
}

function ImpactTab({ analysis, onSelect }: { analysis: Analysis; onSelect: (id: string) => void }) {
  const b = analysis.blast;
  if (b.affected.length === 0)
    return <p className="empty">Nothing else depends on <b>{b.target}</b> — this change is self-contained.</p>;
  const risk = new Set(b.highRisk);
  const ordered = [...b.affected].sort((x, y) => (b.paths[x]?.length ?? 0) - (b.paths[y]?.length ?? 0));
  return (
    <div className="impact">
      <p className="lede">
        Changing <b>{b.target}</b> ripples to <b>{b.affected.length}</b> programs across <b>{b.interfaces.length}</b> data interfaces.
      </p>
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

function SpecTab({ analysis, targetName, aiProse, aiBusy }: { analysis: Analysis; targetName: string; aiProse: string | null; aiBusy: boolean }) {
  const s = analysis.spec;
  if (!s) return <p className="empty">{targetName} is an external/interface node — no source to document.</p>;
  return (
    <div className="spec">
      <div className="spechead">
        <b>{s.id}</b>
        <span className="loc">{s.file}:{s.line} · {s.loc} LOC</span>
      </div>
      {aiProse ? (
        <p className="summary"><span className="aitag">AI</span> {aiProse}</p>
      ) : (
        <p className="summary">{aiBusy ? <span className="muted">Enhancing with Claude…</span> : s.summary}</p>
      )}
      {s.constants.length > 0 && (
        <div className="consts">
          {s.constants.map((c) => (
            <div key={c.name} className="const">
              <code>{c.name} = {c.value}</code>
              <span className="cprov">{s.file}:{c.line}</span>
            </div>
          ))}
        </div>
      )}
      <ul className="purpose">
        {s.purpose.map((p, i) => <li key={i}>{p}</li>)}
      </ul>
      <div className="citations">
        <span className="cithead">Grounded in source</span>
        {s.citations.map((c, i) => (
          <div key={i} className="cite">
            <div className="citeclaim">{c.claim}</div>
            <div className="citesrc"><span className="fl">{c.file}:{c.line}</span> <code>{c.text}</code></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TestsTab({ analysis }: { analysis: Analysis }) {
  const tests = analysis.tests;
  if (tests.length === 0) return <p className="empty">No characterization tests generated for this node.</p>;
  return (
    <div className="tests">
      <p className="lede">Golden-master tests that pin today's behavior. A change that alters any of these fails loudly.</p>
      {tests.map((t, i) => (
        <div key={i} className="test">
          <div className="testtop">
            <span className={`tkind ${t.kind}`}>{t.kind}</span>
            <span className="ttitle">{t.title}</span>
          </div>
          <dl>
            <div><dt>GIVEN</dt><dd>{t.given}</dd></div>
            <div><dt>WHEN</dt><dd>{t.when}</dd></div>
            <div><dt>THEN</dt><dd>{t.then}</dd></div>
          </dl>
          <div className="pins">Pins {t.pins}</div>
        </div>
      ))}
    </div>
  );
}
