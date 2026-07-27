import "dotenv/config";
import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import fsSync from "node:fs";
import pricingRoutes from "./routes/pricing.js";
import documentsRoutes from "./routes/documents.js";
import { startInterestJob } from "./jobs/interestJob.js";
import { syncHistoricalInterest } from "./utils/interestCalculator.js";
import { calculateCustomerLedgerBalance } from "./utils/ledgerBalance.js";
import { getLedgerSummarySync, getLedgerSummary, FinancialCalculationService, postLedgerEntry } from "./utils/ledgerFinancialService.js";
import { calculateFinancialReconciliation } from "./utils/fpvCalculator.js";

const PORT = Number(process.env.API_PORT || 4000);
const DATABASE_URL = process.env.DATABASE_URL;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL. Add it to your .env file.");
  process.exit(1);
}

const prisma = new PrismaClient();

// Auth Token & Password Cryptography Utilities
const JWT_SECRET = process.env.JWT_SECRET || "propfin-default-jwt-secret-key-32-chars-long";

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
};

const verifyPassword = (password, storedHash) => {
  if (!storedHash) return false;
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [salt, originalHash] = parts;
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return hash === originalHash;
};

const generateToken = (payload) => {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 24 * 60 * 60 * 1000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
};

const verifyToken = (token) => {
  try {
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const computedSignature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
    if (signature !== computedSignature) return null;
    
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.exp < Date.now()) return null; // Expired
    return payload;
  } catch (err) {
    return null;
  }
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  
  if (!token) {
    return res.status(401).json({ message: "Access token is required" });
  }

  const user = verifyToken(token);
  if (!user) {
    return res.status(403).json({ message: "Invalid or expired token" });
  }

  req.user = user;
  next();
};

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: "2mb" }));
app.use("/api/pricing", pricingRoutes);
app.use("/api/documents", documentsRoutes);

// FPV reconciliation (compute-on-the-fly)
app.post("/api/fpv/reconcile", authenticateToken, (req, res) => {
  try {
    const payload = req.body;
    const result = calculateFinancialReconciliation(payload);
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

const ensureStorage = async () => {
  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS app_entity_records (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_name TEXT NOT NULL,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_app_entity_records_entity_name
    ON app_entity_records (entity_name)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_app_entity_records_created_at
    ON app_entity_records (created_at DESC)
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE unit_pricing
    ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2) DEFAULT 5
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE unit_pricing
    ADD COLUMN IF NOT EXISTS caic_charges NUMERIC(15,2) DEFAULT 0
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS default_caic_charges NUMERIC(15,2) DEFAULT 1500000
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS default_maintenance_deposit NUMERIC(15,2) DEFAULT 300000
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS default_gst_rate NUMERIC(5,2) DEFAULT 5
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE cancellation_requests 
    DROP CONSTRAINT IF EXISTS cancellation_requests_status_check
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE cancellation_requests 
    ADD CONSTRAINT cancellation_requests_status_check 
    CHECK (status IN ('pending','under_review','approved','rejected','completed','cancelled','revoked'))
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE sales_orders 
    DROP CONSTRAINT IF EXISTS sales_orders_status_check
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE sales_orders 
    ADD CONSTRAINT sales_orders_status_check 
    CHECK (status IN ('open_order','cancellation_requested','under_review','approved','cancelled','resale'))
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE units 
    DROP CONSTRAINT IF EXISTS units_status_check
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE units 
    ADD CONSTRAINT units_status_check 
    CHECK (status IN ('available','booked','cancellation_requested','cancelled'))
  `);
};

const sanitizeEntity = (raw) => raw.replace(/[^A-Za-z0-9_]/g, "").slice(0, 80);

const parseSort = (sort) => {
  if (!sort) {
    return { field: "created_date", direction: "desc" };
  }
  const direction = sort.startsWith("-") ? "desc" : "asc";
  const field = sort.replace(/^[-+]/, "").replace(/[^A-Za-z0-9_]/g, "");
  return {
    field: field || "created_date",
    direction,
  };
};

const toNumberOrZero = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const sanitizeInputForPrisma = (modelName, payload) => {
  // If no specific mapping is needed, return payload
  // In reality, Prisma throws on unknown fields. We will explicitly map the entities we know.
  if (modelName === "customers") {
    // Map full_name to first_name/last_name
    let first_name = payload.full_name || payload.first_name || "Unknown";
    let last_name = null;
    
    if (payload.full_name && payload.full_name.includes(' ')) {
      const parts = payload.full_name.trim().split(' ');
      first_name = parts[0];
      last_name = parts.slice(1).join(' ');
    }

    return {
      customer_code: payload.customer_code || `CUST${Date.now()}`,
      first_name: first_name,
      last_name: last_name,
      phone_primary: payload.phone || payload.phone_primary || "",
      phone_secondary: payload.phone_secondary || null,
      email: payload.email || null,
      pan_number: payload.pan_number || null,
      aadhaar_number: payload.aadhaar_number || null,
      address_line1: payload.address || payload.address_line1 || null,
      city: payload.city || null,
      state: payload.state || null,
      pincode: payload.pincode || null,
      date_of_birth: payload.date_of_birth ? new Date(payload.date_of_birth) : null,
      customer_type: payload.customer_type || "individual",
      nationality: payload.nationality || "Indian",
      has_active_loan: payload.has_active_loan === true || payload.has_active_loan === "true",
      loan_account_number: payload.loan_account_number || null,
      is_active: payload.status !== "inactive",
    };
  }

  if (modelName === "sales_orders") {
    const discount = toNumberOrZero(payload.discount);
    const gstAmount = toNumberOrZero(payload.gst_amount);
    // total_value is a DB-generated column — never pass it on insert/update
    return {
      order_number: payload.order_number || `SO${Date.now()}`,
      customer_id: payload.customer_id,
      project_id: payload.project_id,
      unit_id: payload.unit_id,
      booking_date: payload.booking_date ? new Date(payload.booking_date) : new Date(),
      basic_sale_value: toNumberOrZero(
        payload.net_bsv ?? payload.basic_sale_value,
      ),
      additional_value: toNumberOrZero(payload.additional_value),
      sale_area: toNumberOrZero(payload.sba ?? payload.sale_area),
      rate_per_sqft: toNumberOrZero(payload.rate_per_sqft),
      sgst_amount: gstAmount / 2,
      cgst_amount: gstAmount / 2,
      status: payload.status || "open_order",
      notes:
        discount > 0
          ? `Discount: ₹${discount.toLocaleString("en-IN")} (₹${toNumberOrZero(payload.discount_per_sqft)}/sq.ft × ${toNumberOrZero(payload.sba ?? payload.sale_area)} sq.ft)`
          : payload.notes || null,
    };
  }

  if (modelName === "customer_receipts") {
    const paymentModeMap = {
      demand_draft: "dd",
      online: "bank_transfer",
    };
    const paymentMode = paymentModeMap[payload.payment_mode] || payload.payment_mode;
    const refNum = (payload.reference_number || "").trim() || null;
    const isChequeOrDd = ["cheque", "dd", "demand_draft"].includes(payload.payment_mode);

    const narrationParts = [];
    if (payload.towards) {
      narrationParts.push(`Towards: ${String(payload.towards).replace(/_/g, " ")}`);
    }
    if ((payload.remarks || "").trim()) {
      narrationParts.push(payload.remarks.trim());
    }

    return {
      receipt_number: payload.receipt_number || `RCT${Date.now().toString(36).toUpperCase()}`,
      sales_order_id: payload.sales_order_id,
      customer_id: payload.customer_id,
      payment_schedule_id: payload.payment_schedule_id || null,
      receipt_date: payload.receipt_date ? new Date(payload.receipt_date) : new Date(),
      consideration_date: payload.consideration_date ? new Date(payload.consideration_date) : null,
      amount: toNumberOrZero(payload.amount),
      payment_mode: paymentMode || null,
      bank_name: payload.bank_name || null,
      cheque_dd_number: isChequeOrDd ? refNum : null,
      transaction_reference: !isChequeOrDd ? refNum : null,
      instrument_date: payload.instrument_date ? new Date(payload.instrument_date) : null,
      drawee_bank: payload.drawee_bank || null,
      narration: narrationParts.length > 0 ? narrationParts.join(". ") : null,
      receipt_type: payload.receipt_type || "payment",
      status: payload.status || "received",
      cleared_date: payload.cleared_date ? new Date(payload.cleared_date) : null,
      bounce_reason: payload.bounce_reason || null,
      tds_amount: toNumberOrZero(payload.tds_amount),
      tds_account_id: payload.tds_account_id || null,
      created_by: payload.created_by || null,
    };
  }

  if (modelName === "demand_letters") {
    const has = (key) => payload[key] !== undefined;
    const cleaned = {};
    
    if (has("demand_number")) cleaned.demand_number = payload.demand_number;
    if (has("sales_order_id")) cleaned.sales_order_id = payload.sales_order_id;
    if (has("customer_id")) cleaned.customer_id = payload.customer_id;
    if (has("payment_schedule_id")) cleaned.payment_schedule_id = payload.payment_schedule_id || null;
    if (has("demand_type")) {
      cleaned.demand_type = payload.demand_type === "subsequent" ? "subsequent_prl" : payload.demand_type;
    }
    if (has("demand_date")) cleaned.demand_date = new Date(payload.demand_date);
    if (has("due_date")) cleaned.due_date = payload.due_date ? new Date(payload.due_date) : null;
    
    if (has("demand_amount") || has("principal_amount")) {
      cleaned.principal_amount = toNumberOrZero(payload.demand_amount ?? payload.principal_amount);
    }
    if (has("interest_amount")) cleaned.interest_amount = toNumberOrZero(payload.interest_amount);
    if (has("gst_on_interest")) cleaned.gst_on_interest = toNumberOrZero(payload.gst_on_interest);
    if (has("gst_amount") || has("other_charges")) {
      cleaned.other_charges = toNumberOrZero(payload.gst_amount ?? payload.other_charges);
    }
    if (has("status")) cleaned.status = payload.status;
    if (has("sent_via")) cleaned.sent_via = payload.sent_via || null;
    if (has("sent_at")) cleaned.sent_at = payload.sent_at ? new Date(payload.sent_at) : null;
    if (has("generation_sequence")) cleaned.generation_sequence = Number(payload.generation_sequence);
    if (has("created_by")) cleaned.created_by = payload.created_by || null;
    
    const uiFields = ["customer_name", "project_name", "unit_number", "installment_number", "milestone_description", "demand_amount", "gst_amount", "total_demand", "balance", "amount_paid"];
    const hasUIFields = uiFields.some(f => has(f)) || has("letter_content");
    
    if (hasUIFields) {
      const demandAmt = toNumberOrZero(payload.demand_amount ?? payload.principal_amount);
      const gstAmt = toNumberOrZero(payload.gst_amount ?? payload.gst_on_interest);
      cleaned.letter_content = {
        customer_name: payload.customer_name,
        project_name: payload.project_name,
        unit_number: payload.unit_number,
        installment_number: payload.installment_number,
        milestone_description: payload.milestone_description,
        demand_amount: demandAmt,
        gst_amount: gstAmt,
        total_demand: toNumberOrZero(payload.total_demand),
        balance: toNumberOrZero(payload.balance),
        amount_paid: toNumberOrZero(payload.amount_paid),
        ...(payload.letter_content || {})
      };
    }
    
    if (!has("demand_number") && !has("id")) {
      cleaned.demand_number = `DL${Date.now().toString(36).toUpperCase()}`;
    }
    
    return cleaned;
  }

  if (modelName === "cancellation_requests") {
    const charges = toNumberOrZero(payload.admin_charges ?? payload.cancellation_charges);
    const otherCharges = toNumberOrZero(payload.other_recoverable_charges ?? payload.forfeiture_amount);

    const cleaned = {
      request_number: payload.request_number || `CAN${Date.now().toString(36).toUpperCase()}`,
      sales_order_id: payload.sales_order_id,
      customer_id: payload.customer_id,
      request_date: payload.request_date ? new Date(payload.request_date) : new Date(),
      cancellation_reason: payload.reason || payload.cancellation_reason || null,
      reason_description: payload.remarks || payload.reason_description || null,
      total_amount_paid: toNumberOrZero(payload.amount_received ?? payload.total_amount_paid),
      cancellation_charges: charges,
      forfeiture_amount: otherCharges,
      refundable_amount: toNumberOrZero(payload.refund_amount ?? payload.refundable_amount),
      penalty_percentage: toNumberOrZero(payload.penalty_rate ?? payload.penalty_percentage ?? 0.5),
      status: payload.status || "pending",
      approved_by: payload.approved_by || null,
      approval_date: payload.approval_date ? new Date(payload.approval_date) : null,
      effective_date: payload.effective_date ? new Date(payload.effective_date) : null,
      rejection_reason: payload.rejection_reason || null,
    };
    return cleaned;
  }

  if (modelName === "refund_requests") {
    const cleaned = {};
    const allowed = [
      "request_number", "sales_order_id", "customer_id", "request_date",
      "refund_amount", "tds_deduction", "account_holder_name", "account_number",
      "ifsc_code", "payment_mode", "status", "rejection_reason",
      "approved_by", "finance_reviewed_by", "disbursed_by", "disbursement_date",
      "transaction_reference", "journal_voucher_no", "created_by"
    ];
    for (const key of allowed) {
      if (payload[key] !== undefined) {
        if (["request_date", "disbursement_date"].includes(key)) {
          cleaned[key] = payload[key] ? new Date(payload[key]) : null;
        } else if (["refund_amount", "tds_deduction"].includes(key)) {
          cleaned[key] = toNumberOrZero(payload[key]);
        } else {
          cleaned[key] = payload[key];
        }
      }
    }
    if (!cleaned.request_number && !payload.id) {
      cleaned.request_number = `REF${Date.now().toString(36).toUpperCase()}`;
    }
    if (cleaned.request_date === undefined && !payload.id) {
      cleaned.request_date = new Date();
    }
    return cleaned;
  }

  if (modelName === "bank_documents") {
    return {
      document_number: payload.document_number,
      sales_order_id: payload.sales_order_id,
      customer_id: payload.customer_id,
      document_type: payload.document_type || "bank_noc",
      generation_date: payload.generation_date ? new Date(payload.generation_date) : new Date(),
      loan_account_number: payload.loan_account_number || null,
      loan_amount: payload.loan_amount ? Number(payload.loan_amount) : null,
      bank_officer_name: payload.bank_officer_name || null,
      bank_officer_designation: payload.bank_officer_designation || null,
      noc_purpose: payload.noc_purpose || "home_loan",
      document_content: payload.document_content || null,
      file_path: payload.file_path || null,
      status: payload.status || "draft",
      generated_by: payload.generated_by || null,
      created_by: payload.created_by || null
    };
  }


  // Remove generic unsupported fields normally passed by frontend
  if (payload.full_name) delete payload.full_name;
  if (payload.status) delete payload.status;
  if (payload.address) delete payload.address;
  if (payload.phone) delete payload.phone;

  return payload;
};

const entityNormalizers = {
  Customer: (payload, id) => ({
    ...payload,
    id,
    customer_code: payload.customer_code || `CIF${Date.now().toString(36).toUpperCase()}`,
    full_name: (payload.full_name || "").trim(),
    phone: payload.phone || payload.phone_primary || "",
    phone_primary: payload.phone_primary || payload.phone || "",
    status: payload.status || "active",
    has_active_loan: Boolean(payload.has_active_loan),
  }),
  SalesOrder: (payload, id) => ({
    ...payload,
    id,
    order_number: payload.order_number || `SO${Date.now().toString(36).toUpperCase()}`,
    total_value: toNumberOrZero(payload.total_value),
    outstanding_amount:
      payload.outstanding_amount !== undefined
        ? toNumberOrZero(payload.outstanding_amount)
        : toNumberOrZero(payload.total_value),
    amount_received: toNumberOrZero(payload.amount_received),
    status: payload.status || "booked",
  }),
  PaymentReceipt: (payload, id) => ({
    ...payload,
    id,
    receipt_number: payload.receipt_number || `RCT${Date.now().toString(36).toUpperCase()}`,
    amount: toNumberOrZero(payload.amount),
    status: payload.status || "received",
    payment_mode: payload.payment_mode || "cash",
  }),
  DemandLetter: (payload, id) => ({
    ...payload,
    id,
    demand_number: payload.demand_number || `DL${Date.now().toString(36).toUpperCase()}`,
    demand_amount: toNumberOrZero(payload.demand_amount ?? payload.principal_amount),
    principal_amount: toNumberOrZero(payload.principal_amount ?? payload.demand_amount),
    interest_amount: toNumberOrZero(payload.interest_amount),
    status: payload.status || "generated",
  }),
  PaymentReminder: (payload, id) => ({
    ...payload,
    id,
    reminder_number: payload.reminder_number || `REM${Date.now().toString(36).toUpperCase()}`,
    outstanding_amount: toNumberOrZero(payload.outstanding_amount),
    status: payload.status || "generated",
  }),
};

const validatePayload = (entity, payload) => {
  if (entity === "Customer" && !(payload.full_name || "").trim()) {
    throw new Error("Customer full_name is required");
  }
  if (entity === "Customer" && !(payload.phone || payload.phone_primary || "").trim()) {
    throw new Error("Customer phone is required");
  }
  if (entity === "SalesOrder" && !payload.customer_id) {
    throw new Error("SalesOrder customer_id is required");
  }
  if (entity === "PaymentReceipt" && !payload.sales_order_id) {
    throw new Error("PaymentReceipt sales_order_id is required");
  }
};

const normalizeRecord = (recordId, payload) => {
  const now = new Date().toISOString();
  return {
    ...payload,
    id: payload?.id || recordId,
    created_date: payload?.created_date || payload?.created_at || now,
    updated_date: now,
  };
};

const entityMap = {
  Customer: "customers",
  Project: "projects",
  Unit: "units",
  SalesOrder: "sales_orders",
  PaymentReceipt: "customer_receipts",
  DemandLetter: "demand_letters",
  DashboardNote: "dashboard_notes",
  PaymentReminder: "payment_reminder_letters",
  Block: "blocks",
  TDSAccount: "tds_accounts",
  InterestEntry: "interest_entries",
  InterestSettlement: "interest_settlements",
  PaymentReminder: "payment_reminder_letters",
  BankDocument: "bank_documents",
  ResaleRequest: "resale_requests",
  CancellationRequest: "cancellation_requests",
  ShiftingRequest: "shifting_requests",
  RefundRequest: "refund_requests",
  HandoverRequest: "handover_requests",
  Ledger: "ledger",
};

const getInclude = (modelName) => {
  if (modelName === "sales_orders") {
    return {
      customers: true,
      projects: true,
      units: true,
      demand_letters: true,
      customer_receipts: true,
      ledger: true,
      refund_requests: true,
      payment_schedules: {
        orderBy: {
          display_order: "asc"
        }
      }
    };
  }
  if ([
    "customer_receipts",
    "demand_letters",
    "payment_reminder_letters",
    "interest_entries",
    "interest_settlements",
    "bank_documents",
    "cancellation_requests",
    "refund_requests",
    "handover_requests"
  ].includes(modelName)) {
    return {
      customers: true,
      sales_orders: {
        include: {
          projects: true,
          units: true
        }
      }
    };
  }
  if (modelName === "resale_requests") {
    return {
      customers_resale_requests_original_customer_idTocustomers: true,
      customers_resale_requests_new_customer_idTocustomers: true,
      sales_orders: {
        include: {
          projects: true,
          units: true
        }
      }
    };
  }
  if (modelName === "shifting_requests") {
    return {
      customers: true,
      sales_orders: {
        include: {
          projects: true,
          units: true
        }
      },
      projects_shifting_requests_from_project_idToprojects: true,
      projects_shifting_requests_to_project_idToprojects: true,
      units_shifting_requests_from_unit_idTounits: true,
      units_shifting_requests_to_unit_idTounits: true
    };
  }
  return undefined;
};

const calculateRefundFromLedger = async (salesOrderId, prismaClient) => {
  if (!salesOrderId) return 0;
  try {
    return await FinancialCalculationService.calculateRefund(salesOrderId, prismaClient);
  } catch (err) {
    console.error("Error calculating refund from ledger:", err);
    return 0;
  }
};

const mapRelations = (modelName, row) => {
  if (!row) return row;
  const mapped = { ...row };
  
  if (modelName === "sales_orders") {
    if (row.customers) {
      mapped.customer_name = row.customers.full_name || `${row.customers.first_name} ${row.customers.last_name || ""}`.trim();
      mapped.customer_code = row.customers.customer_code;
    }
    if (row.projects) {
      mapped.project_name = row.projects.project_name;
    }
    if (row.units) {
      mapped.unit_number = row.units.unit_number;
    }
    const summary = getLedgerSummarySync(row);
    mapped.outstanding_amount = summary.outstandingBalance;
  } else if ([
    "customer_receipts",
    "demand_letters",
    "payment_reminder_letters",
    "interest_entries",
    "interest_settlements",
    "bank_documents",
    "cancellation_requests",
    "refund_requests",
    "handover_requests"
  ].includes(modelName)) {
    if (row.customers) {
      mapped.customer_name = row.customers.full_name || `${row.customers.first_name} ${row.customers.last_name || ""}`.trim();
      mapped.customer_code = row.customers.customer_code;
    }
    if (row.sales_orders) {
      mapped.order_number = row.sales_orders.order_number;
      if (!mapped.customer_name && row.sales_orders.customers) {
        mapped.customer_name = row.sales_orders.customers.full_name || `${row.sales_orders.customers.first_name} ${row.sales_orders.customers.last_name || ""}`.trim();
        mapped.customer_code = row.sales_orders.customers.customer_code;
      }
      if (row.sales_orders.projects) {
        mapped.project_name = row.sales_orders.projects.project_name;
      }
      if (row.sales_orders.units) {
        mapped.unit_number = row.sales_orders.units.unit_number;
      }
    }
    if (modelName === "customer_receipts") {
      mapped.reference_number = row.cheque_dd_number || row.transaction_reference || "";
      if (row.narration) {
        const towardsMatch = row.narration.match(/^Towards: ([^.]+)(?:\.|$)/);
        if (towardsMatch) {
          mapped.towards = towardsMatch[1].trim().toLowerCase().replace(/\s+/g, "_");
          mapped.remarks = row.narration.replace(/^Towards: [^.]+(?:\.\s*)?/, "").trim();
        } else {
          mapped.remarks = row.narration;
        }
      }
    } else if (modelName === "demand_letters") {
      if (row.letter_content && typeof row.letter_content === "object") {
        Object.assign(mapped, row.letter_content);
      }
      mapped.total_demand = mapped.total_demand ?? Number(row.total_demand_amount || row.principal_amount || 0);
      mapped.balance = mapped.balance ?? Number(row.total_demand_amount || row.principal_amount || 0);
      mapped.installment_number = mapped.installment_number ?? row.generation_sequence;
      mapped.demand_amount = mapped.demand_amount ?? Number(row.principal_amount || 0);
      mapped.gst_amount = mapped.gst_amount ?? Number(row.other_charges || 0);
    } else if (modelName === "interest_entries") {
      mapped.principal_amount = row.overdue_principal ? Number(row.overdue_principal) : 0;
      mapped.days = row.days_overdue;
    }
  } else if (modelName === "resale_requests") {
    const origCust = row.customers_resale_requests_original_customer_idTocustomers;
    if (origCust) {
      mapped.customer_name = origCust.full_name || `${origCust.first_name} ${origCust.last_name || ""}`.trim();
      mapped.customer_code = origCust.customer_code;
      mapped.seller_name = mapped.customer_name;
    }
    const newCust = row.customers_resale_requests_new_customer_idTocustomers;
    if (newCust) {
      mapped.new_buyer_name = newCust.full_name || `${newCust.first_name} ${newCust.last_name || ""}`.trim();
    }
    if (row.sales_orders) {
      mapped.order_number = row.sales_orders.order_number;
      if (row.sales_orders.projects) {
        mapped.project_name = row.sales_orders.projects.project_name;
      }
      if (row.sales_orders.units) {
        mapped.unit_number = row.sales_orders.units.unit_number;
      }
    }
  } else if (modelName === "shifting_requests") {
    if (row.customers) {
      mapped.customer_name = row.customers.full_name || `${row.customers.first_name} ${row.customers.last_name || ""}`.trim();
      mapped.customer_code = row.customers.customer_code;
    }
    if (row.sales_orders) {
      mapped.order_number = row.sales_orders.order_number;
    }
    if (row.projects_shifting_requests_from_project_idToprojects) {
      mapped.from_project_name = row.projects_shifting_requests_from_project_idToprojects.project_name;
    }
    if (row.projects_shifting_requests_to_project_idToprojects) {
      mapped.to_project_name = row.projects_shifting_requests_to_project_idToprojects.project_name;
    }
    if (row.units_shifting_requests_from_unit_idTounits) {
      mapped.from_unit_number = row.units_shifting_requests_from_unit_idTounits.unit_number;
      mapped.unit_number = mapped.from_unit_number;
    }
    if (row.units_shifting_requests_to_unit_idTounits) {
      mapped.to_unit_number = row.units_shifting_requests_to_unit_idTounits.unit_number;
    }
  }
  return mapped;
};

const listRecords = async (entityStr, sort, limit) => {
  const modelName = entityMap[entityStr] || entityStr.toLowerCase();
  
  if (!prisma[modelName]) {
    throw new Error(`Entity ${entityStr} (mapped to ${modelName}) does not exist in the relational schema.`);
  }

  const { field, direction } = parseSort(sort);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 1000));
  
  let orderBy = {};
  if (field === 'created_date' || field === 'created_at') {
      orderBy = { created_at: direction.toLowerCase() };
  } else {
      orderBy = { [field]: direction.toLowerCase() };
  }

  const include = getInclude(modelName);

  try {
    const rows = await prisma[modelName].findMany({
      orderBy,
      take: safeLimit,
      ...(include ? { include } : {})
    });
    return rows.map(r => mapRelations(modelName, r));
  } catch (error) {
    if (error.code === 'P2009' || error.message.includes('Unknown argument')) {
      // Fallback basic order if sort field doesn't exist
      const rows = await prisma[modelName].findMany({
         orderBy: { created_at: 'desc' },
         take: safeLimit,
         ...(include ? { include } : {})
      });
      return rows.map(r => mapRelations(modelName, r));
    }
    throw error;
  }
};

app.get("/api/health", async (_req, res) => {
  try {
    const result = await prisma.$queryRawUnsafe("SELECT NOW() as now");
    res.json({ status: "ok", now: result[0]?.now || null });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

const SETTINGS_FILE = path.join(process.cwd(), "server", "system_settings.json");

app.get("/api/system-settings", async (req, res) => {
  try {
    const data = await fs.readFile(SETTINGS_FILE, "utf-8");
    res.json(JSON.parse(data));
  } catch (error) {
    res.json({
      cancellation_charge_percent: 5,
      cancellation_gst_rate: 18
    });
  }
});

app.post("/api/system-settings", authenticateToken, async (req, res) => {
  try {
    const { cancellation_charge_percent, cancellation_gst_rate } = req.body;
    const settings = {
      cancellation_charge_percent: Number(cancellation_charge_percent !== undefined ? cancellation_charge_percent : 5),
      cancellation_gst_rate: Number(cancellation_gst_rate !== undefined ? cancellation_gst_rate : 18)
    };
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/apps/public/prod/public-settings/by-id/:id", (req, res) => {
  res.json({
    id: req.params.id,
    public_settings: {
      auth_required: false,
      mode: "local_postgres",
    },
  });
});

app.post("/api/auth/signup", async (req, res) => {
  const { full_name, email, password, role, phone } = req.body;

  if (!full_name || !email || !password || !role) {
    return res.status(400).json({ message: "Full name, email, password, and role are required" });
  }

  try {
    const existingUser = await prisma.users.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ message: "Email is already registered" });
    }

    const rand = Math.floor(1000 + Math.random() * 9000);
    const employee_code = `EMP-${rand}`;
    const password_hash = hashPassword(password);

    const newUser = await prisma.users.create({
      data: {
        employee_code,
        full_name,
        email,
        phone: phone || null,
        role,
        password_hash,
        is_active: true,
      },
    });

    const token = generateToken({
      id: newUser.id,
      email: newUser.email,
      role: newUser.role,
    });

    return res.status(201).json({
      token,
      user: {
        id: newUser.id,
        employee_code: newUser.employee_code,
        full_name: newUser.full_name,
        email: newUser.email,
        phone: newUser.phone,
        role: newUser.role,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email/Employee Code and Password are required" });
  }

  try {
    const user = await prisma.users.findFirst({
      where: {
        OR: [
          { email: email },
          { employee_code: email }
        ]
      },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid email/employee code or password" });
    }

    if (!user.is_active) {
      return res.status(403).json({ message: "Your account is deactivated" });
    }

    const isValid = verifyPassword(password, user.password_hash);
    if (!isValid) {
      return res.status(400).json({ message: "Invalid email/employee code or password" });
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    return res.json({
      token,
      user: {
        id: user.id,
        employee_code: user.employee_code,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/auth/google", async (req, res) => {
  const { credential } = req.body;

  if (!credential) {
    return res.status(400).json({ message: "Google credential token is required" });
  }

  try {
    const verificationUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`;
    const response = await fetch(verificationUrl);
    
    if (!response.ok) {
      return res.status(400).json({ message: "Failed to verify Google token" });
    }

    const tokenInfo = await response.json();
    
    const expectedClientId = process.env.GOOGLE_CLIENT_ID;
    if (expectedClientId && tokenInfo.aud !== expectedClientId) {
      return res.status(400).json({ message: "Audience client ID mismatch" });
    }

    const { email, name } = tokenInfo;

    if (!email) {
      return res.status(400).json({ message: "Email not provided by Google account" });
    }

    let user = await prisma.users.findUnique({
      where: { email },
    });

    if (!user) {
      const rand = Math.floor(1000 + Math.random() * 9000);
      const employee_code = `EMP-${rand}`;

      user = await prisma.users.create({
        data: {
          employee_code,
          full_name: name || email.split("@")[0],
          email,
          role: "admin",
          is_active: true,
        },
      });
    }

    if (!user.is_active) {
      return res.status(403).json({ message: "Your account is deactivated" });
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    return res.json({
      token,
      user: {
        id: user.id,
        employee_code: user.employee_code,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Google login error:", error);
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const user = await prisma.users.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.is_active) {
      return res.status(403).json({ message: "Account is inactive" });
    }

    return res.json({
      id: user.id,
      employee_code: user.employee_code,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      role: user.role,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// ==========================================
// UNIT SHIFTING ENDPOINTS
// ==========================================

// 1. GET /api/shift/orders (Get orders available for shifting)
app.get("/api/shift/orders", authenticateToken, async (req, res) => {
  try {
    const activeOrders = await prisma.sales_orders.findMany({
      where: {
        status: { notIn: ["cancelled", "resale"] }
      },
      include: {
        customers: true,
        projects: true,
        units: {
          include: {
            blocks: true,
            unitPricing: true
          }
        },
        demand_letters: true,
        customer_receipts: true,
        ledger: true
      }
    });

    // Filter out already shifted orders (where there is an approved shifting request)
    const approvedShifts = await prisma.shifting_requests.findMany({
      where: { status: "approved" },
      select: { sales_order_id: true }
    });
    const alreadyShiftedIds = new Set(approvedShifts.map(s => s.sales_order_id));

    const eligibleOrders = [];
    for (const order of activeOrders) {
      if (alreadyShiftedIds.has(order.id)) {
        continue;
      }
      const summary = getLedgerSummarySync(order);
      eligibleOrders.push({
        id: order.id,
        order_number: order.order_number,
        customer_id: order.customer_id,
        customer_name: order.customers.full_name || `${order.customers.first_name || ""} ${order.customers.last_name || ""}`.trim() || "Unknown",
        project_id: order.project_id,
        project_name: order.projects.project_name,
        unit_id: order.unit_id,
        unit_number: order.units.unit_number,
        floor: order.units.floor_number || 0,
        area: Number(order.units.carpet_area || 0),
        agreement_value: summary.agreementValue,
        amount_paid: summary.amountPaid,
        outstanding_amount: summary.outstandingBalance,
        booking_date: order.booking_date,
        status: order.status
      });
    }

    return res.json(eligibleOrders);
  } catch (error) {
    console.error("Error fetching shift orders:", error);
    return res.status(500).json({ message: error.message });
  }
});

// 2. GET /api/shift/available-units (Get available units for destination)
app.get("/api/shift/available-units", authenticateToken, async (req, res) => {
  try {
    const availableUnits = await prisma.units.findMany({
      where: {
        status: "available"
      },
      include: {
        projects: true,
        blocks: true,
        unitPricing: true
      }
    });

    const formattedUnits = availableUnits.map(unit => ({
      id: unit.id,
      project_id: unit.project_id,
      project_name: unit.projects.project_name,
      block_id: unit.block_id,
      tower_name: unit.blocks?.block_name || unit.blocks?.block_code || "N/A",
      unit_number: unit.unit_number,
      floor_number: unit.floor_number || 0,
      carpet_area: Number(unit.carpet_area || 0),
      facing: unit.facing || "N/A",
      unit_type: unit.unit_type || "N/A",
      agreement_value: Number(unit.unitPricing?.basic_sale_value || unit.base_price || 0)
    }));

    return res.json(formattedUnits);
  } catch (error) {
    console.error("Error fetching available units for shift:", error);
    return res.status(500).json({ message: error.message });
  }
});

// 3. POST /api/shift/request (Create shifting request)
app.post("/api/shift/request", authenticateToken, async (req, res) => {
  try {
    const { sales_order_id, to_unit_id, reason } = req.body;
    if (!sales_order_id || !to_unit_id) {
      return res.status(400).json({ message: "sales_order_id and to_unit_id are required" });
    }

    // 1. Fetch Sales Order
    const salesOrder = await prisma.sales_orders.findUnique({
      where: { id: sales_order_id },
      include: { units: true }
    });
    if (!salesOrder) {
      return res.status(404).json({ message: "Sales order not found" });
    }
    if (salesOrder.status === "cancelled" || salesOrder.status === "resale") {
      return res.status(400).json({ message: "Cannot shift a cancelled or resold booking" });
    }

    // 2. Check if already shifted
    const approvedShift = await prisma.shifting_requests.findFirst({
      where: { sales_order_id, status: "approved" }
    });
    if (approvedShift) {
      return res.status(400).json({ message: "This sales order has already been shifted" });
    }

    // 3. Fetch Destination Unit
    const toUnit = await prisma.units.findUnique({
      where: { id: to_unit_id },
      include: { unitPricing: true }
    });
    if (!toUnit) {
      return res.status(404).json({ message: "Destination unit not found" });
    }
    if (toUnit.status !== "available") {
      return res.status(400).json({ message: "Destination unit is not available" });
    }
    if (toUnit.id === salesOrder.unit_id) {
      return res.status(400).json({ message: "Destination unit cannot be the same as the current unit" });
    }

    // 4. Check for pending shift requests
    const duplicatePending = await prisma.shifting_requests.findFirst({
      where: { sales_order_id, status: "pending" }
    });
    if (duplicatePending) {
      return res.status(409).json({ message: "A pending shifting request already exists for this sales order" });
    }

    // 5. Perform calculations
    const oldAgreement = Number(salesOrder.agreement_value || salesOrder.basic_sale_value || 0);
    const newAgreement = Number(toUnit.unitPricing?.basic_sale_value || toUnit.base_price || 0);
    const priceDiff = newAgreement - oldAgreement;
    const areaDiff = Number(toUnit.carpet_area || 0) - Number(salesOrder.units?.carpet_area || 0);
    const floorDiff = Number(toUnit.floor_number || 0) - Number(salesOrder.units?.floor_number || 0);

    // 6. Create request
    const request = await prisma.shifting_requests.create({
      data: {
        request_number: "SH" + Date.now().toString(36).toUpperCase(),
        sales_order_id: salesOrder.id,
        customer_id: salesOrder.customer_id,
        from_unit_id: salesOrder.unit_id,
        to_unit_id: toUnit.id,
        from_project_id: salesOrder.project_id,
        to_project_id: toUnit.project_id,
        request_date: new Date(),
        reason: reason || null,
        price_difference: priceDiff,
        area_difference: areaDiff,
        floor_difference: floorDiff,
        old_agreement_value: oldAgreement,
        new_agreement_value: newAgreement,
        additional_amount_payable: priceDiff,
        status: "pending",
        created_by: req.user?.id || null
      }
    });

    return res.status(201).json(request);
  } catch (error) {
    console.error("Error creating shifting request:", error);
    return res.status(500).json({ message: error.message });
  }
});

// 4. GET /api/shift/history (Get shifting request history)
app.get("/api/shift/history", authenticateToken, async (req, res) => {
  try {
    const history = await prisma.shifting_requests.findMany({
      orderBy: { created_at: "desc" },
      include: {
        customers: true,
        sales_orders: true,
        projects_shifting_requests_from_project_idToprojects: true,
        projects_shifting_requests_to_project_idToprojects: true,
        units_shifting_requests_from_unit_idTounits: {
          include: { blocks: true }
        },
        units_shifting_requests_to_unit_idTounits: {
          include: { blocks: true }
        },
        users_shifting_requests_requested_byTousers: true,
        users_shifting_requests_approved_byTousers: true
      }
    });

    const formattedHistory = history.map(req => {
      const customerName = req.customers.full_name || `${req.customers.first_name || ""} ${req.customers.last_name || ""}`.trim() || "Unknown";
      return {
        id: req.id,
        request_number: req.request_number,
        request_date: req.request_date,
        customer_id: req.customer_id,
        customer_name: customerName,
        sales_order_id: req.sales_order_id,
        order_number: req.sales_orders.order_number,
        from_project_id: req.from_project_id,
        from_project_name: req.projects_shifting_requests_from_project_idToprojects?.project_name || "N/A",
        to_project_id: req.to_project_id,
        to_project_name: req.projects_shifting_requests_to_project_idToprojects?.project_name || "N/A",
        from_unit_id: req.from_unit_id,
        from_unit_number: req.units_shifting_requests_from_unit_idTounits.unit_number,
        from_tower: req.units_shifting_requests_from_unit_idTounits.blocks?.block_name || "N/A",
        to_unit_id: req.to_unit_id,
        to_unit_number: req.units_shifting_requests_to_unit_idTounits.unit_number,
        to_tower: req.units_shifting_requests_to_unit_idTounits.blocks?.block_name || "N/A",
        price_difference: Number(req.price_difference || 0),
        area_difference: Number(req.area_difference || 0),
        floor_difference: req.floor_difference || 0,
        old_agreement_value: Number(req.old_agreement_value || 0),
        new_agreement_value: Number(req.new_agreement_value || 0),
        status: req.status,
        reason: req.reason,
        rejection_reason: req.rejection_reason,
        requested_by: req.users_shifting_requests_requested_byTousers?.full_name || "System",
        approved_by: req.users_shifting_requests_approved_byTousers?.full_name || "N/A",
        approval_date: req.approval_date,
        effective_date: req.effective_date
      };
    });

    return res.json(formattedHistory);
  } catch (error) {
    console.error("Error fetching shifting history:", error);
    return res.status(500).json({ message: error.message });
  }
});

// 5. GET /api/shift/:id (Get shifting request detail)
app.get("/api/shift/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const request = await prisma.shifting_requests.findUnique({
      where: { id },
      include: {
        customers: true,
        sales_orders: true,
        projects_shifting_requests_from_project_idToprojects: true,
        projects_shifting_requests_to_project_idToprojects: true,
        units_shifting_requests_from_unit_idTounits: {
          include: { blocks: true }
        },
        units_shifting_requests_to_unit_idTounits: {
          include: { blocks: true }
        },
        users_shifting_requests_requested_byTousers: true,
        users_shifting_requests_approved_byTousers: true
      }
    });
    if (!request) {
      return res.status(404).json({ message: "Shifting request not found" });
    }

    const customerName = request.customers.full_name || `${request.customers.first_name || ""} ${request.customers.last_name || ""}`.trim() || "Unknown";
    const formatted = {
      id: request.id,
      request_number: request.request_number,
      request_date: request.request_date,
      customer_id: request.customer_id,
      customer_name: customerName,
      sales_order_id: request.sales_order_id,
      order_number: request.sales_orders.order_number,
      from_project_id: request.from_project_id,
      from_project_name: request.projects_shifting_requests_from_project_idToprojects?.project_name || "N/A",
      to_project_id: request.to_project_id,
      to_project_name: request.projects_shifting_requests_to_project_idToprojects?.project_name || "N/A",
      from_unit_id: request.from_unit_id,
      from_unit_number: request.units_shifting_requests_from_unit_idTounits.unit_number,
      from_tower: request.units_shifting_requests_from_unit_idTounits.blocks?.block_name || "N/A",
      to_unit_id: request.to_unit_id,
      to_unit_number: request.units_shifting_requests_to_unit_idTounits.unit_number,
      to_tower: request.units_shifting_requests_to_unit_idTounits.blocks?.block_name || "N/A",
      price_difference: Number(request.price_difference || 0),
      area_difference: Number(request.area_difference || 0),
      floor_difference: request.floor_difference || 0,
      old_agreement_value: Number(request.old_agreement_value || 0),
      new_agreement_value: Number(request.new_agreement_value || 0),
      status: request.status,
      reason: request.reason,
      rejection_reason: request.rejection_reason,
      requested_by: request.users_shifting_requests_requested_byTousers?.full_name || "System",
      approved_by: request.users_shifting_requests_approved_byTousers?.full_name || "N/A",
      approval_date: request.approval_date,
      effective_date: request.effective_date
    };

    return res.json(formatted);
  } catch (error) {
    console.error("Error fetching shifting request details:", error);
    return res.status(500).json({ message: error.message });
  }
});

// 6. PUT /api/shift/approve (Approve request and execute shift)
app.put("/api/shift/approve", authenticateToken, async (req, res) => {
  try {
    const { requestId } = req.body;
    if (!requestId) {
      return res.status(400).json({ message: "requestId is required" });
    }

    // 1. Fetch Request details
    const request = await prisma.shifting_requests.findUnique({
      where: { id: requestId },
      include: {
        sales_orders: true,
        units_shifting_requests_from_unit_idTounits: true,
        units_shifting_requests_to_unit_idTounits: {
          include: { unitPricing: true }
        }
      }
    });

    if (!request) {
      return res.status(404).json({ message: "Shifting request not found" });
    }
    if (request.status !== "pending") {
      return res.status(400).json({ message: "Only pending requests can be approved" });
    }

    const toUnit = request.units_shifting_requests_to_unit_idTounits;
    if (toUnit.status !== "available") {
      return res.status(400).json({ message: "Destination unit is no longer available" });
    }

    // 2. Perform transactional updates
    await prisma.$transaction(async (tx) => {
      // A. Update Sales Order unit, block, and value
      const newAgreement = Number(toUnit.unitPricing?.basic_sale_value || toUnit.base_price || 0);
      await tx.sales_orders.update({
        where: { id: request.sales_order_id },
        data: {
          unit_id: request.to_unit_id,
          agreement_value: newAgreement,
          basic_sale_value: newAgreement,
          block_id: toUnit.block_id || null,
          project_id: request.to_project_id
        }
      });

      // B. Release the old unit (set available)
      await tx.units.update({
        where: { id: request.from_unit_id },
        data: { status: "available" }
      });

      // C. Book the new unit (set booked)
      await tx.units.update({
        where: { id: request.to_unit_id },
        data: { status: "booked" }
      });

      // D. Post ledger entry if price difference exists
      const priceDiff = Number(request.price_difference || 0);
      if (priceDiff !== 0) {
        const desc = `Shift Adjustment: ${priceDiff >= 0 ? "Additional Demand" : "Credit Adjustment"} due to shifting from Unit ${request.units_shifting_requests_from_unit_idTounits.unit_number} to Unit ${toUnit.unit_number}`;
        await postLedgerEntry(tx, {
          sales_order_id: request.sales_order_id,
          customer_id: request.customer_id,
          transaction_type: "ADJUSTMENT",
          amount: priceDiff,
          description: desc,
          reference_no: request.request_number,
          ledger_reference_type: "UnitShift",
          ledger_reference_id: request.id,
          created_by: req.user?.id || null
        });
      }

      // E. Update request status to approved
      await tx.shifting_requests.update({
        where: { id: requestId },
        data: {
          status: "approved",
          approval_date: new Date(),
          approved_by: req.user?.id || null,
          effective_date: new Date()
        }
      });
    });

    // 3. Recalculate interest and outstanding balance JIT after commit
    await syncHistoricalInterest(request.customer_id, prisma);

    // 4. Return updated request info
    const updatedRequest = await prisma.shifting_requests.findUnique({
      where: { id: requestId }
    });

    return res.json(updatedRequest);
  } catch (error) {
    console.error("Error approving shifting request:", error);
    return res.status(500).json({ message: error.message });
  }
});

// 7. PUT /api/shift/reject (Reject shifting request)
app.put("/api/shift/reject", authenticateToken, async (req, res) => {
  try {
    const { requestId, rejection_reason } = req.body;
    if (!requestId) {
      return res.status(400).json({ message: "requestId is required" });
    }

    const request = await prisma.shifting_requests.findUnique({
      where: { id: requestId }
    });
    if (!request) {
      return res.status(404).json({ message: "Shifting request not found" });
    }
    if (request.status !== "pending") {
      return res.status(400).json({ message: "Only pending requests can be rejected" });
    }

    const updated = await prisma.shifting_requests.update({
      where: { id: requestId },
      data: {
        status: "rejected",
        rejection_reason: rejection_reason || "Rejected by administrator",
        approval_date: new Date(),
        approved_by: req.user?.id || null
      }
    });

    return res.json(updated);
  } catch (error) {
    console.error("Error rejecting shifting request:", error);
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/entities/:entity", authenticateToken, async (req, res) => {
  try {
    const entity = sanitizeEntity(req.params.entity);
    const data = await listRecords(entity, req.query.sort, req.query.limit);
    
    if (entity === "CancellationRequest" || entity === "cancellation_requests") {
      for (const item of data) {
        if (item.status === "approved" || item.status === "completed") {
          item.refund_amount = await calculateRefundFromLedger(item.sales_order_id, prisma);
          item.refundable_amount = item.refund_amount;
        }
      }
    }
    
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/entities/:entity/:id", authenticateToken, async (req, res) => {
  try {
    const entity = sanitizeEntity(req.params.entity);
    const { id } = req.params;
    
    const modelName = entityMap[entity] || entity.toLowerCase();
    
    if (!prisma[modelName]) {
      return res.status(404).json({ message: "Model not found" });
    }

    const include = getInclude(modelName);
    const record = await prisma[modelName].findUnique({
      where: { id },
      ...(include ? { include } : {})
    });

    if (!record) {
      return res.status(404).json({ message: "Record not found" });
    }
    const mapped = mapRelations(modelName, record);
    if (modelName === "cancellation_requests" && (mapped.status === "approved" || mapped.status === "completed")) {
      mapped.refund_amount = await calculateRefundFromLedger(mapped.sales_order_id, prisma);
      mapped.refundable_amount = mapped.refund_amount;
    }
    return res.json(mapped);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/entities/:entity", authenticateToken, async (req, res) => {
  try {
    const entity = sanitizeEntity(req.params.entity);
    const modelName = entityMap[entity] || entity.toLowerCase();
    
    if (!prisma[modelName]) {
      return res.status(404).json({ message: "Model not found" });
    }

    const payload = req.body || {};

    if (modelName === "interest_entries") {
      let record;
      await prisma.$transaction(async (tx) => {
        const run = await tx.interest_calculation_runs.create({
          data: {
            run_date: new Date(),
            period_from: new Date(payload.period_from || new Date()),
            period_to: new Date(payload.period_to || new Date()),
            interest_rate: Number(payload.interest_rate || 18),
            calculation_method: "simple",
            status: "completed",
            processed_count: 1,
            total_interest_generated: Number(payload.interest_amount || 0),
            remarks: "Generated via frontend single process"
          }
        });

        const entryData = {
          run_id: run.id,
          sales_order_id: payload.sales_order_id,
          customer_id: payload.customer_id,
          period_from: new Date(payload.period_from),
          period_to: new Date(payload.period_to),
          overdue_principal: Number(payload.principal_amount || payload.overdue_principal || 0),
          interest_rate: Number(payload.interest_rate || 0),
          days_overdue: Number(payload.days || payload.days_overdue || 0),
          interest_amount: Number(payload.interest_amount || 0),
          gst_on_interest: Number(payload.gst_on_interest || 0),
          status: "active"
        };

        record = await tx.interest_entries.create({ data: entryData });

        const startStr = new Date(payload.period_from).toLocaleDateString("en-IN");
        const calcStr = new Date(payload.period_to).toLocaleDateString("en-IN");
        const days = Number(payload.days || payload.days_overdue || 0);
        const description = `Delayed payment interest for the period of ${startStr} to ${calcStr} (${days} days)`;

        await postLedgerEntry(tx, {
          sales_order_id: payload.sales_order_id,
          customer_id: payload.customer_id,
          transaction_type: "INTEREST",
          amount: Number(payload.interest_amount || 0),
          reference_date: new Date(payload.period_to),
          description: description,
          reference_no: `INT-${payload.sales_order_id}`
        });

        await tx.customers.update({
          where: { id: payload.customer_id },
          data: {
            total_outstanding_balance: {
              increment: Number(payload.interest_amount || 0)
            }
          }
        });
      });

      return res.status(201).json(mapRelations(modelName, record));
    }

    if (modelName === "shifting_requests") {
      const salesOrder = await prisma.sales_orders.findUnique({
        where: { id: payload.sales_order_id },
        include: { units: true }
      });
      if (!salesOrder) {
        return res.status(400).json({ message: "Sales order not found" });
      }

      // 1. Resolve From Project and Unit
      const fromProjectId = salesOrder.project_id;
      const fromUnitId = salesOrder.unit_id;

      // 2. Resolve To Project
      let toProjectId;
      const targetProjName = (payload.new_project || "Unknown Project").trim();
      const existingProject = await prisma.projects.findFirst({
        where: { project_name: { equals: targetProjName, mode: "insensitive" } }
      });
      if (existingProject) {
        toProjectId = existingProject.id;
      } else {
        const newProj = await prisma.projects.create({
          data: {
            project_code: `PRJ-${Date.now().toString(36).toUpperCase()}`,
            project_name: targetProjName
          }
        });
        toProjectId = newProj.id;
      }

      // 3. Resolve To Unit
      let toUnitId;
      const targetUnitNo = (payload.new_unit || "Unknown Unit").trim();
      const existingUnit = await prisma.units.findFirst({
        where: {
          project_id: toProjectId,
          unit_number: { equals: targetUnitNo, mode: "insensitive" }
        }
      });
      if (existingUnit) {
        toUnitId = existingUnit.id;
      } else {
        const newUnit = await prisma.units.create({
          data: {
            project_id: toProjectId,
            unit_number: targetUnitNo,
            floor_number: Number(payload.new_floor) || null,
            status: "available"
          }
        });
        toUnitId = newUnit.id;
      }

      // 4. Create the shifting request record
      const record = await prisma.shifting_requests.create({
        data: {
          request_number: payload.request_number || `SH${Date.now().toString(36).toUpperCase()}`,
          sales_order_id: payload.sales_order_id,
          customer_id: payload.customer_id,
          from_unit_id: fromUnitId,
          to_unit_id: toUnitId,
          from_project_id: fromProjectId,
          to_project_id: toProjectId,
          request_date: payload.request_date ? new Date(payload.request_date) : new Date(),
          reason: payload.reason || null,
          price_difference: Number(payload.difference_amount) || 0,
          area_difference: Number(payload.new_area || 0) - Number(salesOrder.units.carpet_area || 0),
          floor_difference: (Number(payload.new_floor || 0) - Number(salesOrder.units.floor_number || 0)),
          additional_amount_payable: Number(payload.difference_amount) || 0,
          status: payload.status || "pending"
        },
        include: getInclude(modelName)
      });

      return res.status(201).json(mapRelations(modelName, record));
    }

    if (modelName === "cancellation_requests") {
      const salesOrderId = payload.sales_order_id;
      if (salesOrderId) {
        const order = await prisma.sales_orders.findUnique({
          where: { id: salesOrderId }
        });
        if (!order) {
          return res.status(404).json({ message: "Sales order not found" });
        }
        if (order.status === "cancelled") {
          return res.status(409).json({
            message: "CANCELLATION_ALREADY_EXISTS",
            detail: "CANCELLATION_ALREADY_EXISTS",
            code: "CANCELLATION_ALREADY_EXISTS"
          });
        }

        const existingRequest = await prisma.cancellation_requests.findFirst({
          where: {
            sales_order_id: salesOrderId,
            status: { notIn: ["revoked", "rejected"] }
          }
        });
        if (existingRequest) {
          return res.status(409).json({
            message: "CANCELLATION_ALREADY_EXISTS",
            detail: "CANCELLATION_ALREADY_EXISTS",
            code: "CANCELLATION_ALREADY_EXISTS"
          });
        }

        const cleanedData = sanitizeInputForPrisma(modelName, payload);
        const include = getInclude(modelName);

        const record = await prisma.$transaction(async (tx) => {
          await tx.sales_orders.update({
            where: { id: salesOrderId },
            data: { status: "cancellation_requested" }
          });

          await tx.units.update({
            where: { id: order.unit_id },
            data: { status: "cancellation_requested" }
          });

          return await tx.cancellation_requests.create({
            data: cleanedData,
            ...(include ? { include } : {})
          });
        });

        return res.status(201).json(mapRelations(modelName, record));
      }
    }

    if (modelName === "refund_requests") {
      const salesOrderId = payload.sales_order_id;
      if (!salesOrderId) {
        return res.status(400).json({ message: "sales_order_id is required" });
      }

      const salesOrder = await prisma.sales_orders.findUnique({
        where: { id: salesOrderId },
        include: {
          customers: true,
          projects: true,
          units: true,
          demand_letters: true,
          customer_receipts: true,
          ledger: true,
          refund_requests: true
        }
      });

      if (!salesOrder) {
        return res.status(404).json({ message: "Sales order not found" });
      }

      if (salesOrder.status !== "cancelled") {
        return res.status(400).json({ message: "Refunds can only be processed for cancelled bookings" });
      }

      const summary = getLedgerSummarySync(salesOrder);
      if (summary.netPayable <= 0) {
        return res.status(400).json({ message: "Net payable amount must be greater than zero to request a refund" });
      }

      const activeRefund = salesOrder.refund_requests.find(
        r => ["pending", "under_review", "approved", "bank_processing", "disbursed"].includes(r.status)
      );
      if (activeRefund) {
        return res.status(409).json({ message: "An active refund request already exists for this sales order" });
      }

      const amountToRefund = payload.refund_amount ? Number(payload.refund_amount) : Number(summary.netPayable);

      const cleanedData = sanitizeInputForPrisma(modelName, {
        ...payload,
        refund_amount: amountToRefund,
        status: "pending",
        requested_by: req.user?.id || null
      });

      const include = getInclude(modelName);
      const record = await prisma.refund_requests.create({
        data: cleanedData,
        ...(include ? { include } : {})
      });

      return res.status(201).json(mapRelations(modelName, record));
    }

    if (modelName === "bank_documents") {
      const salesOrderId = payload.sales_order_id;
      if (!salesOrderId) {
        return res.status(400).json({ message: "sales_order_id is required" });
      }

      // Generate automatic sequential document number: BNOC-YYYY-000001
      const currentYear = new Date().getFullYear();
      const prefix = `BNOC-${currentYear}-`;
      const lastDoc = await prisma.bank_documents.findFirst({
        where: {
          document_number: {
            startsWith: prefix
          }
        },
        orderBy: {
          document_number: "desc"
        }
      });

      let nextNum = 1;
      if (lastDoc && lastDoc.document_number) {
        const parts = lastDoc.document_number.split("-");
        const lastSeq = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastSeq)) {
          nextNum = lastSeq + 1;
        }
      }
      const seqStr = String(nextNum).padStart(6, "0");
      const generatedDocNo = `${prefix}${seqStr}`;

      // Retrieve full data to populate document_content JSON
      const salesOrder = await prisma.sales_orders.findUnique({
        where: { id: salesOrderId },
        include: {
          customers: true,
          projects: true,
          units: true,
          demand_letters: true,
          customer_receipts: true,
          ledger: true
        }
      });

      if (!salesOrder) {
        return res.status(404).json({ message: "Sales order not found" });
      }

      const summary = getLedgerSummarySync(salesOrder);

      // Create document_content JSON with all variable fields needed for reproduction/re-rendering
      const documentContent = {
        document_number: generatedDocNo,
        document_type: payload.document_type || "bank_noc",
        sales_order_id: salesOrderId,
        customer_id: salesOrder.customer_id,
        customer_name: payload.customer_name || salesOrder.customers.full_name || salesOrder.customers.first_name,
        customer_code: salesOrder.customers.customer_code,
        project_name: salesOrder.projects.project_name,
        unit_number: salesOrder.units.unit_number,
        bank_name: payload.bank_name || "",
        branch_name: payload.branch_name || payload.branch || "",
        loan_account_number: payload.loan_account_number || "",
        loan_amount: Number(payload.loan_amount || 0),
        noc_issue_date: payload.noc_issue_date || new Date().toISOString().split("T")[0],
        noc_purpose: payload.noc_purpose || "home_loan",
        bank_officer_name: payload.bank_officer_name || "",
        bank_officer_designation: payload.bank_officer_designation || "",
        agreement_value: Number(payload.agreement_value || salesOrder.agreement_value || 0),
        amount_received_to_date: Number(summary.amountReceivedToDate || 0),
        outstanding_amount: Number(summary.outstandingBalance || 0),
        authorized_signatory: payload.authorized_signatory || "Authorized Signatory",
        remarks: payload.remarks || "",
        co_applicant: payload.co_applicant || "N/A",
        agreement_date: salesOrder.agreement_date || null,
        survey_number: salesOrder.projects.project_code || "Survey No. 44",
        project_location: salesOrder.projects.location || "Balewadi",
        project_city: salesOrder.projects.city || "Pune",
        project_state: salesOrder.projects.state || "Maharashtra",
        generation_date: new Date().toISOString().split("T")[0]
      };

      const cleanedData = sanitizeInputForPrisma(modelName, {
        ...payload,
        document_number: generatedDocNo,
        document_content: documentContent,
        generation_date: new Date(),
        status: "generated", // Generate immediately completes the record
        generated_by: req.user?.id || null,
        created_by: req.user?.id || null,
        file_path: `/uploads/documents/${generatedDocNo}.pdf`
      });

      const include = getInclude(modelName);
      const record = await prisma.bank_documents.create({
        data: cleanedData,
        ...(include ? { include } : {})
      });

      return res.status(201).json(mapRelations(modelName, record));
    }

    const cleanedData = sanitizeInputForPrisma(modelName, payload);
    const include = getInclude(modelName);
    const record = await prisma[modelName].create({
      data: cleanedData,
      ...(include ? { include } : {})
    });
    return res.status(201).json(mapRelations(modelName, record));
  } catch (error) {
    console.error("Create error:", error);
    return res.status(500).json({ message: error.message });
  }
});

app.patch("/api/entities/:entity/:id", authenticateToken, async (req, res) => {
  try {
    const entity = sanitizeEntity(req.params.entity);
    const { id } = req.params;
    
    const modelName = entityMap[entity] || entity.toLowerCase();
    if (!prisma[modelName]) {
      return res.status(404).json({ message: "Model not found" });
    }

    const payload = req.body || {};
    // For patch we only want to update passed fields, but sanitizeInputForPrisma drops missing ones right now
    // Actually we could just use it and rely on what's there
    let cleanedData = {};
        if (modelName === "customers") {
            const mapped = sanitizeInputForPrisma(modelName, payload);
            // Only update fields that were actually in the original patch
            cleanedData = Object.keys(mapped).reduce((acc, key) => {
              if (mapped[key] !== undefined && mapped[key] !== null) acc[key] = mapped[key];
              return acc;
            }, {});
        } else if (modelName === "cancellation_requests") {
            const mapped = sanitizeInputForPrisma(modelName, payload);
            const keyAliasMap = {
              cancellation_reason: ["reason", "cancellation_reason"],
              reason_description: ["remarks", "reason_description"],
              total_amount_paid: ["amount_received", "total_amount_paid"],
              cancellation_charges: ["admin_charges", "cancellation_charges"],
              forfeiture_amount: ["deduction_amount", "forfeiture_amount", "admin_charges", "cancellation_charges"],
              refundable_amount: ["refund_amount", "refundable_amount"],
              penalty_percentage: ["penalty_rate", "penalty_percentage"],
              status: ["status"],
              approval_date: ["approval_date"],
              effective_date: ["effective_date"],
              rejection_reason: ["rejection_reason"],
              sales_order_id: ["sales_order_id"],
              customer_id: ["customer_id"],
              request_date: ["request_date"],
              request_number: ["request_number"]
            };

            cleanedData = Object.keys(mapped).reduce((acc, key) => {
              const aliases = keyAliasMap[key] || [key];
              const hasKey = aliases.some(alias => payload[alias] !== undefined);
              if (hasKey && mapped[key] !== undefined && mapped[key] !== null) {
                acc[key] = mapped[key];
              }
              return acc;
            }, {});
            fsSync.appendFileSync(path.join(process.cwd(), "server", "debug.log"), `[PATCH Request] payload: ${JSON.stringify(payload)}\n[PATCH Request] cleanedData: ${JSON.stringify(cleanedData)}\n`);
        } else {
            cleanedData = sanitizeInputForPrisma(modelName, payload);
        }

    const include = getInclude(modelName);

    if (modelName === "cancellation_requests") {
      const currentRequest = await prisma.cancellation_requests.findUnique({
        where: { id },
        include: { sales_orders: true }
      });
      if (!currentRequest) {
        return res.status(404).json({ message: "Cancellation request not found" });
      }

      const fromStatus = currentRequest.status;
      const toStatus = cleanedData.status;

      // Transition validations
      if (fromStatus === "cancelled" || fromStatus === "completed") {
        return res.status(400).json({ message: "Invalid status transition: already completed/cancelled" });
      }
      if (fromStatus === "approved" && (toStatus === "pending" || toStatus === "under_review")) {
        return res.status(400).json({ message: "Invalid status transition" });
      }

      if (toStatus === "under_review") {
        const record = await prisma.$transaction(async (tx) => {
          await tx.sales_orders.update({
            where: { id: currentRequest.sales_order_id },
            data: { status: "under_review" }
          });
          return await tx.cancellation_requests.update({
            where: { id },
            data: cleanedData,
            ...(include ? { include } : {})
          });
        });
        return res.json(mapRelations(modelName, record));
      }

      if (toStatus === "approved") {
        let settings = { cancellation_charge_percent: 0.5, cancellation_gst_rate: 18 };
        try {
          const settingsData = await fs.readFile(SETTINGS_FILE, "utf-8");
          settings = JSON.parse(settingsData);
        } catch (err) {
          console.warn("Failed to load settings file, using defaults", err);
        }

        const salesOrderId = currentRequest.sales_order_id;
        const customerId = currentRequest.customer_id;

        const summary = await getLedgerSummary(salesOrderId, prisma);
        const agreementValue = summary.agreementValue;
        
        // Cancellation Fee is 0.5% of Agreement Value
        const cancellationCharges = agreementValue * 0.005;
        // Other Recoverable Charges is stored in forfeiture_amount
        const otherRecoverableCharges = Number(cleanedData.forfeiture_amount ?? currentRequest.forfeiture_amount ?? 0);
        
        const totalInterest = summary.totalInterest;
        const amountPaid = summary.amountPaid;
        const refundAmount = amountPaid - cancellationCharges - totalInterest - otherRecoverableCharges;

        const record = await prisma.$transaction(async (tx) => {
          const existingEntries = await tx.ledger.findMany({
            where: {
              sales_order_id: salesOrderId,
              ledger_reference_type: "Cancellation",
              cancellation_request_id: id
            }
          });
          const hasPosted = existingEntries.length > 0;

          await tx.sales_orders.update({
            where: { id: salesOrderId },
            data: {
              status: "cancelled",
              cancellation_date: new Date()
            }
          });

          await tx.units.update({
            where: { id: currentRequest.sales_orders.unit_id },
            data: { status: "cancelled" }
          });

          const updatedRequest = await tx.cancellation_requests.update({
            where: { id },
            data: {
              ...cleanedData,
              cancellation_charges: cancellationCharges,
              forfeiture_amount: otherRecoverableCharges,
              refundable_amount: refundAmount,
              penalty_percentage: 0.5
            },
            ...(include ? { include } : {})
          });

          if (!hasPosted) {
            const demands = await tx.demand_letters.findMany({
              where: { sales_order_id: salesOrderId, status: { not: "cancelled" } }
            });

            for (const d of demands) {
              const principal = Number(d.principal_amount || 0);
              if (principal > 0) {
                await postLedgerEntry(tx, {
                  sales_order_id: salesOrderId,
                  customer_id: customerId,
                  transaction_type: "MILESTONE_REVERSAL",
                  amount: -principal,
                  reference_date: new Date(),
                  description: `Reversal of Demand Principal [Ref: ${d.demand_number}]`,
                  ledger_reference_type: "Cancellation",
                  ledger_reference_id: id,
                  cancellation_request_id: id,
                  reference_no: d.demand_number,
                  financial_snapshot_version: 1
                });
              }
              const gst = Number(d.other_charges || 0);
              if (gst > 0) {
                await postLedgerEntry(tx, {
                  sales_order_id: salesOrderId,
                  customer_id: customerId,
                  transaction_type: "GST_REVERSAL",
                  amount: -gst,
                  reference_date: new Date(),
                  description: `Reversal of Demand GST [Ref: ${d.demand_number}]`,
                  ledger_reference_type: "Cancellation",
                  ledger_reference_id: id,
                  cancellation_request_id: id,
                  reference_no: d.demand_number,
                  financial_snapshot_version: 1
                });
              }
            }

            // Update status of reversed demand letters to cancelled
            await tx.demand_letters.updateMany({
              where: { sales_order_id: salesOrderId, status: { not: "cancelled" } },
              data: { status: "cancelled" }
            });

            if (cancellationCharges > 0) {
              await postLedgerEntry(tx, {
                sales_order_id: salesOrderId,
                customer_id: customerId,
                transaction_type: "CANCELLATION_CHARGE",
                amount: cancellationCharges,
                reference_date: new Date(),
                description: `Agreement Cancellation Fee (0.5% of Agreement Value)`,
                ledger_reference_type: "Cancellation",
                ledger_reference_id: id,
                cancellation_request_id: id,
                reference_no: currentRequest.request_number,
                financial_snapshot_version: 1
              });
            }
            if (otherRecoverableCharges > 0) {
              await postLedgerEntry(tx, {
                sales_order_id: salesOrderId,
                customer_id: customerId,
                transaction_type: "CANCELLATION_GST",
                amount: otherRecoverableCharges,
                reference_date: new Date(),
                description: `Other Recoverable Charges (Maintenance, Documentation, Legal, etc.)`,
                ledger_reference_type: "Cancellation",
                ledger_reference_id: id,
                cancellation_request_id: id,
                reference_no: currentRequest.request_number,
                financial_snapshot_version: 1
              });
            }
          }

          return updatedRequest;
        });

        await syncHistoricalInterest(currentRequest.customer_id, prisma);
        const mapped = mapRelations(modelName, record);
        const finalSummary = await getLedgerSummary(salesOrderId, prisma);
        mapped.refund_amount = finalSummary.refundableAmount;
        mapped.refundable_amount = finalSummary.refundableAmount;
        return res.json(mapped);
      }

      if (toStatus === "revoked" || toStatus === "rejected") {
        const salesOrderId = currentRequest.sales_order_id;

        const record = await prisma.$transaction(async (tx) => {
          await FinancialCalculationService.restoreBooking(salesOrderId, prisma, tx, currentRequest.sales_orders.unit_id);

          const updatedRequest = await tx.cancellation_requests.update({
            where: { id },
            data: {
              status: toStatus,
              approval_date: null
            },
            ...(include ? { include } : {})
          });

          if (fromStatus === "approved") {
            const existingReversals = await tx.ledger.findMany({
              where: {
                sales_order_id: salesOrderId,
                ledger_reference_type: "CancellationReversal",
                cancellation_request_id: id
              }
            });
            const hasReversed = existingReversals.length > 0;

            if (!hasReversed) {
              await FinancialCalculationService.reverseCancellation(salesOrderId, prisma, tx, id);
            }
          }

          return updatedRequest;
        });

        await syncHistoricalInterest(currentRequest.customer_id, prisma);
        const mapped = mapRelations(modelName, record);
        return res.json(mapped);
      }
    }

    if (modelName === "refund_requests") {
      const currentRequest = await prisma.refund_requests.findUnique({
        where: { id }
      });
      if (!currentRequest) {
        return res.status(404).json({ message: "Refund request not found" });
      }

      const fromStatus = currentRequest.status;
      const toStatus = cleanedData.status;

      if (fromStatus === "disbursed") {
        return res.status(400).json({ message: "Refund has already been disbursed and cannot be modified" });
      }

      if (toStatus === "disbursed") {
        const record = await prisma.$transaction(async (tx) => {
          const jvNo = `JV-REF-${Date.now().toString(36).toUpperCase()}`;

          await postLedgerEntry(tx, {
            sales_order_id: currentRequest.sales_order_id,
            customer_id: currentRequest.customer_id,
            transaction_type: "REFUND",
            amount: Number(currentRequest.refund_amount),
            reference_date: new Date(),
            description: "Refund paid against cancelled booking",
            reference_no: currentRequest.request_number,
            journal_voucher_no: jvNo,
            ledger_reference_type: "RefundRequest",
            ledger_reference_id: currentRequest.id,
            created_by: req.user?.id || null
          });

          return await tx.refund_requests.update({
            where: { id },
            data: {
              ...cleanedData,
              disbursed_by: req.user?.id || null,
              disbursement_date: new Date(),
              journal_voucher_no: jvNo,
              transaction_reference: cleanedData.transaction_reference || currentRequest.transaction_reference || `REF-TR-${Date.now()}`
            },
            ...(include ? { include } : {})
          });
        });

        await syncHistoricalInterest(currentRequest.customer_id, prisma);
        return res.json(mapRelations(modelName, record));
      }
    }

    const record = await prisma[modelName].update({
      where: { id },
      data: cleanedData,
      ...(include ? { include } : {})
    });

    const mapped = mapRelations(modelName, record);
    if (modelName === "cancellation_requests" && (mapped.status === "approved" || mapped.status === "completed")) {
      mapped.refund_amount = await calculateRefundFromLedger(mapped.sales_order_id, prisma);
      mapped.refundable_amount = mapped.refund_amount;
    }
    return res.json(mapped);
  } catch (error) {
    if (error.code === 'P2025') {
       return res.status(404).json({ message: "Record not found" });
    }
    console.error("Update error:", error);
    return res.status(500).json({ message: error.message });
  }
});

app.delete("/api/entities/:entity/:id", authenticateToken, async (req, res) => {
  try {
    const entity = sanitizeEntity(req.params.entity);
    const { id } = req.params;
    
    const modelName = entityMap[entity] || entity.toLowerCase();
    if (!prisma[modelName]) {
      return res.status(404).json({ message: "Model not found" });
    }

    if (modelName === "sales_orders") {
      const order = await prisma.sales_orders.findUnique({
        where: { id },
        select: { unit_id: true }
      });
      if (order && order.unit_id) {
        await prisma.units.update({
          where: { id: order.unit_id },
          data: { status: "available" }
        });
      }
      // Delete all related records first to avoid foreign key constraint violations
      await prisma.demand_letters.deleteMany({ where: { sales_order_id: id } });
      await prisma.customer_receipts.deleteMany({ where: { sales_order_id: id } });
      await prisma.payment_schedules.deleteMany({ where: { sales_order_id: id } });
      await prisma.interest_entries.deleteMany({ where: { sales_order_id: id } });
      await prisma.interest_settlements.deleteMany({ where: { sales_order_id: id } });
      await prisma.interest_waiver_requests.deleteMany({ where: { sales_order_id: id } });
      await prisma.bank_documents.deleteMany({ where: { sales_order_id: id } });
      await prisma.client_tds_records.deleteMany({ where: { sales_order_id: id } });
      await prisma.cancellation_requests.deleteMany({ where: { sales_order_id: id } });
      await prisma.refund_requests.deleteMany({ where: { sales_order_id: id } });
      await prisma.handover_requests.deleteMany({ where: { sales_order_id: id } });
      await prisma.resale_requests.deleteMany({ where: { sales_order_id: id } });
      await prisma.shifting_requests.deleteMany({ where: { sales_order_id: id } });
      await prisma.fpv_calculations.deleteMany({ where: { sales_order_id: id } });
      await prisma.agreement_details.deleteMany({ where: { sales_order_id: id } });
    }

    if (modelName === "customers") {
      const orders = await prisma.sales_orders.findMany({
        where: { customer_id: id },
        select: { id: true, unit_id: true }
      });
      const orderIds = orders.map(o => o.id);
      const unitIds = orders.map(o => o.unit_id).filter(Boolean);

      if (unitIds.length > 0) {
        await prisma.units.updateMany({
          where: { id: { in: unitIds } },
          data: { status: "available" }
        });
      }

      await prisma.ledger.deleteMany({ where: { customer_id: id } });
      await prisma.demand_letters.deleteMany({ where: { customer_id: id } });
      await prisma.customer_receipts.deleteMany({ where: { customer_id: id } });
      await prisma.payment_schedules.deleteMany({ where: { sales_order_id: { in: orderIds } } });
      await prisma.agreement_details.deleteMany({ where: { sales_order_id: { in: orderIds } } });

      await prisma.interest_entries.deleteMany({ where: { customer_id: id } });
      await prisma.interest_settlements.deleteMany({ where: { customer_id: id } });
      await prisma.interest_waiver_requests.deleteMany({ where: { customer_id: id } });
      await prisma.bank_documents.deleteMany({ where: { customer_id: id } });
      await prisma.client_tds_records.deleteMany({ where: { customer_id: id } });
      await prisma.cancellation_requests.deleteMany({ where: { customer_id: id } });
      await prisma.refund_requests.deleteMany({ where: { customer_id: id } });
      await prisma.handover_requests.deleteMany({ where: { customer_id: id } });
      await prisma.resale_requests.deleteMany({
        where: {
          OR: [
            { original_customer_id: id },
            { new_customer_id: id }
          ]
        }
      });
      await prisma.shifting_requests.deleteMany({ where: { customer_id: id } });
      await prisma.fpv_calculations.deleteMany({ where: { customer_id: id } });
      await prisma.sales_orders.deleteMany({ where: { customer_id: id } });
    }

    await prisma[modelName].delete({
      where: { id }
    });

    return res.json({ message: "Record deleted successfully" });
  } catch (error) {
    if (error.code === 'P2025') {
       return res.status(404).json({ message: "Record not found" });
    }
    console.error("Delete error:", error);
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/entities/:entity/bulk", authenticateToken, async (req, res) => {
  const records = Array.isArray(req.body) ? req.body : [];
  const entity = sanitizeEntity(req.params.entity);
  
  const modelName = entityMap[entity] || entity.toLowerCase();
  if (!prisma[modelName]) {
    return res.status(404).json({ message: "Model not found" });
  }

  if (modelName === "interest_entries") {
    try {
      const createdEntries = [];
      await prisma.$transaction(async (tx) => {
        const firstItem = records[0] || {};
        const totalInterest = records.reduce((sum, item) => sum + Number(item.interest_amount || 0), 0);
        
        const run = await tx.interest_calculation_runs.create({
          data: {
            run_date: new Date(),
            period_from: new Date(firstItem.period_from || new Date()),
            period_to: new Date(firstItem.period_to || new Date()),
            interest_rate: Number(firstItem.interest_rate || 18),
            calculation_method: "simple",
            status: "completed",
            processed_count: records.length,
            total_interest_generated: totalInterest,
            remarks: "Generated via frontend calculation process"
          }
        });

        for (const item of records) {
          const entryData = {
            run_id: run.id,
            sales_order_id: item.sales_order_id,
            customer_id: item.customer_id,
            period_from: new Date(item.period_from),
            period_to: new Date(item.period_to),
            overdue_principal: Number(item.principal_amount || item.overdue_principal || 0),
            interest_rate: Number(item.interest_rate || 0),
            days_overdue: Number(item.days || item.days_overdue || 0),
            interest_amount: Number(item.interest_amount || 0),
            gst_on_interest: Number(item.gst_on_interest || 0),
            status: "active"
          };

          const record = await tx.interest_entries.create({ data: entryData });
          createdEntries.push(record);

          const startStr = new Date(item.period_from).toLocaleDateString("en-IN");
          const calcStr = new Date(item.period_to).toLocaleDateString("en-IN");
          const days = Number(item.days || item.days_overdue || 0);
          const description = `Delayed payment interest for the period of ${startStr} to ${calcStr} (${days} days)`;

          await tx.ledger.create({
            data: {
              sales_order_id: item.sales_order_id,
              customer_id: item.customer_id,
              transaction_type: "LATE_FEE_INTEREST",
              amount: Number(item.interest_amount || 0),
              reference_date: new Date(item.period_to),
              description: description,
              status: "UNPAID"
            }
          });

          await tx.customers.update({
            where: { id: item.customer_id },
            data: {
              total_outstanding_balance: {
                increment: Number(item.interest_amount || 0)
              }
            }
          });
        }
      });

      return res.status(201).json(createdEntries.map(e => mapRelations(modelName, e)));
    } catch (error) {
      console.error("Bulk interest entries create error:", error);
      return res.status(500).json({ message: error.message });
    }
  }

  try {
    const createdIds = [];
    await prisma.$transaction(async (tx) => {
      for (const item of records) {
        const record = await tx[modelName].create({ data: item });
        createdIds.push(record);
      }
    });
    return res.status(201).json(createdIds);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/receipts/:id/bounce", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { bounce_reason } = req.body || {};

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch original receipt
      const receipt = await tx.customer_receipts.findUnique({
        where: { id },
        include: { customers: true }
      });

      if (!receipt) {
        throw new Error("Receipt not found.");
      }

      if (receipt.status === "bounced") {
        throw new Error("Receipt is already marked as bounced.");
      }

      // 2. Update receipt status to bounced
      const updatedReceipt = await tx.customer_receipts.update({
        where: { id },
        data: {
          status: "bounced",
          bounce_reason: bounce_reason || "Cheque Bounce"
        }
      });

      const amount = Number(receipt.amount || 0);
      const penaltyFee = 500.00;

      // 3. Create Ledger Reversal Entry
      const reversalLedger = await postLedgerEntry(tx, {
        sales_order_id: receipt.sales_order_id,
        customer_id: receipt.customer_id,
        transaction_type: "RECEIPT_REVERSAL",
        amount: amount,
        reference_date: new Date(),
        description: `Reversal of Receipt #${receipt.receipt_number} due to Cheque Bounce.`,
        reference_no: receipt.receipt_number,
        ledger_reference_type: "ReceiptBounce",
        ledger_reference_id: receipt.id
      });

      // 4. Create Penalty Ledger Entry
      const penaltyLedger = await postLedgerEntry(tx, {
        sales_order_id: receipt.sales_order_id,
        customer_id: receipt.customer_id,
        transaction_type: "PENALTY",
        amount: penaltyFee,
        reference_date: new Date(),
        description: "Cheque Bounce Penalty Charge.",
        reference_no: receipt.receipt_number,
        ledger_reference_type: "ReceiptBounce",
        ledger_reference_id: receipt.id
      });

      // 5. Update Customer master total_outstanding_balance
      const updatedCustomer = await tx.customers.update({
        where: { id: receipt.customer_id },
        data: {
          total_outstanding_balance: {
            increment: amount + penaltyFee
          }
        }
      });

      // 6. Trigger automated notification event
      console.log(`[NOTIFICATION EVENT] Sent Email/SMS to customer ${receipt.customers.full_name || "Unknown"} for cheque Ref: ${receipt.transaction_reference || receipt.cheque_dd_number || "N/A"} bounce penalty statement.`);

      return {
        receipt: updatedReceipt,
        reversalLedger,
        penaltyLedger,
        totalOutstandingBalance: Number(updatedCustomer.total_outstanding_balance)
      };
    });

    return res.json({
      success: true,
      message: "Receipt marked as bounced and reversed in ledger successfully.",
      data: result
    });
  } catch (error) {
    console.error("Receipt bounce error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

ensureStorage()
  .then(() => {
    app.listen(PORT, "127.0.0.1", () => {
      console.log(`Local API listening on http://127.0.0.1:${PORT}`);
      startInterestJob();
    });
  })
  .catch((error) => {
    console.error("Failed to initialize PostgreSQL storage:", error.message);
    process.exit(1);
  });
