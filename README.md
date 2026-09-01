# Patiently

> Waiting rooms that work for you.
> A multi-agent pre-visit intake and queue system for outpatient clinics.

[![Live demo](https://img.shields.io/badge/Live%20demo-patiently.kudaliar.id-e11d48)](https://patiently.kudaliar.id)
[![AI Agent Olympics 2026](https://img.shields.io/badge/AI%20Agent%20Olympics-2026-10b981)](https://lablab.ai/ai-hackathons/milan-ai-week-hackathon/muhammad-rifqi-haikal/patiently)
[![Stack](https://img.shields.io/badge/Stack-Next.js%2014%20%C2%B7%20FastAPI%20%C2%B7%20PostgreSQL%2016-0e8265)](#stack)
[![License](https://img.shields.io/badge/License-MIT-cbd5e1)](#license)

**Live deployment:** https://patiently.kudaliar.id · **Submission:** https://lablab.ai/ai-hackathons/milan-ai-week-hackathon/muhammad-rifqi-haikal/patiently

Patiently turns the clinic queue into productive time. A patient scans the QR code on their paper ticket and:

1. Sees their live queue position and expected wait time.
2. Chats with the **Intake Agent** while the **Triage Agent** watches every message for red flags in parallel.
3. Gets bumped to the front automatically if a danger sign fires.

By the time the physician calls the patient in, the **Summarizer Agent** has already written a 30-second pre-visit chart with HPI, follow-up delta, suggested questions, and differentials. The doctor reads, examines, decides — no cold-start interview.

After the visit, a **scheduled Featherless workflow** drafts personalized appointment-reminder SMS messages with EMR context (last week's complaint, the meds we prescribed). And every consultation can be **transcribed end-to-end by Speechmatics** with speaker diarization — the demo synthesizes a mock doctor–patient dialogue so the pipeline runs without a microphone.

---

## Why this exists

A typical outpatient physician sees ~40 patients in a half-day. That's 8 minutes per patient. Patiently moves the cold-start interview into the waiting room and surfaces follow-up context that today gets lost between paper records and the patient's memory.

The clinical-safety story:
- **Defense in depth** — the conversational Intake Agent has one job (gather information warmly); a separate Triage Agent independently re-reads every patient turn looking for red flags. If the conversational agent gets distracted or role-played past a danger sign, the classifier catches it.
- **No diagnostic claims** — the agents explicitly do NOT diagnose or reassure. They gather facts. The Summarizer labels differentials as "considerations, not diagnoses."

---

## Stack

| Layer            | Tool                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------- |
| Frontend         | Next.js 14 (App Router), TypeScript, Tailwind, custom shadcn-style primitives          |
| API              | FastAPI 0.115 + Pydantic v2, SQLAlchemy 2.0 async, Alembic                             |
| Database         | PostgreSQL 16 (JSONB for session state)                                                |
| Clinical LLM     | Google Gemini 2.5 Flash Lite (`response_schema` for typed JSON; multi-agent pipeline)  |
| Reminder LLM     | Featherless (OpenAI-compatible) — `meta-llama/Meta-Llama-3.1-8B-Instruct` by default   |
| Scheduler        | APScheduler (60s cron tick) running inside the FastAPI lifespan                        |
| Speech-to-text   | Speechmatics batch ASR (`eu1.asr.api.speechmatics.com/v2`), speaker diarization        |
| Realtime         | Server-Sent Events                                                                     |
| Deploy           | Single VM via Docker Compose + Caddy auto-TLS (targets Vultr)                          |

---

## Architecture

```
┌─────────────┐  scan QR    ┌──────────────────┐
│  Patient    │ ──────────▶ │  Next.js Web     │
│  phone      │ ◀ SSE live  │  /p/[ticket]     │
└─────────────┘             │  /intake (chat)  │
                            └────────┬─────────┘
                                     │ REST + SSE
                                     ▼
┌─────────────┐             ┌──────────────────┐         ┌──────────────────┐
│  Physician  │ ◀── SSE ──▶ │   FastAPI        │ ──────▶ │  Gemini 2.5      │
│  /dashboard │             │ ── intake agent  │         │  Flash Lite      │
└─────────────┘             │ ── triage agent  │         └──────────────────┘
       ▲                    │ ── summarizer    │ ──────▶ ┌──────────────────┐
       │                    │ ── reminder cron │         │  Featherless     │
       │                    │ ── transcripts   │         │  (SOAP + SMS)    │
       │ Reminders panel    │                  │         └──────────────────┘
       │ Transcript widget  │                  │ ──────▶ ┌──────────────────┐
       │                    │                  │         │  Speechmatics    │
       │                    │                  │         │  batch ASR       │
       │                    └────────┬─────────┘         └──────────────────┘
       │                             ▼
       │                    ┌──────────────────┐
       │                    │  PostgreSQL 16   │
       │                    │  patients/visits │
       │                    │  /tickets/intake │
       │                    │  /reminders      │
       │                    │  /transcripts    │
       │                    └──────────────────┘
       │
       ▼
APScheduler tick (60s) ── reads due reminders ──▶ Featherless ──▶ persisted as "sent"
```

---

## The three clinical agents

### Intake Agent — conversational, English Bahasa-Indonesia-light tone
- One focused question per turn (OPQRST for new complaints, follow-up delta for return visits)
- Knows nothing about red flags — its job is to gather information warmly
- Returns structured `extracted_fields` every turn (merged across the session)
- Greets the patient by name and references their previous prescription if it's a follow-up

### Triage Agent — independent per-turn classifier
- Receives EMR context + prior conversation + the latest patient message
- Returns one of 8 red-flag codes if any fire:
  `CHEST_PAIN_CARDIAC`, `STROKE_SYMPTOMS`, `RESPIRATORY_DISTRESS`, `OBSTETRIC_BLEEDING`, `PEDS_RED_FLAG`, `SEVERE_DEHYDRATION`, `ANAPHYLAXIS_SUSPECT`, `SUICIDAL_IDEATION`
- Temperature 0.0 — deterministic
- Runs in `asyncio.gather()` with the Intake Agent, so latency stays at `max(intake, triage)` instead of `sum`
- On fire → bumps ticket priority (100 for critical, 50 for urgent) and emits an SSE `triage_alert` to the dashboard

### Summarizer Agent — physician chart writer
- Runs once when intake completes (FastAPI BackgroundTask)
- Receives: full transcript + structured fields from Intake + flags from Triage + EMR history
- Returns a typed `IntakeSummary` with chief complaint, HPI paragraph, relevant history, triage assessment, follow-up delta (for returns), suggested follow-up questions, and 2-3 differentials with ICD-10 codes

---

## The reminder workflow (Featherless)

- New `appointment_reminders` table holds `(patient_id, visit_id, scheduled_for, appointment_at, reason, channel, status, message, generated_at, sent_at)`
- APScheduler interval job runs every 60s (started in the FastAPI lifespan)
- Picks up rows where `status='pending'` AND `scheduled_for <= now()`
- Sends a system + user prompt to Featherless with:
  - Patient first name + appointment date/time
  - Reason for the appointment
  - Previous visit context (complaint + prescriptions) when available
- Persists the generated text, marks `sent`
- Dashboard right rail shows pending vs. sent reminders with a per-row Generate button and a "Run due now" trigger for the demo

Example generated message:
> Hi Sarah, You have an appointment scheduled for Sunday, May 24… This is a follow-up appointment regarding your cough, as previously discussed on May 10 when you were experiencing a productive cough and mild fever. Reply STOP to cancel.

---

## The transcription pipeline (Speechmatics)

The dashboard ticket detail has a "▶ Play & transcribe" button. Clicking it:

1. Picks a dialogue scenario based on the ticket state:
   - `cardiac` if the Triage Agent fired `CHEST_PAIN_CARDIAC`
   - `followup` if `is_followup=true`
   - `general` otherwise
2. Synthesizes a mock doctor–patient MP3 from the scenario using two voices
3. Caches the audio at `static/audio/{ticket_id}.mp3` and serves it via `/api/static/audio/...`
4. POSTs the MP3 to `https://eu1.asr.api.speechmatics.com/v2/jobs/` with `diarization=speaker`
5. Polls `/v2/jobs/{id}` until `status='done'`
6. Fetches `/v2/jobs/{id}/transcript?format=txt` and persists as `ConsultationTranscript`
7. Renders the speaker-diarized transcript (S1 = doctor, S2 = patient) alongside an `<audio>` player

Total round-trip on the free Speechmatics tier: ~8–13 seconds for a 30-second dialogue.

---

## Project layout

```
apps/
  api/                    FastAPI service
    app/
      core/               config, db
      models/             SQLAlchemy ORM
      schemas/            Pydantic schemas
      services/           queue engine, ETA, triage priority, event bus,
                          reminder cron, transcript pipeline
      agents/             intake, triage, summarizer, reminder (LLM callers)
        prompts/          system prompts for each clinical agent
      integrations/       Featherless, Speechmatics, mock-audio clients
      api/v1/             REST routes + SSE
    alembic/              migrations
    seed/                 demo data (patients, visits, reminders)
  web/                    Next.js 14 App Router
    app/
      page.tsx                       landing
      p/[ticket]/page.tsx            patient queue view
      p/[ticket]/intake/page.tsx     chat UI
      dashboard/page.tsx             physician dashboard
      receptionist/page.tsx          ticket issuance
infra/
  docker-compose.yml
  Caddyfile
  .env.example
```

---

## Quick start (local)

Requires Docker (or Python 3.11 + Node 20 + PostgreSQL 16 locally).

```bash
git clone https://github.com/0xNoramiya/patiently.git
cd patiently
cp infra/.env.example infra/.env
# Edit infra/.env: paste GEMINI_API_KEY, FEATHERLESS_API_KEY, SPEECHMATICS_API_KEY

make up        # docker compose up -d --build
make seed      # python -m seed.demo_scenarios — wipes & loads demo state
```

Then open:
- http://localhost:3000 — landing
- http://localhost:3000/receptionist — token `demo-receptionist-token`
- http://localhost:3000/dashboard — password `clinic2026`
- http://localhost:8000/docs — FastAPI auto-docs

Or hit the **live deployment** instead:
- https://patiently.kudaliar.id — landing
- https://patiently.kudaliar.id/receptionist?token=demo-receptionist-token
- https://patiently.kudaliar.id/dashboard — password `clinic2026`
- https://patiently.kudaliar.id/health — API health

For pure-host dev (no Docker):
```bash
# API
cd apps/api && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
DATABASE_URL=postgresql+asyncpg://… .venv/bin/alembic upgrade head
DATABASE_URL=… .venv/bin/python -m seed.demo_scenarios
DATABASE_URL=… GEMINI_API_KEY=… FEATHERLESS_API_KEY=… SPEECHMATICS_API_KEY=… \
  .venv/bin/uvicorn app.main:app --port 8000

# Web
cd apps/web && npm install --legacy-peer-deps
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

---

## API reference (selected)

| Method | Path                                              | Auth                  | Description                                         |
| ------ | ------------------------------------------------- | --------------------- | --------------------------------------------------- |
| GET    | `/api/queue/{poli}`                               | —                     | Live queue snapshot for a department                |
| GET    | `/api/queue/{poli}/stream`                        | —                     | SSE stream of queue updates                         |
| GET    | `/api/tickets/{id}`                               | —                     | Ticket detail incl. patient + previous visit        |
| POST   | `/api/admin/tickets`                              | `X-Receptionist-Token`| Issue new ticket                                    |
| POST   | `/api/admin/tickets/{id}/call`                    | `X-Admin-Password`    | Physician calls the patient                         |
| POST   | `/api/admin/tickets/{id}/complete`                | `X-Admin-Password`    | Mark consultation done                              |
| POST   | `/api/intake/{ticket_id}/start`                   | —                     | Begin pre-visit intake (Intake + Triage agents)     |
| POST   | `/api/intake/{ticket_id}/message`                 | —                     | Patient sends a message → both agents in parallel   |
| GET    | `/api/admin/reminders`                            | `X-Admin-Password`    | List scheduled & sent reminders                     |
| POST   | `/api/admin/reminders/{id}/fire`                  | `X-Admin-Password`    | Force-fire a reminder via Featherless               |
| POST   | `/api/admin/reminders/run-due`                    | `X-Admin-Password`    | Run all reminders whose `scheduled_for` has passed  |
| POST   | `/api/admin/tickets/{id}/transcript`              | `X-Admin-Password`    | Run the mock-audio → Speechmatics pipeline          |
| GET    | `/api/admin/tickets/{id}/transcript`              | `X-Admin-Password`    | Fetch existing transcript                           |
| GET    | `/api/static/audio/{ticket_id}.mp3`               | —                     | Cached consultation audio                           |

---

## Environment variables

```ini
# Required for the clinical agents
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash-lite

# Required for the reminder workflow
FEATHERLESS_API_KEY=
FEATHERLESS_MODEL=meta-llama/Meta-Llama-3.1-8B-Instruct

# Required for transcription
SPEECHMATICS_API_KEY=

# Admin / receptionist gates
ADMIN_PASSWORD=clinic2026
RECEPTIONIST_TOKEN=demo-receptionist-token

# Misc
CLINIC_NAME=Patiently Demo Clinic
CORS_ORIGINS=http://localhost:3000
DATABASE_URL=postgresql+asyncpg://patiently:patiently@db:5432/patiently
SYNC_DATABASE_URL=postgresql://patiently:patiently@db:5432/patiently
```

Get keys:
- Gemini → https://aistudio.google.com/apikey (free tier: 15 RPM on flash-lite)
- Featherless → https://featherless.ai
- Speechmatics → https://portal.speechmatics.com (free tier covers the demo)

---

## Queue ordering & ETA

Tickets are sorted by `(-priority, issued_at)`. Default priority is 0. Triage flags map to:

| Flag                    | Priority |
| ----------------------- | -------- |
| CHEST_PAIN_CARDIAC      | 100      |
| STROKE_SYMPTOMS         | 100      |
| RESPIRATORY_DISTRESS    | 100      |
| ANAPHYLAXIS_SUSPECT     | 100      |
| PEDS_RED_FLAG           | 100      |
| SEVERE_DEHYDRATION      | 100      |
| OBSTETRIC_BLEEDING      |  50      |
| SUICIDAL_IDEATION       |  50      |

ETA is the rolling average of the last 20 completed consultations in the last 24h. With fewer than 5 samples we fall back to per-department priors. The patient sees a ±20% range so the UX feels honest.

---

## Deploying to Vultr

1. Provision a Vultr Cloud Compute instance (4 GB RAM is plenty for the demo).
2. Install Docker + Compose (`curl https://get.docker.com | sh`).
3. Point a DNS A record at the instance, then in `infra/.env` set `DOMAIN=your.host`. Caddy will fetch a Let's Encrypt cert on boot.
4. `git clone`, `cd infra && docker compose up -d --build`.
5. `docker compose exec api python -m seed.demo_scenarios`.

---

## Disclaimer

Patiently is a prototype for educational and demo purposes. It does not provide medical advice or diagnosis. All clinical decisions remain with the attending physician. Differentials and suggested questions are clearly labelled as system suggestions, not diagnoses.

## Running the tests

```bash
cd apps/api
.venv/bin/pip install pytest
.venv/bin/python -m pytest -q tests/
```

The CI workflow at `.github/workflows/ci.yml` runs the same suite on every push and pull request, plus an import smoke test on the API and a full `next build` of the web app.

## License

MIT.

## Credits

Built for the [AI Agent Olympics 2026](https://lablab.ai/ai-hackathons/milan-ai-week-hackathon/muhammad-rifqi-haikal/patiently) hackathon (Milan AI Week). Live demo: **[patiently.kudaliar.id](https://patiently.kudaliar.id)**.

- Clinical reasoning by [Google Gemini](https://ai.google.dev)
- Reminder generation by [Featherless](https://featherless.ai)
- Speech-to-text by [Speechmatics](https://speechmatics.com)
