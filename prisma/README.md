# Prisma Database Migrations

This folder contains a SQL-first Prisma migration for the Sales Finance Management schema.

## Commands

- Apply migrations: `npx prisma migrate deploy`
- Generate Prisma client: `npx prisma generate`

## Required environment variable

- `DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME?schema=public`

## Notes

- Migration SQL is in `prisma/migrations/20260404130000_init_sales_finance/migration.sql`.
- Canonical SQL copy is also kept in `database/postgres/001_init_sales_finance.sql`.
