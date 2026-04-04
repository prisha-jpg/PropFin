# PostgreSQL Deployment Guide (Sales Finance)

## 1. Start PostgreSQL 15 locally

```bash
docker run --name sales-finance-db \
  -e POSTGRES_PASSWORD=yourpassword \
  -e POSTGRES_DB=salesfinance \
  -p 5432:5432 -d postgres:15
```

If `5432` is already in use, map to another host port (example `55432`):

```bash
docker run --name sales-finance-db \
  -e POSTGRES_PASSWORD=yourpassword \
  -e POSTGRES_DB=salesfinance \
  -p 55432:5432 -d postgres:15
```

## 2. Configure environment

Create a project `.env` file (recommended for Prisma):

```bash
echo 'DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/salesfinance?schema=public"' > .env
```

If using the alternate Docker host port:

```bash
echo 'DATABASE_URL="postgresql://postgres:yourpassword@localhost:55432/salesfinance?schema=public"' > .env
```

## 3. Install Prisma dependencies

```bash
npm install
```

## 4. Apply schema migration

```bash
npm run db:deploy
```

## 5. Generate Prisma client

```bash
npm run db:generate
```

## 6. Optional direct SQL run

If you have local `psql` installed:

```bash
psql "$DATABASE_URL" -f database/postgres/001_init_sales_finance.sql
```

If `psql` is not installed locally, run SQL via the Docker container:

```bash
docker exec -i sales-finance-db psql -U postgres -d salesfinance < database/postgres/001_init_sales_finance.sql
```

Optional: install local `psql` on macOS with Homebrew:

```bash
brew install libpq
echo 'export PATH="/opt/homebrew/opt/libpq/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
psql --version
```

## 7. Production / Supabase

```bash
supabase db push
```

## 8. RLS setup for sensitive tables

```sql
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE interest_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY exec_sees_own_orders ON sales_orders
FOR SELECT USING (sales_executive_id = current_setting('app.user_id')::uuid);
```

## 9. Scheduler examples (pg_cron)

```sql
SELECT cron.schedule('monthly-interest', '0 0 1 * *',
  $$INSERT INTO interest_calculation_runs(
      run_date, period_from, period_to, interest_rate, status, created_by
    )
    VALUES (
      CURRENT_DATE,
      date_trunc('month', CURRENT_DATE - interval '1 day')::date,
      (CURRENT_DATE - interval '1 day')::date,
      0.1800,
      'pending',
      NULL
    )$$
);

SELECT cron.schedule('refresh-ledger', '0 2 * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY crm_ledger'
);
```
