# 🏢 PropFin — Real Estate CRM & Financial Compliance Engine

<img src="public/logo.svg" alt="PropFin Logo" width="100" />

**PropFin** is a modern, high-performance Real Estate CRM and Financial Compliance Platform designed to manage customer profiles, master unit pricelists, bookings, sales orders, payment schedules, demand letters, payment receipts, and automated financial compliance (including late-payment interest accruals and FIFO waterfall receipt allocations).

---

## 🌐 Live Production Links

- **Frontend Application (Vercel)**: [https://prop-fin.vercel.app](https://prop-fin.vercel.app)
- **Backend API (Render)**: [https://propfin-backend.onrender.com](https://propfin-backend.onrender.com)
- **Database**: Neon Serverless PostgreSQL 17

---

## 🔑 Demo & Team Login Credentials

You can sign in using either your **Email Address** OR **Employee Code** (`EMP-XXXX`):

| Team Member Name | Designation / Role | Email / Employee Code | Login Password |
| :--- | :--- | :--- | :--- |
| **Rajesh Verma** | Sales Manager | `rajesh.verma@propfin.com` *or* `EMP-1002` | **`PropFin@2026`** |
| **Ananya Deshmukh** | Finance Manager | `ananya.d@propfin.com` *or* `EMP-1003` | **`PropFin@2026`** |
| **Vikram Malhotra** | Sales Executive | `vikram.m@propfin.com` *or* `EMP-1004` | **`PropFin@2026`** |
| **System Administrator** | Administrator | `admin@propfin.local` *or* `EMP-0001` | **`PropFin@2026`** |

---

## ⚡ Key Modules & Platform Features

### 👥 1. Team Members & User Management (RBAC)
- **Role-Based Access Control**:
  - **Administrator & Sales Manager**: Full administrative access, user management, and approval authority across all workflows.
  - **Sales Executive & Finance Manager**: Operational access to post entries, customer bookings, and receipts; restricted from higher-authority approvals.
- **User Profile Management**: Personal profile editor, avatar initials, password reset modal, and active account status toggling.

### 🏗️ 2. Presales Configurator & Master Price List
- **Master Unit Pricing**: Real-time master inventory table spanning multiple towers (Tower Serenity, Tower Horizon, Tower Pinnacle).
- **Unit Configuration**: Super built-up area pricing, caic charges, classification rates, parking fees, GST calculations, and maintenance deposits.

### 📋 3. Sales Orders & Customer Bookings
- **Booking Engine**: Unit reservations, agreement values, payment milestone schedule generation (0% to 100% total value).
- **Customer CRM**: Centralized customer records with primary phone numbers, PAN/Aadhaar compliance, and active/inactive status mapping.

### 💸 4. Payment Journal & Receipts
- **Instrument Tracking**: Cheque clearing logs, RTGS/NEFT payment receipts, cheque bounce penalty entries, and customer balances.

### ⚙️ 5. Overdue Interest & Financial Engines
- **FIFO Waterfall Receipt Allocation**: Customer receipts are allocated to unpaid demands in strict chronological order. Interest is computed only on actual net principal balance remaining.
- **Tax & Accrual Rules**: 18% GST late interest surcharge, 1-day grace period enforcement, and daily pro-rata chunking for mid-month receipts.
- **Just-In-Time (JIT) Self-Healing Sync**: Automatic recalculation and verification of customer ledger entries with transaction row-locking (`SELECT FOR UPDATE`).

### 🔄 6. Workflows & Approvals
- **Unit Cancellations & Refunds**: Cancellation request submissions, recovery fee calculations, net refund/owed computation, and multi-stage approval flows.
- **Unit Handover Process**: Handover requests, document checklist verifications, and management sign-off boards.
- **Shifting & Resale Requests**: Unit transfer logs and co-applicant resale assignments.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, Vite 6, Tailwind CSS, Lucide React, TanStack Query (React Query) |
| **Backend** | Node.js, Express.js, Prisma ORM |
| **Database** | Neon Serverless PostgreSQL 17 |
| **Deployment** | Vercel (Frontend CI/CD), Render (Backend Express Web Service) |

---

## 🚀 Local Development Setup

### 1️⃣ Clone & Configure Environment
Create a `.env` file in the project root:

```env
DATABASE_URL="postgresql://neondb_owner:...@ep-autumn-hall-av9ritvt.c-11.us-east-1.aws.neon.tech/neondb?sslmode=require"
PORT=4000
VITE_API_URL=http://localhost:4000
```

### 2️⃣ Install Dependencies & Push Database Schema
```bash
# Install dependencies
npm install

# Push Prisma Schema to PostgreSQL
npx prisma db push

# Generate Prisma Client
npx prisma generate
```

### 3️⃣ Seed Sample Data
```bash
# Seed realistic units into Presales Hub
node seed_units.js

# Seed team members & credentials
node seed_team.js
```

### 4️⃣ Start Frontend & Backend
In separate terminal windows:

```bash
# Terminal 1: Backend Server (Port 4000)
npm run server
```

```bash
# Terminal 2: Frontend Development Server (Port 5173)
npm run dev
```

---

## 📄 License
PropFin CRM Platform © 2026. All rights reserved.
