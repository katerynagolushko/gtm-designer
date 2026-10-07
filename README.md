# GTM Sprint Designer

Momentum Mill's experiment designer. A founder enters what they sell, who they think buys it,
stage, ACV band, preferred channel, and hours per week — and gets back **one 4-week outbound
experiment** with a narrowed ICP, list source, message angle, weekly plan sized to their hours,
a success metric, and pre-registered numeric kill criteria (the verdict slip), plus evidence
cards citing real documented founder GTM experiments, each linking to its source.

## Stack

- Next.js (App Router) + TypeScript
- SQLite via Prisma (Postgres-ready — see below)
- Anthropic API, called server-side only
- Magic-link email auth (no passwords) — Resend in production, console link in dev

## Quick start

```bash
cd gtm-designer
npm install
cp .env.example .env      # fill in ANTHROPIC_API_KEY at minimum
npm run setup             # creates the SQLite DB and seeds the corpus from data/cases_v2.csv
npm run dev
```

Open http://localhost:3001. Sign in with any email — without `RESEND_API_KEY` set, the magic
link is printed to the terminal running the dev server. Sign in with `ADMIN_EMAIL` to see
`/admin`.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes locally | `file:./dev.db` locally. In production, a `postgres://` URL, **or** the Supabase integration's `POSTGRES_PRISMA_URL` / `POSTGRES_URL` / `POSTGRES_URL_NON_POOLING` (those are read automatically). Do not set `file:./dev.db` on Vercel. |
| `ANTHROPIC_API_KEY` | yes | Server-side only; never `NEXT_PUBLIC_`, never shipped to the client |
| `ANTHROPIC_MODEL` | no | Model override; defaults to `claude-opus-5` (an active Claude API id) |
| `APP_URL` | yes locally | Absolute base URL used in magic-link emails. On Vercel, set the public `https://` origin. A `localhost` value is ignored so links are not sent to a laptop. |
| `ADMIN_EMAIL` | yes | The single admin account (`/admin` only — not a sign-in allowlist) |
| `RESEND_API_KEY` | yes in production | Magic links are emailed via Resend. If unset locally, the link is printed to the server console. Production returns an error instead of pretending the email was sent. |
| `EMAIL_FROM` | no | From address for magic-link emails. Must be `onboarding@resend.dev` or an address on a domain verified in Resend. |

## Seed command

```bash
npm run setup        # prisma db push + prisma db seed
# or separately:
npm run db:push
npm run db:seed
```

The seed ingests `data/cases_v2.csv` into the `Case` table, preserving every field verbatim —
including blanks (blank means the source didn't state it; nothing is ever imputed). Re-running
the seed is idempotent (upserts by `case_id`).

## Corpus data rules (enforced in code)

1. **conf A/B** rows are citable in experiment designs. **conf C** rows are quarantine:
   retrievable as background pattern context in the prompt, never cited, never rendered as
   evidence cards, never counted in public copy. The "built on N documented experiments" count
   is the live A+B count from the table.
2. Every designed experiment includes at least one `no`/`mixed` (failure) case; failure cards
   render with a red border and a FAILURE tag. This is enforced server-side after the model
   responds, not just requested in the prompt.
3. Evidence cards link to the case's source URL; a case with no URL cannot be cited.
4. Cited case IDs are validated server-side against the citable set; the model's output is
   schema-validated with zod and retried once on failure.

## Founder workspace

Every run is saved (inputs + full output + timestamp). At day 28 the founder records a verdict
— scale / iterate / kill — with actual numbers. That verdict becomes an **unverified case
draft** in the admin review queue; approving it adds it to the corpus (default tier C —
quarantine — until independently verified; it needs a source URL and an A/B tier to ever be
citable).

## Admin (`/admin`, `ADMIN_EMAIL` only)

- Review queue for founder-submitted verdicts (approve with a conf tier / reject)
- Corpus table with edit and add
- Export the corpus as CSV (same column layout as `cases_v2.csv`)

## Deploying to Vercel

SQLite doesn't persist on serverless — use Postgres in production. This app does **not** use
Supabase Auth (no redirect URLs, no RLS). Supabase is only a Postgres database, via the
Vercel integration's `POSTGRES_*` variables.

1. Attach a database: Vercel → Storage → Neon (sets `DATABASE_URL`), **or** the Supabase
   integration (sets `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`).
   Delete `DATABASE_URL` if it was copied from `.env` as `file:./dev.db` — that value
   points at a laptop file and hides the Supabase connection.
2. Project Settings → Build & Deployment: **Framework = Next.js**; leave Root Directory and
   Output Directory at their defaults (the app lives at the repo root).
3. Add `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `ADMIN_EMAIL`, and `APP_URL` (the public
   `https://` origin, not `http://localhost:3001`). Set `EMAIL_FROM` to a sender on a
   domain verified in Resend. Redeploy after saving env vars — a running deployment does
   not pick them up.

The build script detects a Postgres URL (including Supabase's `POSTGRES_URL_NON_POOLING`),
switches the Prisma provider for that build (the committed schema stays sqlite for local
dev), pushes the schema, and seeds the corpus — no manual migration step. On other hosts,
flip the provider in `prisma/schema.prisma` by hand and run `npm run setup` against your
database.

Note on Resend: `onboarding@resend.dev`, and any unverified domain, only delivers to the
email address that owns the Resend account. Other people can sign in only after the
sending domain is verified. `ADMIN_EMAIL` only unlocks `/admin`; it does not restrict login.

The build command is the default `npm run build` (it runs `prisma generate` first). On Vercel,
the `vercel-build` script also runs `prisma db push` + `prisma db seed` against `DATABASE_URL`
(both are idempotent), so the schema and corpus follow every deploy.

**Preview mode without a database:** if no Postgres URL is set (`DATABASE_URL` or the
Supabase `POSTGRES_*` variables), the build seeds a SQLite file and ships it read-only.
Public pages render the corpus, but sign-in and designing return a clear error until a
Postgres database is attached. The designer also needs `ANTHROPIC_API_KEY`, and sign-in
emails need `RESEND_API_KEY`.
