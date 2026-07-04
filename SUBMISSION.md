# Legacy Safety Net — Submission

**Change decades-old code without breaking it.** Point it at a legacy module and get a
plain-English spec, a live dependency / blast-radius map, and characterization tests that
pin its behaviour — so an engineer can change it safely, with a human approval gate.

## Links

| | |
|---|---|
| **Live app** | https://legacy-safety-net.vercel.app |
| **GitHub (public)** | https://github.com/aswin-giridhar/legacy-safety-net |
| **ASI:One agent** | Active on Agentverse — `agent1qgn725myvj44pxv7ksy77a3j5e05ct4u39rf6kvcpuzgvx2clq7524wc0pa` |
| **Pitch deck** | `legacy-safety-net-deck.html` (HTML) · `legacy-safety-net.pptx` (Google Slides) |
| **Builder** | Aswin Giridhar |

## Short description

Enterprises are frozen by legacy code that's undocumented, untested, and understood by
almost no one — so a two-day change takes six months. Legacy Safety Net reads the actual
source (not a guess) and, for any module, produces a plain-English spec cited to file:line,
a dependency graph showing the blast radius of a change, and characterization tests that pin
current behaviour. The AI does weeks of tracing in minutes; the engineer keeps the sign-off.

## Bounty coverage

### Conduct — "Make Legacy Move" (primary)
- [x] Attacks a real weeks-long enterprise process (change-impact tracing on legacy code)
- [x] Grounded/structural: parses a real call-graph, every claim cited to `file:line`
- [x] Human-in-the-loop: approval gate, nothing auto-applies
- [x] The safety net others skip: generates characterization tests
- [ ] Screenshot / record the 2-min demo (VAT change → 9/7/5 → spec → tests → approve)

### Fetch.ai — ASI:One agent (+ stack)
- [x] Multi-step agent solving a real problem, using the same engine
- [x] Registered on Agentverse (Hosted, Active)
- [x] Discoverable via ASI:One (Chat Protocol manifest published)
- [ ] **Demonstrate in an ASI:One conversation** → screenshot the reply (see prompts below)

## Final steps checklist

- [ ] **ASI:One screenshot** — https://asi1.ai → search *legacy safety net* → paste a prompt below → screenshot the reply
- [ ] **Web demo recording** — 60–90s screen capture of the live app (VAT change → graph → Spec → Tests → Approve)
- [ ] Confirm the deck's closing slide links are correct (demo, agent, GitHub)
- [ ] Submit to the Conduct track + the Fetch/Superteam listing

## ASI:One demo prompts

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

Expected reply: `VATCALC` → **9 programs affected · 7 interfaces · 5 high-risk**, with the
high-risk list, dependency paths, and a link back to the live visual demo.
