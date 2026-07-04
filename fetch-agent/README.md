# Legacy Safety Net — ASI:One Agent (Fetch.ai)

A [uAgent](https://fetch.ai/docs) that exposes Legacy Safety Net through the standard
**Chat Protocol**, so the core use case works **directly inside an ASI:One conversation**.
Ask it what a change to a legacy module would break; it replies with the computed blast
radius, the high-risk programs, the interfaces in scope, and a link to the live visual demo.

It runs the same analysis engine as the web app (`engine.py` is a Python port), so the
answers match: *"add a 15% VAT tier" → VATCALC → 9 programs, 7 interfaces, 5 high-risk.*

## Deploy as a Hosted Agent — recommended (no local process)

A local agent only responds while `python agent.py` is running on your machine — fragile
during judging. Instead, host it on Agentverse's infra with the single self-contained file
**`hosted_agent.py`** (graph embedded, no extra imports):

1. **https://agentverse.ai** → **+ New Agent** → **Blank Agent (Hosted)**.
2. Paste **all of `hosted_agent.py`** into the editor, replacing the default code.
3. Click **Run**. `publish_manifest=True` publishes the Chat Protocol to the Almanac.
4. On the agent's page, set a **name + description + tags**, e.g.
   *"legacy safety net — blast radius of a change to legacy COBOL code"* (helps ASI:One search).
5. Open **https://asi1.ai** → search *legacy safety net* → ask *"what breaks if I change VAT?"*
   and **screenshot the reply** (that's the Fetch bounty's ASI:One-demo proof).

## Run locally instead (optional)

```bash
pip install -r requirements.txt
python agent.py            # prints its address; connect it via the inspector link
```

`agent.py` starts with a mailbox so it can receive ASI:One messages without a public IP —
but it must stay running, and the Agentverse inspector must reach it on your own localhost.
Prefer the hosted path above for judging.

## Try it (example)

> **You:** what breaks if I change how VAT is calculated?
>
> **Agent:** **Target program:** `VATCALC` … **Blast radius:** 9 programs affected · 7 data
> interfaces · 5 high-risk. High-risk (verify first): `LEDGPST` — writes to shared financial
> store LEDGER … See the live dependency graph: https://legacy-safety-net.vercel.app

## Files

- `hosted_agent.py` — **single-file** agent (graph embedded) for Agentverse Hosted Agents
- `agent.py` — the uAgent + Chat Protocol handler (local, imports `engine.py`)
- `engine.py` — COBOL parser + blast-radius engine (port of the web engine)
- `requirements.txt` — `uagents`
