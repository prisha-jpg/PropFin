# 🏢 PropFin — Real Estate CRM & Sales Finance Platform

PropFin is a high-performance, modern Real Estate CRM and Sales Finance management system designed to track sales orders, payment schedules, receipts, and automate financial calculations like overdue interest accruals.

It is built with a **React (Vite) + Tailwind CSS** frontend and a **Node.js/Express + Prisma + PostgreSQL** backend.

---

## ⚡ Key Highlights & Core Engines

### 🏦 Sales & CRM Lifecycle
- **Entity Management**: Comprehensive tracking of Projects, Blocks, Units, Customers, Sales Orders, and Co-applicants.
- **Payment Journal & Receipts**: Record payment instruments, track cheque clearing, log cheque bounces, and apply bounce penalties.
- **Documents & Workflows**: Generation and management of demand letters, payment reminder letters, builder NOCs, and refunds.

### 📈 Pricing & Payment Schedule Engines
- **Unit Pricing Engine**: Calculates classification rates, super built-up area pricing, caic charges, maintenance deposits, and GST.
- **Payment Schedule Generator**: Automatically builds milestones based on template percentages, summing to 100% of the sale value.

### ⚙️ Overdue Interest Calculation Engine
- **Automated Calculations**: Calculates late payment interest and balance on a pro-rata daily basis using simple interest.
- **Tax Compliance**: Automatically applies a **18% GST** surcharge on all late payment interest amounts.
- **Automated Scheduler**: Background daily cron job (`node-cron` running at 23:50) that runs automated interest calculations on month-end.

### 🔄 Just-In-Time (JIT) Historical Interest Sync
- **Self-Healing Ledger**: Automatically calculates and writes missing past month-end interest entries when a customer's ledger is retrieved.
- **Completed Months Only**: Safely backfills interest for fully closed calendar months, while ignoring current in-progress months.
- **Concurrency Row-Lock Guard**: Runs JIT synchronization inside an ACID transaction with a database row lock (`SELECT FOR UPDATE`) on the customer record to prevent race conditions during rapid consecutive clicks.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, Vite 6, Tailwind CSS, Lucide React, Framer Motion, TanStack Query (React Query) |
| **Backend** | Node.js, Express, Prisma ORM, PostgreSQL |
| **Utilities** | Date-fns, Node-cron, PG client |

---

## 🚀 Setup & Installation

### 1️⃣ Database Setup
1. Open your local PostgreSQL database (e.g. via pgAdmin or psql).
2. Create a new database named `propfin_app`.

### 2️⃣ Configure Environment Variables
Create a `.env` file in the project root directory:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/propfin_app
API_PORT=4000
CORS_ORIGIN=http://localhost:5173
```
*Note: Update the database connection credentials/port as per your local setup.*

### 3️⃣ Install Dependencies & Generate Client
```bash
# Install NPM packages
npm install

# Generate Prisma Client
npm run db:generate

# Deploy Schema Migrations
npm run db:deploy
```

### 4️⃣ Start Frontend & Backend Services
Run the following commands in separate terminals:

```bash
# Start backend server on port 4000
npm run server
```

```bash
# Start Vite development server on port 5173
npm run dev
```

Vite proxies `/api/*` requests directly to `http://localhost:4000`.

---

## 🧪 Testing & Verification

PropFin features a comprehensive suite of unit and integration tests.

### Run Core Calculator Tests
Validates standard late interest accruals, grace period rules, GST calculations, and idempotency:
```bash
node server/tests/interestCalculator.test.js
```

### Run JIT Sync Route Integration Tests
Verifies JIT self-healing sync route, completed months filter, concurrency row-locking, and idempotency:
```bash
node server/tests/ledgerJitSync.test.js
```

---

## 📁 Project Structure

```
├── prisma/                    # Prisma Database Schema and Migrations
├── server/
│   ├── index.js               # Main Express Server
│   ├── routes/                # Express Route Handlers (Pricing, Documents, etc.)
│   ├── jobs/                  # Automated Background Cron Jobs
│   ├── utils/                 # Calculation Engines & JIT Sync Helpers
│   └── tests/                 # Unit & Integration Test Suites
├── src/                       # Frontend React Source Files
│   ├── api/                   # API Client (using apiClient)
│   ├── components/            # Shared UI Components
│   └── pages/                 # CRM Dashboard and Reports Pages
```
