# Aklan Referral Monitoring Dashboard

PHeRef Connectathon dashboard. A Next.js (App Router) app that renders the
referral‑monitoring indicators defined in
`Aklan_Referral_Dashboard_Documentation.tex`, sourced **live** from a FHIR R4
server. Built to deploy on Vercel.

## What it shows

Every panel maps directly to an equation in the `.tex` spec:

| Panel | Spec equation |
| --- | --- |
| Coordinated Referrals (KPI) | `Coord` — eq. coord |
| Successful referral rate (KPI) | eq. succ |
| Declined referral rate (KPI) | eq. decl |
| Report Submission Rate (KPI) | eq. sub (proxy) |
| Coordinated referrals by quarter | eq. quarter |
| Leading causes of referral (top 5) | eq. cases |
| Referral directionality (a → b) | eq. edge |
| Outgoing referrals (by sender) | eq. out |
| Incoming referrals (by receiver) | eq. in |
| Top referring facilities | eq. topref |
| Top reasons for declined / unsuccessful | eq. count |
| Report submission status matrix | eq. cell (proxy) |

## How the FHIR data is read

Fetched **directly from the browser** (client-side), with pagination over Bundle
`next` links. The FHIR server must allow cross-origin (CORS) requests from the
site's domain — `cdr.pheref.fhirlab.net` does. Nothing is proxied through the
Next.js/Vercel server.

- A **referral** is a `ServiceRequest`; its **outcome** is on the linked `Task`
  (via `Task.focus`); the **month** comes from `ServiceRequest.authoredOn`.
- **Sender (a)** = `ServiceRequest.requester`, **receiver (b)** =
  `ServiceRequest.performer` (falling back to `Task.owner`). Connectathon data
  mixes reference types, so each reference is resolved to an `Organization`
  whether it points to an `Organization`, a `PractitionerRole`
  (→ `.organization`), or a `Practitioner` (→ via `PractitionerRole`).
- **Institution key** = `Organization.identifier` whose system matches the NHFR /
  health-facility-code registry; **display** = `Organization.name`.
- **Outcome mapping** (`lib/metrics.ts`, configurable): success =
  `received | accepted | in-progress | completed`; declined =
  `rejected | referred | forwarded | cancelled | failed`; everything else =
  pending.
- **Leading cause** = `ServiceRequest.reasonCode`, falling back to `.category`
  then `.code`.

### Two indicators have no clinical FHIR element

Per the spec, **Encoded / report-submission status** is reporting metadata with
no FHIR element. The matrix and submission-rate KPI are therefore an
**operational proxy**: a facility is counted as having reported for a month if it
originated referral activity (`ServiceRequest.requester`) or signed a
`Provenance` recorded that month. Declined-reason breakdown needs
`Task.statusReason` (outside mapping v0.1); until present, a single
"Declined (total)" bar is shown.

## Configuration

Set in `.env.local` (local) or Vercel project settings:

Because data is fetched in the browser, both variables must use the
`NEXT_PUBLIC_` prefix (Next.js only exposes those to the client). They are
inlined at build time, so a change requires a rebuild/redeploy.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_FHIR_BASE_URL` | FHIR R4 base URL. Default: `https://cdr.pheref.fhirlab.net/fhir` |
| `NEXT_PUBLIC_REPORTING_YEAR` | Calendar year for the submission matrix. Blank = auto-detect busiest year from the data. |

## Run locally

```bash
npm install
cp .env.example .env.local   # edit NEXT_PUBLIC_FHIR_BASE_URL if needed
npm run dev                  # http://localhost:3000
```

> Note: your **browser** must be able to reach the FHIR server, and that server
> must allow CORS. If a request fails, the page shows a "Could not load data"
> banner (with a CORS hint) instead of crashing.

## Deploy to Vercel

1. Push this folder to a Git repo (GitHub/GitLab/Bitbucket).
2. In Vercel: **New Project → Import** the repo. Framework auto-detects as
   Next.js — no build settings needed.
3. Add the environment variable `NEXT_PUBLIC_FHIR_BASE_URL` (and optionally
   `NEXT_PUBLIC_REPORTING_YEAR`) under **Settings → Environment Variables**.
4. **Deploy.**

Or from the CLI:

```bash
npm i -g vercel
vercel env add NEXT_PUBLIC_FHIR_BASE_URL   # paste the URL when prompted
vercel --prod
```

The page renders in the browser and fetches FHIR data client-side, so each visit
(and the header **Refresh** button) reflects the current state of the FHIR
server. Because `NEXT_PUBLIC_` values are baked in at build time, changing the
URL means redeploying.

## Project structure

```
app/
  layout.tsx        root layout + metadata
  page.tsx          client component: browser fetch → compute → render panels
  globals.css       mock-up styling (navy cards, traffic-light matrix)
lib/
  fhir.ts           typed FHIR client + paginated fetchAll() (runs in browser)
  metrics.ts        reference resolution + all panel aggregations (the equations)
components/
  Charts.tsx        Recharts chart components (bars)
  RefreshButton.tsx header refresh control
```

## Adapting to another Connectathon server

The adapter is defensive about heterogeneous data, but if a server uses
different conventions, the two places to adjust are: the outcome status sets and
the NHFR identifier regex, both at the top of `lib/metrics.ts`.
