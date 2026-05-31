Normalize categories helper

This folder contains tools to normalize product categories to canonical values (`roti` and `kopi`).

Option A — Quick (local only):
- Run the console snippet (in browser DevTools) that normalizes `localStorage.adminProducts`.

Option B — Persistent (Supabase):
- Use `sql/normalize_categories.sql` in the repo: run it in Supabase SQL Editor as role `postgres`.

Option C — Run Node script (recommended if you prefer CLI):
1. Install Node.js (v18+ recommended).
2. Set environment variables:
   - `SUPABASE_URL` (example: https://xyz.supabase.co)
   - `SUPABASE_SERVICE_ROLE` (service_role key from Supabase project settings — keep secret)
3. From repo root run:
   - `node scripts/normalize_categories.js`

The script will fetch all products and update categories that match common variations (minuman, coffee, cafe -> kopi; makanan, bread -> roti).

Security: Do NOT commit or share your `SERVICE_ROLE` key. Use Option A for a quick local fix, or Option B for a direct DB change via Supabase SQL Editor (requires `postgres` role).