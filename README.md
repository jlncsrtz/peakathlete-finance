# PeakAthlete Finance

PeakAthlete Finance is now configured as a standard **Next.js + Supabase** app for online deployment.

The old Cloudflare D1/R2 database setup has been removed. The app now uses:

- **Supabase PostgreSQL** for expenses, budgets, products, sales, order items, and inventory movements
- **Supabase Storage** for receipt images
- **Next.js API routes** for all server-side database operations
- **Vercel-compatible** `npm run build` / `npm start` scripts

## 1. Create a Supabase project

1. Go to Supabase and create a new project.
2. Open **SQL Editor**.
3. Open `supabase/schema.sql` from this project.
4. Copy the whole SQL file into the SQL Editor and run it once.

That script creates:

- `expenses`
- `monthly_budgets`
- `products`
- `sales_orders`
- `sales_items`
- `inventory_movements`
- private `receipts` Storage bucket (4 MB image limit, safe for Vercel Function uploads)
- PostgreSQL functions used for atomic stock/order updates

## 2. Add local environment variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Then fill in:

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_YOUR_SECRET_KEY
SUPABASE_RECEIPTS_BUCKET=receipts
```

Find the URL and server key in your Supabase project settings.

**Important:** `SUPABASE_SECRET_KEY` is a server secret. Never put it in a variable starting with `NEXT_PUBLIC_`, never expose it in browser code, and never commit `.env.local`.

## 3. Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Next.js.

## 4. Deploy to Vercel

1. Push this project to GitHub.
2. Import the repository into Vercel.
3. In **Vercel -> Project Settings -> Environment Variables**, add:
   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEY`
   - `SUPABASE_RECEIPTS_BUCKET` = `receipts`
4. Redeploy.

No local SQLite/D1 database is required after this conversion. Your records and receipt files will remain in Supabase across deployments.

## Database security

The tables have Row Level Security enabled and do not grant direct access to anonymous/authenticated Supabase clients. The app accesses them only from server-side API routes with the secret key.

Because the current UI does not include a user login screen, anyone who can access a publicly deployed site could still call the app's own API routes. Add authentication/access control before sharing a sensitive finance deployment publicly.

## Main Supabase files

- `supabase/schema.sql` — database tables, indexes, storage bucket, and atomic database functions
- `lib/supabase-admin.ts` — server-only Supabase client
- `.env.example` — environment variable template
- `app/api/expense-data/route.ts` — expense and budget operations
- `app/api/sales-data/route.ts` — products, inventory, and sales operations
- `app/api/sales-import/route.ts` — Enstack CSV import
- `app/api/receipts/*` — Supabase Storage receipt upload/read/delete
