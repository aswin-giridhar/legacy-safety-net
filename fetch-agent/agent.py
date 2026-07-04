"""Legacy Safety Net — ASI:One agent.

A uAgent that speaks the standard Chat Protocol, so it is discoverable and usable
directly inside an ASI:One conversation. Ask it, in plain English, what a change to
a legacy module would break — it replies with the computed blast radius, the
high-risk programs, and a link to the live visual demo.

Run:
    pip install -r requirements.txt
    python agent.py
Then connect the printed Agent Address on Agentverse (Mailbox) to publish it to
ASI:One. See README.md.
"""
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

import engine

DEMO_URL = "https://legacy-safety-net.vercel.app"
REPO = engine.parse()

# The seed IS the agent's private key — never hardcode/commit it. Set the
# LSN_AGENT_SEED env var to a random value for a stable address, e.g.
#   export LSN_AGENT_SEED="$(python -c 'import secrets;print(secrets.token_hex(32))')"
# If unset, uagents generates an ephemeral identity for local testing.
agent = Agent(
    name="legacy-safety-net",
    seed=os.environ.get("LSN_AGENT_SEED"),
    port=8001,
    mailbox=True,
)

chat = Protocol(spec=chat_protocol_spec)


def analyse(request: str) -> str:
    request = (request or "").strip()
    if not request or request.lower() in {"hi", "hello", "help"}:
        return (
            "**Legacy Safety Net** — I trace the blast radius of a change to legacy code.\n\n"
            "Tell me a change in plain English, e.g. *\"add a 15% VAT tier\"* or "
            "*\"change how account interest is accrued\"*, and I'll show every program it "
            f"would break, the high-risk ones, and the tests you'd need.\n\nLive visual demo: {DEMO_URL}"
        )

    target = engine.resolve_target(REPO, request)
    b = engine.blast(REPO, target)
    comment = REPO.comment.get(target, "")

    lines = [
        f"**Change:** _{request}_",
        f"**Target program:** `{target}` — {comment}",
        "",
        f"**Blast radius:** {len(b['affected'])} programs affected · "
        f"{len(b['interfaces'])} data interfaces · {len(b['high_risk'])} high-risk.",
    ]
    if b["high_risk"]:
        lines.append("\n**High-risk (verify these first):**")
        for pid in b["high_risk"]:
            path = " → ".join(b["paths"].get(pid, [pid]))
            lines.append(f"• `{pid}` — {b['reasons'][pid]}  \n  _{path}_")
    if b["interfaces"]:
        lines.append("\n**Interfaces in scope:** " + ", ".join(f"`{i}`" for i in b["interfaces"]))
    lines.append(
        "\n**Before you change it:** pin the current behaviour with characterization tests "
        "(the standard 20% VAT case, the zero-amount boundary, and each high-risk downstream path)."
    )
    lines.append(f"\nSee the live dependency graph: {DEMO_URL}")
    return "\n".join(lines)


@chat.on_message(ChatMessage)
async def on_message(ctx: Context, sender: str, msg: ChatMessage):
    text = " ".join(c.text for c in msg.content if isinstance(c, TextContent)).strip()
    ctx.logger.info(f"request from {sender}: {text!r}")
    await ctx.send(
        sender,
        ChatAcknowledgement(timestamp=datetime.now(timezone.utc), acknowledged_msg_id=msg.msg_id),
    )
    reply = analyse(text)
    await ctx.send(
        sender,
        ChatMessage(
            timestamp=datetime.now(timezone.utc),
            msg_id=uuid4(),
            content=[TextContent(type="text", text=reply)],
        ),
    )


@chat.on_message(ChatAcknowledgement)
async def on_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    ctx.logger.debug(f"ack from {sender} for {msg.acknowledged_msg_id}")


agent.include(chat, publish_manifest=True)


if __name__ == "__main__":
    print(f"Legacy Safety Net agent address: {agent.address}")
    agent.run()
