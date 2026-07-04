# Legacy Safety Net — ASI:One Agent (Fetch.ai)

A [uAgent](https://fetch.ai/docs) that exposes Legacy Safety Net through the standard
**Chat Protocol**, so the core use case works **directly inside an ASI:One conversation**.
Ask it what a change to a legacy module would break; it replies with the computed blast
radius, the high-risk programs, the interfaces in scope, and a link to the live visual demo.

It runs the same analysis engine as the web app (`engine.py` is a Python port), so the
answers match: *"add a 15% VAT tier" → VATCALC → 9 programs, 7 interfaces, 5 high-risk.*

## Run locally

```bash
pip install -r requirements.txt
python agent.py
```

The agent prints its **address** and starts with a mailbox, so it can receive messages
from ASI:One without a public IP.

## Register on Agentverse → discoverable on ASI:One

1. Sign in at **https://agentverse.ai**.
2. **Mailbox → Connect a Mailbox Agent**, and pair it with the address printed by `agent.py`
   (or create a hosted agent and paste `agent.py` + `engine.py` into it).
3. `agent.include(chat, publish_manifest=True)` already publishes the Chat Protocol manifest,
   which is what makes the agent **discoverable and callable from ASI:One**.
4. Open **https://asi1.ai**, search for *legacy safety net*, and ask it a change question.

## Try it (example)

> **You:** what breaks if I change how VAT is calculated?
>
> **Agent:** **Target program:** `VATCALC` … **Blast radius:** 9 programs affected · 7 data
> interfaces · 5 high-risk. High-risk (verify first): `LEDGPST` — writes to shared financial
> store LEDGER … See the live dependency graph: https://legacy-safety-net.vercel.app

## Files

- `agent.py` — the uAgent + Chat Protocol handler
- `engine.py` — COBOL parser + blast-radius engine (port of the web engine)
- `requirements.txt` — `uagents`
