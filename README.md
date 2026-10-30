# Angels Burger Inventory Management System

A full-stack app for ingredient inventory, menu and recipes, orders and sales, waste, stock history, reports, and email alerts (Brevo).

- **frontend/** React + TypeScript + Vite + Tailwind
- **backend/** Node + Express + TypeScript + Prisma + PostgreSQL

> All sample ingredients, products, prices and recipes are **illustrative only**. Replace them with your real store data in the app.

## 1. What you need installed
1. **Node.js 20 or newer** – https://nodejs.org (choose LTS). Check: `node -v`
2. **PostgreSQL 15 or newer** – https://www.postgresql.org/download/ (remember the password you set for the `postgres` user), or use a free hosted database (Neon / Railway) and skip step 2.

## 2. Create the database (local)
Open **PowerShell** (any folder):
```powershell
psql -U postgres -c "CREATE DATABASE angels_burger;"
```
(If `psql` is not found, open "SQL Shell (psql)" from the Start menu and run `CREATE DATABASE angels_burger;`.)

## 3. Backend setup
Run in PowerShell, inside the `backend` folder:
```powershell
cd backend
npm install
Copy-Item .env.example .env
```
(macOS/Linux: `cp .env.example .env`)

Open `backend/.env` and set at least:
- `DATABASE_URL` → `postgresql://postgres:YOURPASSWORD@localhost:5432/angels_burger`
- `JWT_SECRET` → 32+ random characters. Generate one: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` (10+ chars, with a letter and a number) – your first admin.
- Optional for demo data: `SEED_SAMPLE_DATA="true"` (never in production).

Then:
```powershell
npx prisma migrate dev --name init   # creates the tables
npx prisma migrate dev --create-only --name extra_constraints   # see section 3a
npm run seed                          # creates the first admin (and sample data if enabled)
npm run dev                           # API on http://localhost:4000
```

### 3a. Extra database safety (recommended, do once)
After the `--create-only` command above, open the newly created `backend/prisma/migrations/*_extra_constraints/migration.sql`, paste this, save, then run `npx prisma migrate dev`:
```sql
ALTER TABLE "Ingredient" ADD CONSTRAINT ingredient_qty_nonneg CHECK ("quantity" >= 0);
CREATE UNIQUE INDEX one_active_alert_per_ingredient ON "StockAlert" ("ingredientId") WHERE "active";
```
The first line makes negative stock impossible even if code is wrong. The second prevents duplicate active alerts.

## 4. Frontend setup
New PowerShell window, inside `frontend`:
```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev                           # http://localhost:5173
```
Sign in with the admin email/password from step 3.

## 5. First-admin procedure
There is no public sign-up. The only way to get the first admin is `npm run seed` with `ADMIN_EMAIL` / `ADMIN_PASSWORD` set. Running it again never overwrites an existing account. More staff are added by an admin on the **Staff** page. Email verification is not enabled, so the first admin can never be locked out by email problems.

## 6. Tests
```powershell
cd backend
npm test
```
These cover pricing and recipe maths, stock-status rules, CSV formula-injection protection, reset-token hashing, and the Brevo email service using a **mocked** provider (no real email is sent). Database-level behaviour (row locking, concurrency, idempotency, reversals) needs a real PostgreSQL and is **not yet covered by automated tests** – see "Known limits".

## 7. Brevo email setup
1. Create/sign in at https://www.brevo.com.
2. Go to **SMTP & API → API Keys** and generate a key.
3. Verify a sender: **Senders, Domains & Dedicated IPs → Senders**; add and confirm your sender email (or authenticate your domain). Brevo rejects unverified senders.
4. In `backend/.env` set `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` (the verified one), `BREVO_SENDER_NAME`, optionally `BREVO_REPLY_TO_EMAIL`.
5. Restart the backend.
6. In the app: **Email → Send test email**. "Accepted" means Brevo took it; confirm it arrived in the inbox (check spam).
7. If it fails: read the status and note on the Email page, the backend logs, and **Brevo → Transactional → Logs**.

Without Brevo credentials everything else works; email actions report "Email is not configured" and never claim success. **Password reset needs email**, so before Brevo is set up an admin can only reset a password by running the seed with a new account.

Low-stock/out-of-stock emails go to active accounts ticked on the **Staff** page, once per state change (low → out → restocked → low again sends again). Emails are queued in an outbox table and retried up to 3 times.

## 8. Daily summary email
The app has no in-memory timer (it would stop when the server sleeps). Instead call this once a day (e.g. 9:00 PM Manila) from a scheduler:
```
POST https://YOUR-BACKEND/api/v1/jobs/daily-summary
Header: x-job-secret: <JOB_SECRET from your backend env>
```
Options: a Railway Cron service running `curl -X POST -H "x-job-secret: $JOB_SECRET" https://YOUR-BACKEND/api/v1/jobs/daily-summary`, a GitHub Actions `schedule`, or cron-job.org. Running it twice sends no duplicates (one per recipient per day). Also available: `POST /api/v1/jobs/process-outbox` to retry queued emails. Set `JOB_SECRET` (16+ chars) first.

## 9. Deploying
**Database:** create a PostgreSQL on Railway or Neon; copy its connection string to `DATABASE_URL`.

**Backend (Railway):** new project from your GitHub repo, root directory `backend`.
- Build: `npm install && npm run build` · Start: `npx prisma migrate deploy && npm start`
- Variables: everything in `.env.example`, with `NODE_ENV=production`, `FRONTEND_URL` = your Vercel URL, `BACKEND_URL` = your Railway URL. Do **not** set `ADMIN_*` after the first run.
- Run `npm run seed` once (Railway shell) with `ADMIN_EMAIL`/`ADMIN_PASSWORD` set, then remove them.

**Frontend (Vercel):** root directory `frontend`, framework Vite, variable `VITE_API_BASE_URL=https://YOUR-BACKEND/api/v1`.

In production the session cookie is `Secure; SameSite=None` so the Vercel site can talk to the Railway API. Use HTTPS on both.

## 10. Backup and restore
```powershell
pg_dump -U postgres -Fc angels_burger > backup.dump
pg_restore -U postgres -d angels_burger_restored backup.dump   # into an empty database
```
Hosted databases (Railway/Neon) also offer snapshots/point-in-time restore – turn them on.

## 11. Replacing sample data with real data
1. Settings → set your units.
2. Inventory → add real ingredients, minimum levels and costs; deactivate sample ones (history is kept).
3. Menu → add real products and prices; set each **Recipe**.
4. Inventory → **Receive** your real opening stock.
5. Staff → add accounts and tick who gets alerts.

## 12. Troubleshooting
| Problem | Fix |
|---|---|
| "Invalid environment configuration" on start | A required `.env` value is missing/short; the message names it. |
| Prisma `P1001` can't reach database | Check `DATABASE_URL`, that PostgreSQL is running, and the password. |
| Login works locally but not in production | `FRONTEND_URL` must exactly match the site's origin (no trailing slash); both sites must be HTTPS. |
| "Request rejected" (CSRF) | Frontend must send header `X-Requested-With`; use the provided client. |
| Order says RECIPE_MISSING | Open Menu → Recipe on that product. |
| Test email says not configured / rejected | See section 7. |
| Product images vanish after redeploy | Images are stored on local disk (see limits). Use a Railway volume mounted at `UPLOAD_DIR`, or add object storage. |

## How the main rules work
- **Stock changes only in `backend/src/services/inventory.service.ts`**: row lock → check not negative → update → immutable transaction row (before/after) → refresh alerts, all in one DB transaction.
- **Orders**: validated, priced in integer centavos, recipe + add-ons aggregated per ingredient and deducted once, with a snapshot of prices/options/recipe saved on the order. `idempotencyKey` stops double submissions. Ingredients are locked in a fixed order so concurrent orders cannot deadlock or oversell.
- **Order lifecycle**: `CONFIRMED` (stock deducted) → `COMPLETED` (paid; counts as a sale) or `CANCELLED` (admin only; stock is restored only if the admin chooses, via linked REVERSAL rows). Pending/cancelled orders are never counted as sales.
- **Quantity convention**: stock-in `+`, stock-out `-`, waste `-`, order deduction `-`, reversal `+`, adjustment `±`.
- Stock-out has no "order" field on purpose: orders already deduct their recipe, so a manual deduction could double-count.
- Out of stock = quantity ≤ 0. Low = above 0 and ≤ minimum.
- The app records sales and payment status; it does not charge cards.

## Known limits (honest list)
- **Not verified end-to-end:** this package was assembled in an environment without PostgreSQL or Prisma's engine download, so migrations, the database queries and the running API have **not been executed**. Frontend type-check and build pass; 14 backend unit tests pass. Expect to fix small issues on first run, and treat it as not production-ready until you run the checklist below.
- No migration SQL is bundled; create it with `prisma migrate dev` (step 3).
- Combo products are modelled as ordinary products with add-ons, not as bundles of other products.
- Email verification is not implemented (reset only). Delivery webhooks are not implemented, so "accepted" is the strongest status.
- Product images use local disk; no S3/object storage yet.
- Batch/expiry is a single note per ingredient, not per-batch stock.
- Estimated profit and waste cost use *current* unit costs.
- No automated database/concurrency tests yet.

## Pre-launch checklist
- [ ] `npx prisma migrate dev` works on an empty database; constraints in 3a applied
- [ ] Sign in; staff cannot open Reports/Staff/Audit (backend returns 403)
- [ ] Receive/Use/Waste each change quantity and appear in Stock history
- [ ] Order deducts recipe once; repeating the request with the same key does not
- [ ] Order with too little stock is refused and nothing changes
- [ ] Two simultaneous orders for the last item: only one succeeds
- [ ] Cancel with and without stock restore behaves as described
- [ ] Brevo test email arrives; password reset link works once and expires
- [ ] Low-stock email sent once, not on every refresh
- [ ] Daily summary job returns 200 with the secret and 401 without
