# =============================================================================
# Legacy Safety Net — ASI:One agent (SINGLE-FILE, for Agentverse Hosted Agents)
#
# Paste this ONE file into an Agentverse Hosted Agent and click Run. No local
# process, no mailbox, no imports beyond uagents + stdlib — so it runs reliably
# on Agentverse's infra and stays discoverable in ASI:One during judging.
#
# Deploy:
#   1. https://agentverse.ai  →  + New Agent  →  Blank Agent (Hosted)
#   2. Paste this whole file into the editor, replacing the default code.
#   3. Click Run.  (publish_manifest=True publishes the Chat Protocol → ASI:One.)
#   4. On the agent's page, add a name/description/tags like:
#      "legacy safety net — blast radius of a change to legacy COBOL code".
#   5. Test at https://asi1.ai → search "legacy safety net" → ask a change.
#
# To run locally instead: add  mailbox=True  to the Agent(...) call below and
# run `python hosted_agent.py`, then connect it via the printed inspector link.
# =============================================================================
import os
from datetime import datetime, timezone
from uuid import uuid4

from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    TextContent,
    chat_protocol_spec,
)

DEMO_URL = "https://legacy-safety-net.vercel.app"

# --- pre-computed dependency graph of the sample COBOL core-banking module ----
# (parsed offline from the same source the web app parses live; see engine.py)
CALLS = {
    "VATCALC": ["FXRATE"],
    "PRICENG": ["FXRATE", "VATCALC", "AUDITLG"],
    "INVGEN": ["PRICENG", "VATCALC"],
    "ACCTMST": ["VATCALC"],
    "TAXRPT": ["PRICENG", "AUDITLG"],
    "LEDGPST": ["INVGEN", "ACCTMST"],
    "STMTGEN": ["LEDGPST", "TAXRPT"],
    "CUSTMST": ["ACCTMST"],
    "BILLRUN": ["STMTGEN", "INVGEN"],
    "EODBATCH": ["LEDGPST", "TAXRPT"],
}
COPIES = {"VATCALC": ["VATFLDS"], "PRICENG": ["PRICEFLD"], "ACCTMST": ["ACCTREC"]}
READS = {
    "VATCALC": ["TAX-CONFIG"], "FXRATE": ["FXRATES"], "PRICENG": ["PRODUCT-MASTER"],
    "INVGEN": ["INVOICE"], "TAXRPT": ["LEDGER"], "STMTGEN": ["STATEMENT"],
    "AUDITLG": ["AUDITLOG"], "CUSTMST": ["CUSTOMER"],
}
WRITES = {"ACCTMST": ["ACCOUNT"], "LEDGPST": ["LEDGER"]}
COMMENT = {
    "VATCALC": "VAT calculation engine. Standard rate held as a literal; unchanged since 2011.",
    "FXRATE": "Foreign-exchange rate lookup. Pure read; no downstream calls.",
    "PRICENG": "Pricing engine. Applies VAT via VATCALC and writes an audit trail.",
    "INVGEN": "Invoice generation. Prices each line, adds VAT, writes the INVOICE file.",
    "ACCTMST": "Account master maintenance. Accrues interest and VAT on fees; updates ACCOUNT.",
    "TAXRPT": "Tax reporting. Aggregates priced lines for the HMRC return; reads the LEDGER.",
    "LEDGPST": "Ledger posting. Posts movements to the general LEDGER. Core financial store.",
    "STMTGEN": "Statement generation. Builds the customer statement; writes the STATEMENT file.",
    "AUDITLG": "Audit logging. Append-only writer. Called by many; calls nothing.",
    "CUSTMST": "Customer master. Onboards customers and opens accounts via ACCTMST.",
    "BILLRUN": "Monthly billing batch. Top-level driver; runs unattended overnight.",
    "EODBATCH": "End-of-day batch. Posts the day's ledger and produces the tax report.",
}
PROGRAMS = ["VATCALC", "FXRATE", "PRICENG", "INVGEN", "ACCTMST", "TAXRPT",
            "LEDGPST", "STMTGEN", "AUDITLG", "CUSTMST", "BILLRUN", "EODBATCH"]
FINANCIAL_STORES = {"LEDGER", "ACCOUNT"}
_STOP = {"add", "the", "new", "and", "for", "with", "make", "change", "into", "from",
         "that", "this", "our", "per", "all", "tier", "rate", "logic", "update", "modify"}


def _tokens(s):
    out, cur = [], ""
    for ch in s.lower():
        if ch.isalnum() or ch == "%":
            cur += ch
        else:
            if cur:
                out.append(cur)
            cur = ""
    if cur:
        out.append(cur)
    return [t for t in out if len(t) >= 3 and t not in _STOP]


def resolve_target(request):
    best, best_score = "VATCALC", 0
    for pid in PROGRAMS:
        hay = (pid + " " + COMMENT.get(pid, "")).lower()
        score = 0
        for t in _tokens(request):
            bare = t.rstrip("%")
            if not bare:
                continue
            if bare in pid.lower():
                score += 3
            elif bare in hay:
                score += 1
        if score > best_score:
            best, best_score = pid, score
    return best


def blast(target):
    parents, fan_in = {}, {}
    for p in PROGRAMS:
        for c in CALLS.get(p, []):
            parents.setdefault(c, set()).add(p)
            fan_in[c] = fan_in.get(c, 0) + 1
        for c in COPIES.get(p, []):
            parents.setdefault(c, set()).add(p)

    affected, pred, seen, queue = [], {}, {target}, [target]
    while queue:
        cur = queue.pop(0)
        for p in sorted(parents.get(cur, set())):
            if p in seen:
                continue
            seen.add(p)
            pred[p] = cur
            affected.append(p)
            queue.append(p)

    def path(n):
        out = [n]
        while n in pred:
            n = pred[n]
            out.append(n)
        return out

    interfaces = set()
    for pid in [target] + affected:
        interfaces.update(READS.get(pid, []))
        interfaces.update(WRITES.get(pid, []))

    high, reasons = [], {}
    for pid in affected:
        wf = next((t for t in WRITES.get(pid, []) if t in FINANCIAL_STORES), None)
        if wf:
            high.append(pid); reasons[pid] = "writes to shared financial store " + wf
        elif fan_in.get(pid, 0) >= 2:
            high.append(pid); reasons[pid] = "called from %d places — wide fan-out" % fan_in[pid]
        else:
            pth = path(pid)
            reasons[pid] = "depends on " + (pth[1] if len(pth) > 1 else target)
    return {"target": target, "affected": affected, "interfaces": sorted(interfaces),
            "high_risk": high, "reasons": reasons, "paths": {a: path(a) for a in affected}}


def analyse(request):
    request = (request or "").strip()
    if not request or request.lower() in ("hi", "hello", "help", "hey"):
        return ("**Legacy Safety Net** — I trace the blast radius of a change to legacy code.\n\n"
                "Tell me a change in plain English, e.g. *\"add a 15% VAT tier\"* or "
                "*\"change how account interest is accrued\"*, and I'll show every program it "
                "would break, the high-risk ones, and the tests you'd need.\n\nLive demo: " + DEMO_URL)

    target = resolve_target(request)
    b = blast(target)
    lines = [
        "**Change:** _" + request + "_",
        "**Target program:** `" + target + "` — " + COMMENT.get(target, ""),
        "",
        "**Blast radius:** %d programs affected · %d data interfaces · %d high-risk."
        % (len(b["affected"]), len(b["interfaces"]), len(b["high_risk"])),
    ]
    if b["high_risk"]:
        lines.append("\n**High-risk (verify these first):**")
        for pid in b["high_risk"]:
            lines.append("• `%s` — %s  \n  _%s_" % (pid, b["reasons"][pid], " → ".join(b["paths"].get(pid, [pid]))))
    if b["interfaces"]:
        lines.append("\n**Interfaces in scope:** " + ", ".join("`%s`" % i for i in b["interfaces"]))
    lines.append("\n**Before you change it:** pin the current behaviour with characterization tests "
                 "(the standard 20% VAT case, the zero-amount boundary, and each high-risk downstream path).")
    lines.append("\nSee the live dependency graph: " + DEMO_URL)
    return "\n".join(lines)


# The seed IS the agent's private key — never hardcode it. On Agentverse Hosted
# Agents you can omit it entirely (the platform assigns and persists a secure
# identity). For a stable address elsewhere, set the LSN_AGENT_SEED env var /
# secret to a random value, e.g. `python -c "import secrets;print(secrets.token_hex(32))"`.
agent = Agent(
    name="legacy-safety-net",
    seed=os.environ.get("LSN_AGENT_SEED"),
)

chat = Protocol(spec=chat_protocol_spec)


@chat.on_message(ChatMessage)
async def on_message(ctx: Context, sender: str, msg: ChatMessage):
    text = " ".join(c.text for c in msg.content if isinstance(c, TextContent)).strip()
    ctx.logger.info("request from %s: %r" % (sender, text))
    await ctx.send(sender, ChatAcknowledgement(
        timestamp=datetime.now(timezone.utc), acknowledged_msg_id=msg.msg_id))
    await ctx.send(sender, ChatMessage(
        timestamp=datetime.now(timezone.utc), msg_id=uuid4(),
        content=[TextContent(type="text", text=analyse(text))]))


@chat.on_message(ChatAcknowledgement)
async def on_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    ctx.logger.debug("ack from %s" % sender)


agent.include(chat, publish_manifest=True)


if __name__ == "__main__":
    print("Legacy Safety Net agent address:", agent.address)
    agent.run()
