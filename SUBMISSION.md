# Devpost submission — Patiently

Paste-ready text for the submission form. Every claim here is verified against
the deployed app; see `README.md` for the evidence and `npm run eval` to check it.

---

## Project name

**Patiently — a clinic your agent can actually use**

## Elevator pitch (one line)

An outpatient clinic that exposes its queue, charts and prescriptions as 20
WebMCP tools — where every action that touches a patient's care stops and waits
for a human to click.

## Live demo

**https://patiently-webmcp.vercel.app**

Open in ChatGPT's in-app browser, or Chrome 149+ with
`chrome://flags/#enable-webmcp-testing`. **No flag is required** — if your
browser has no native WebMCP, the site installs the runtime itself, so the tools
register either way. No sign-in.

The front door registers two tools of its own, so you can simply ask your agent
to *"list the demo surfaces"* and then *"open the clinician demo"*.

## Repository

**https://github.com/0xNoramiya/patiently-webmcp** — MIT.

---

## Why this use case is a strong fit for WebMCP

WebMCP's distinguishing property is not that an agent can call tools. It is
**where** those tools run: inside a page the human is already looking at, in a
session they are already authenticated to. A clinic needs all three consequences.

**The auth problem disappears.** A conventional MCP server for a clinic would
need its own copy of the identity model, its own credential store, and its own
audit trail — a second front door to patient data, which is the last thing a
clinic wants. Patiently's tools inherit the login the clinician already has.
There is no key to issue, leak or revoke, and the agent can do exactly what the
person sitting next to it can do.

**The human stays in the room.** Because the tools run in the page, every effect
is rendered. When the agent pulls a chart, that patient becomes the selected
patient on the clinician's actual screen. It is not operating a system elsewhere
and reporting back.

**Consent can be enforced structurally rather than by prompting.** A server-side
tool that writes a prescription has already written it by the time a human sees
the result. A WebMCP tool can park its own `execute` on a promise that only a
click resolves — so the write does not exist on the un-approved branch. That is
a guarantee, not an instruction a model may ignore.

Healthcare is where all of this stops being a nicety. The cost of an agent
quietly getting it wrong is not a bad purchase.

## How it creates a better user experience

**For the clinician.** A physician mid-clinic has a patient in front of them and
both hands occupied. Today they stop and type, or defer the note and write six
badly at 6pm. Here they talk: *"who's waiting longest with a red flag — pull
their chart, take these vitals, draft the note."* The agent does the typing, the
lookup and the cross-referencing. Every clinical decision stays theirs, and they
never touch a keyboard.

**For the patient.** Someone in a waiting room may be in pain, holding a child,
or not fluent in the language the form is written in. Typing structured clinical
history into a phone is the weakest link in the whole system. Here they describe
symptoms out loud, in their own language, to the agent they already use — and a
structured chart comes out the other end, written before the doctor calls them
in.

## What people and agents can do together that was hard before

A patient describes chest pain in Bahasa Indonesia to their own agent. An
independent triage classifier reads the same message server-side, fires
`CHEST_PAIN_CARDIAC`, and the ticket jumps the queue — while the patient's agent
is told to send them to reception now. By the time the clinician's agent pulls
the chart, the HPI, the follow-up delta from last week's visit, and "pulmonary
embolism — must not miss" are already written.

The clinician then dictates vitals, drafts a SOAP note and prescriptions, and
signs one — **and every one of those commits opened a dialog and blocked until
they clicked.** Two agents, two humans, one patient, one shared live page.

The part that is genuinely new is not the automation. It is that the automation
**stops**. Three safety properties are structural, not prompted:

- **Proposals queue and are never answered by anything but a person.** The
  outcome an agent receives is `approved` / `declined` / `expired` / `cancelled`,
  because only one of those is a decision somebody made. An agent is never told
  "the clinician declined" about a dialog nobody saw.
- **A patient cannot talk their way up the queue — and cannot talk their way
  down it either.** Naming a red-flag code without the symptoms fires nothing;
  describing real symptoms fires the code *even when the patient insists they
  are fine*.
- **A failed safety check never looks like a clean one.** If the triage
  classifier is unreachable, the turn is recorded as unscreened and both agents
  and the clinician are told so — rather than an empty flag list reading as
  reassurance.

## How WebMCP was implemented

**20 tools across four surfaces**, registered per page so the agent is never
offered one that cannot currently work:

| Surface | Tools |
| --- | --- |
| Front door `/` | 2 — describe the demo, navigate into it |
| Clinician `/dashboard` | 11 — queue, chart, vitals, interactions, SOAP, Rx, signing |
| Patient `/p/<ticket>` | 6 — queue position, multilingual intake, caregiver link |
| Reception `/receptionist` | 1 — **declarative**, a plain form with `toolname` |

Nineteen are registered imperatively through `document.modelContext.registerTool`
behind one adapter (`lib/webmcp/runtime.ts`). The twentieth is a plain HTML form
carrying `toolname` / `tooldescription` / `toolparamdescription`, where the
browser synthesises the schema from the controls — deliberately with **no
`toolautosubmit`**, because issuing a ticket gives a real person a queue number.

Every tool sits in exactly one tier, visible in its annotations: **read**
(`readOnlyHint`) runs freely, **draft** produces something explicitly unsigned,
**commit** blocks on a click. `get_previsit_chart` carries
`untrustedContentHint` and fences the patient's own words in an explicit
envelope, and the triage classifier fences them on the way *in* too.

Three implementation details worth knowing, each of which cost real debugging:

- **The site ships its own runtime.** Native `document.modelContext` only exists
  in Chrome behind a flag and in ChatGPT's browser, so a page that merely
  *consumes* the API registers nothing anywhere else. The polyfill is installed
  at module scope — React flushes child effects before parent ones, so a
  provider doing it in an effect would be too late.
- **`respondWith()` cannot be called from React's `onSubmit`.** The runtime takes
  a document-capture submit listener and queues a microtask that settles the
  call before the event reaches the form. A bridge claims its own capture
  listener first.
- **Reasoning models speak a different dialect** — no `temperature`,
  `max_completion_tokens`, and no output at all while thinking. The client shapes
  each request per model, and the triage classifier is pinned to one that
  honours `temperature=0`, because a red-flag decision that cannot be reproduced
  cannot be audited. They were also measured and rejected on latency: gpt-5 took
  20.6s to write a chest-pain SOAP note against gpt-4.1's 3.0s, with the same
  clinical content. Across the whole consultation that is 120 seconds of waiting
  versus 41.

**Verification.** 204 API tests and three eval suites that drive the real
`document.modelContext` in a real browser against the deployed app — 91
structural assertions, a 35-assertion live consultation on real models, and 12
prompt-injection attacks. There is no stub in the repository; an earlier one was
deleted after it hid three genuine bugs.

Discovery is published too: `/llms.txt`, `/.well-known/webmcp`, robots with AI
crawler rules, sitemap, JSON-LD and Open Graph.

---

## Provenance (required disclosure)

**The clinical platform pre-dates this challenge.** The queue engine, multi-agent
intake, triage classifier, SOAP and prescription drafting, interaction checking,
vitals and PDF export were built in May 2026 for a different hackathon.

**Every line of WebMCP work is new, built during the submission period** —
26 commits, 32 new files, 50 modified, +7,169 / −899 lines, all after the
baseline commit. The repository's first commit is that untouched baseline, so
the split is verifiable directly:

```bash
git diff --stat $(git log --format=%H --reverse | head -1) HEAD
```

Per the rules, only the submission-period work is offered for judging.

## Testing notes for judges

- No credentials needed. The demo build ships the clinician dashboard unlocked.
- **The clinic restores itself.** One shared dataset, weeks of judging — once
  there are no active tickets and nothing has been touched for ten minutes, the
  demo data is put back. It never fires while you are using it.
- All patient data is synthetic. Nothing here is medical advice, and the drafting
  tools produce unsigned drafts for a clinician to review — never a diagnosis.
