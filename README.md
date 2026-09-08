<div align="center">

# ✦ ANIMARADAR

### Find the right yes.

**A human-led local-market intelligence platform for finding, understanding, scoring, and contacting the businesses most likely to buy from you.**

![Stage](https://img.shields.io/badge/stage-building-f28b62?style=for-the-badge)
![Frontend](https://img.shields.io/badge/frontend-Next.js%2016-111827?style=for-the-badge)
![API](https://img.shields.io/badge/API-FastAPI-0f766e?style=for-the-badge)
![Data](https://img.shields.io/badge/data-Supabase-3ecf8e?style=for-the-badge)

</div>

> [!IMPORTANT]
> **This is now a standalone repository.** The folder contains the web app, API, Supabase migrations, prompt contracts, provider clients, and the local runbook. It is designed to connect to a Supabase project named `anima-radar`.

<div align="center">

```text
  PROFILE  ───────►  RADAR  ───────►  READ  ───────►  SCORE  ───────►  HUMAN SEND
  8 answers         city scan          websites       reasons          WhatsApp / email
       ▲                                                          │
       └────────────────────── replies + outcomes ◄──────────────┘
```

</div>

## What exists right now

| Layer | Location | Status |
|---|---|---|
| Product UI | [`web/`](web/) | Next.js App Router shell with Perfil, Radar, Prospectos, Enviar, Panel, and login |
| API | [`radar-api/`](radar-api/) | FastAPI contracts, typed models, provider clients, LLM boundary, repository boundary, worker stages |
| Database | [`supabase/`](supabase/) | Migrations, RLS, tenant bootstrap function, local config, seed tenants |
| Prompt contracts | [`prompts/`](prompts/) | Versioned ICP, extraction, scoring, and drafting prompts |
| CLI | [`scripts/run_scan.py`](scripts/run_scan.py) | Starts a scan through the API contract |

The deployed web application uses Supabase Auth and tenant-scoped Supabase records. The Python service remains the provider/worker boundary for discovery and enrichment; the product UI no longer substitutes sample companies, prospects, messages, or metrics.

## Feature map and live-readiness

Every operational surface reads the active company from the authenticated platform user. A platform administrator can create companies, switch the active company, provision users and inspect each isolated workspace.

| Surface | Intended job | Current state |
|---|---|---|
| Overview | See the company state and next setup action | Live Supabase counts and latest scan; explicit empty states |
| Business DNA | Define offer, fit, proof, language and exclusions | Loads and saves the active tenant profile in Supabase |
| Radar scans | Define market, radius and categories | Creates a tenant-scoped scan and database queue job |
| Prospects | Review sourced evidence and approve/discard | Reads and updates tenant-scoped prospect records |
| Outreach | Review prepared messages | Reads tenant-scoped message records; automatic sending remains off |
| Learning Loop | Inspect replies, meetings, orders and losses | Reads tenant-scoped outcome history |
| Settings | Configure company name and language | Reads and updates the active tenant |
| Administration | Create companies and users | Platform-admin-only Supabase operations and company switching |
| Languages | Operate the complete web interface | English and Spanish with a persistent global switch |

### What remains before automated discovery is live

1. Configure production credentials for the selected discovery providers (for example Google Places and Exa) and the extraction/scoring model.
2. Run the Python worker continuously so it can claim the `jobs` created by the web application, retry failures, collect evidence and draft messages.
3. Complete one small end-to-end provider test per market and verify evidence quality before increasing scan volume.
4. Configure the company’s consent, review and channel rules. Automated sending remains intentionally out of scope for v1.

The first live acceptance test should be: sign in → create the tenant → answer Business DNA → start one small scan → inspect sourced evidence → approve one message → manually send it → record the outcome in Learning Loop.

## Supabase: connect this repo in five minutes

### 1. Create or select the project

Create a Supabase project with the project name:

```text
anima-radar
```

Copy the project URL, anon key, and service-role key from **Project Settings → API**.

### 2. Link the local repository

From this directory:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

### 3. Apply the schema

```bash
supabase db push
```

This creates tenants, users, profiles, scans, prospects, messages, outcomes, jobs, offers, campaigns, evidence, experiments, exclusions, business events, indexes, RLS policies, and `bootstrap_tenant()`.

> [!WARNING]
> **Migration order matters.** `002_acquisition_model.sql` depends on the tables from `001_initial_schema.sql`. Do not paste migration 002 by itself into the SQL Editor. The safest path is `supabase db push`, which applies both files in order. If using the SQL Editor manually, run the complete contents of `001_initial_schema.sql` first and `002_acquisition_model.sql` second.

To diagnose a missing base table:

```sql
select to_regclass('public.tenants');
```

The expected result is `public.tenants`. If it returns `null`, apply migration 001 before retrying migration 002.

For a local Supabase database instead:

```bash
supabase start
supabase db reset
```

### 4. Configure the applications

```bash
cp .env.example radar-api/.env
cp web/.env.example web/.env.local
```

Fill in the real Supabase URL and keys. Never put `SUPABASE_SERVICE_ROLE_KEY` into the web app or commit either `.env` file.

### 5. Create the first company

Open the deployed `/login` page. The one-time initial-admin form creates the first platform administrator and company. After that, the administrator creates and opens additional company workspaces under **Administration → Companies**. No mailbox or magic link is required.

## Run locally

### Web

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:3000`.

### API

Python 3.12 is required by the API package:

```bash
cd radar-api
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e .
radar-api
```

The health check is:

```bash
curl http://localhost:8000/health
```

### CLI scan contract

```bash
python scripts/run_scan.py \
  --city Vancouver \
  --country CA \
  --category florist \
  --category "flower shop"
```

## Environment variables

| Variable | App | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | web | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web | Browser-safe Supabase key |
| `RADAR_API_URL` | web | FastAPI base URL |
| `SUPABASE_URL` | API | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | API only | Server-side repository access; never expose to browser |
| `ANTHROPIC_API_KEY` | API | ICP, extraction, scoring, drafting |
| `GOOGLE_PLACES_API_KEY` | API | Google Places API (New) |
| `EXA_API_KEY` | API | Non-map discovery |
| `TWOGIS_API_KEY` | API | Russia/Kazakhstan discovery |
| `JINA_API_KEY` | API | Optional Reader quota |
| `RADAR_ENV` | API | `development` or `production` |
| `RADAR_ALLOWED_ORIGINS` | API | CORS allow-list |

## Architecture

```text
Next.js web
  ├─ Supabase SSR session cookies
  ├─ /api/* server proxy
  └─ human review + manual send UI

FastAPI radar-api
  ├─ verify Supabase JWT
  ├─ resolve auth user → tenant_id
  ├─ enqueue work in public.jobs
  ├─ Google Places / Exa / 2GIS discovery
  ├─ Jina website enrichment
  ├─ Anthropic structured outputs
  └─ Supabase REST repository

Supabase
  ├─ Auth / internal login IDs and passwords
  ├─ Postgres / RLS per tenant
  └─ jobs table as v1 queue
```

## Queue lifecycle

```text
queued → running → done
              └──→ failed
```

Jobs are typed as `discover`, `enrich`, `score`, `draft`, or `learn`. Every stage is intended to be idempotent. The worker claims jobs from Supabase rather than keeping business state in process memory.

## Product model: offer → campaign → evidence → business result

The product is intentionally not limited to flowers. Each tenant can define an approved `offer` with its real problem, deliverables, proof, allowed claims, excluded claims, and next step. A `campaign` then selects an offer, market, audience, sender, and test hypothesis.

Every prospect can carry four visible research states:

- **Evidence** — a sourced observation with URL, quote, type, and date.
- **Hypothesis** — a useful but unconfirmed interpretation.
- **Unknown** — a question that should not be silently invented.
- **Next step** — the human question or action that resolves uncertainty.

Business performance is tracked separately from reply volume: `sent → reply → qualified_interest → meeting → proposal → paid_order → repeat_order`. This keeps the product focused on actual commercial outcomes rather than vanity metrics.

## Channel policy

| Market | Allowed | Guardrail |
|---|---|---|
| Canada | Published business contact, manual Instagram DM | No bulk email or automated WhatsApp to unpublished numbers; real sender and opt-out line |
| RU / KZ / BY | Manual WhatsApp, Telegram, email | Show max 30 first contacts per day per sender number |
| Default | Manual WhatsApp, email | Human approval required |

Automated sending is explicitly out of scope for v1.

## Verification commands

```bash
cd web
npm run typecheck
npm run lint
npm run build

cd ../radar-api
python3.12 -m compileall app tests scripts
```

The acceptance scenarios in the product spec require a real Supabase project and the provider keys. Until those are configured, the UI and local development contracts can be verified, but live counts and real prospect quality cannot honestly be reported.

## Dependencies

### Web

Next.js, React, TypeScript, Tailwind CSS, `@supabase/ssr`, and `@supabase/supabase-js`.

### API

FastAPI, Uvicorn, Pydantic, pydantic-settings, HTTPX, `supabase`, and the Anthropic Python SDK.

## Repository map

```text
anima-radar/
├── web/                         # Next.js frontend
├── radar-api/                   # FastAPI backend
│   ├── app/                     # API, models, providers, LLM, repository, worker
│   └── tests/                   # deterministic pipeline tests
├── supabase/
│   ├── config.toml              # local Supabase configuration
│   ├── migrations/              # production schema + RLS
│   └── seed.sql                 # local demo tenants
├── prompts/                     # versioned LLM prompt contracts
├── scripts/                     # CLI helpers
├── .env.example                 # connection template
└── README.md                    # this runbook
```

## License / product status

Private Anima family product. v1 is a human-approved outreach workflow. Instagram enrichment, automated WhatsApp sending, CRM integrations, and model training are intentionally deferred.
