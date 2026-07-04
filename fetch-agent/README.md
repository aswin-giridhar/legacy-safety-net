# Legacy Safety Net — ASI:One Agent (Fetch.ai)

![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3) ![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

**Agent name:** `legacy-safety-net` · **Agent address:** `agent1qgn725myvj44pxv7ksy77a3j5e05ct4u39rf6kvcpuzgvx2clq7524wc0pa`

A [uAgent](https://fetch.ai/docs) that exposes Legacy Safety Net through the standard
**Chat Protocol**, so the core use case works **directly inside an ASI:One conversation**.
Ask it what a change to a legacy module would break; it replies with the computed blast
radius, the high-risk programs, the interfaces in scope, and a link to the live visual demo.

It runs the same analysis engine as the web app (`engine.py` is a Python port), so the
answers match: *"add a 15% VAT tier" → VATCALC → 9 programs, 7 interfaces, 5 high-risk.*

## Make it usable in ASI:One (the part that actually matters)

ASI:One only routes to an agent that (a) implements the Chat Protocol, (b) sets
`publish_agent_details=True`, (c) replies with an `EndSessionContent`, and (d) is **running and
reachable**. Both `agent.py` and `hosted_agent.py` now do (a)–(c). To get (d):

**Recommended — run as a Mailbox Agent (reliably reachable by ASI:One):**

```bash
pip install -r requirements.txt
export LSN_AGENT_SEED="$(python -c 'import secrets;print(secrets.token_hex(32))')"  # stable address
python agent.py
```

1. The terminal prints an **Agent Inspector** link — open it, sign in to Agentverse, and click
   **Connect → Mailbox** to pair the running agent. Keep the process running.
2. On the agent's Agentverse profile → **Search Visibility** tab → add keywords, e.g.
   `legacy code, COBOL, blast radius, impact analysis, change safety, refactoring`. This is what
   lets ASI:One find and route to it.
3. **Test on Agentverse first:** click **Chat with Agent** and send *"what breaks if I change VAT?"*.
   If it returns the VATCALC blast radius, the agent works.
4. Then open **https://asi1.ai**, ask the same question, confirm it routes to your agent, and
   **share the chat URL** (the Fetch bounty proof).

**Alternative — Hosted Agent:** paste `hosted_agent.py` into a Blank Hosted Agent on Agentverse
and Run. Still do step 2 (keywords) and step 3 (Chat with Agent) before testing ASI:One.

**If ASI:One says it "can't invoke / read-only":** the agent is registered but not reachable/enabled.
Fix: (i) confirm it's **running** (mailbox connected or hosted Active), (ii) `publish_agent_details=True`
is set, (iii) add **Search Visibility keywords**, (iv) verify **Chat with Agent** works on Agentverse
before trying ASI:One.

## Live agent

Deployed on Agentverse (Hosted), status **Active**:

```
agent1qgn725myvj44pxv7ksy77a3j5e05ct4u39rf6kvcpuzgvx2clq7524wc0pa
```

## Demo prompts (paste into ASI:One)

Open your agent's **Chat with Agent** button on its Agentverse profile — it opens a dedicated
ASI:One chat at `https://asi1.ai/ai/<your-agent-address>` that routes straight to your agent.
(The general Luna chat / @mention search can lag until ASI:One re-indexes the metadata.) Paste any:

```
What breaks if I change how VAT is calculated in the core banking system?
```
```
I need to add a 15% VAT tier — which programs are affected and which are high-risk?
```
```
Trace the blast radius of changing how account interest and fees are accrued.
```
```
What should I test before modifying invoice generation?
```

If ASI:One answers generically instead of routing to the agent, prefix with
*"Using the legacy safety net agent, …"*. Screenshot the reply for the submission.

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
