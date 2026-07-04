# Legacy Safety Net — Submission

**Change decades-old code without breaking it.** Point it at a legacy module and get a
plain-English spec, a dependency / blast-radius map, and characterization tests that pin its
behaviour — then watch a proposed change turn a test **red** before you ship it, with a human
approval gate and an audit trail.

## Links

| | |
|---|---|
| **Live app** | https://legacy-safety-net.vercel.app |
| **GitHub (public)** | https://github.com/aswin-giridhar/legacy-safety-net |
| **ASI:One agent** | Active on Agentverse — `agent1qgn725myvj44pxv7ksy77a3j5e05ct4u39rf6kvcpuzgvx2clq7524wc0pa` |
| **Pitch deck** | `legacy-safety-net-deck.html` (HTML) · `legacy-safety-net.pptx` (Google Slides) |
| **Builder** | Aswin Giridhar |

## Short description

Enterprises are frozen by legacy code that's undocumented, untested, and understood by almost
no one — so a two-day change takes six months. Legacy Safety Net reads the actual source (not a
guess) and, for any module, produces a plain-English spec cited to file:line, a dependency graph
showing the blast radius of a change, and characterization tests that pin current behaviour. You
can then **simulate the change and watch a test fail live** — proving your fix is safe before you
make it. The AI does weeks of tracing in minutes; the engineer keeps the sign-off.

## Feature set

- **Blast-radius graph** — every program a change ripples to, computed from the real call-graph.
- **Grounded spec** — plain-English, every claim cited to `file:line`, with provenance peek.
- **Characterization tests** — golden-master tests that pin today's behaviour.
- **Simulate a change → PASS / FAIL / STALE** — the differentiator: prove safety, don't just describe it.
- **Exports** — runnable pytest / Gherkin / JSON tests, and a Markdown change plan.
- **Audit trail** — hashed, timestamped approvals; the human keeps control.
- **Upload your own COBOL** — parse arbitrary code live, in the browser.
- **ASI:One agent** — the same engine, usable in a Fetch/ASI:One conversation.

## Positioning (vs. the field)

The legacy-modernization lane is crowded (STRATA, PactLine, RegShift, ABAP Ghost all trace impact
with "line-level evidence" and human approval). Our wedge: **none of them generate the tests or
demonstrate the safety net catching a fall.** Lead with *"we make the change provably safe"* — the
simulate → red-test moment — plus execution completeness: a live deployed app **and** a live
ASI:One agent, not a prototype.

## Bounty coverage

### Conduct — "Make Legacy Move" (primary)
- [x] Real weeks-long enterprise process (change-impact tracing on legacy code)
- [x] Grounded/structural: real call-graph, every claim cited to `file:line` (provenance peek)
- [x] Human-in-the-loop: approval gate + audit trail, nothing auto-applies
- [x] The safety net others skip: generates tests **and** proves a change fails them live
- [ ] Record the 2-min demo (Tests tab → slider → RED)

### Fetch.ai — ASI:One agent
- [x] Multi-step agent solving a real problem, same engine
- [x] Registered on Agentverse (Hosted, Active); Chat Protocol published
- [ ] **Demonstrate in an ASI:One conversation** → screenshot (prompts below)

## Final steps checklist

- [ ] **ASI:One screenshot** — https://asi1.ai → search *legacy safety net* → paste a prompt below
- [ ] **Web demo recording** — 60–90s: open on the **Tests** tab, drag the rate slider to show the RED fail, peek a citation, approve → audit
- [ ] Confirm the deck's closing slide links (demo, agent, GitHub)
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

Expected reply: `VATCALC` → **9 programs affected · 7 interfaces · 5 high-risk**, with the
high-risk list, dependency paths, and a link back to the live visual demo.
