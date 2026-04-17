## PropFin Local PostgreSQL Setup

This project now persists frontend data to a local PostgreSQL database through a local Node API.

### 1) Create database in pgAdmin

1. Open pgAdmin.
2. Create a new database named `propfin_app`.
3. Use any local postgres user with create/read/write access to this database.

### 2) Configure environment

Create a `.env` file in the project root:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/propfin_app
API_PORT=4000
CORS_ORIGIN=http://localhost:5173
```

Update username/password/port as per your local PostgreSQL setup.

### 3) Install dependencies

```bash
npm install
```

Generate Prisma client:

```bash
npm run db:generate
```

### 4) Start backend and frontend

Run these in two terminals:

```bash
npm run server
```

```bash
npm run dev
```

Frontend calls `/api/*`, and Vite proxies those calls to `http://localhost:4000`.
All entity records submitted from the UI are stored in PostgreSQL table `app_entity_records`.

If you want to provision the full domain schema from this repo, run:

```bash
npm run db:deploy
```

### 5) Verify persistence

In pgAdmin Query Tool:

```sql
SELECT entity_name, id, data, created_at
FROM app_entity_records
ORDER BY created_at DESC
LIMIT 50;
```

You should see rows appear after creating/updating data from frontend forms.

## Database Schema (PostgreSQL)

Production-ready PostgreSQL schema and Prisma migration files are available at:

- `database/postgres/001_init_sales_finance.sql`
- `database/postgres/DEPLOYMENT.md`
- `prisma/schema.prisma`
- `prisma/migrations/20260404130000_init_sales_finance/migration.sql`
