import "dotenv/config";
import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import pricingRoutes from "./routes/pricing.js";
import documentsRoutes from "./routes/documents.js";
import { startInterestJob } from "./jobs/interestJob.js";

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
  ClientTDS: "client_tds_records",
  PaymentReminder: "payment_reminder_letters",
  BankDocument: "bank_documents",
  ResaleRequest: "resale_requests",
  CancellationRequest: "cancellation_requests",
  ShiftingRequest: "shifting_requests",
  RefundRequest: "refund_requests",
  HandoverRequest: "handover_requests",
};

const getInclude = (modelName) => {
  if (modelName === "sales_orders") {
    return {
      customers: true,
      projects: true,
      units: true,
      demand_letters: true,
      customer_receipts: true,
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
    "client_tds_records",
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
    // Calculate dynamic outstanding_amount = Total Demanded - Total Received
    const totalDemanded = (row.demand_letters || []).reduce((sum, d) => {
      return sum + Number(d.total_demand_amount || d.principal_amount || 0);
    }, 0);
    const totalReceipts = (row.customer_receipts || []).reduce((sum, r) => {
      return sum + Number(r.amount || 0);
    }, 0);
    mapped.outstanding_amount = Number((totalDemanded - totalReceipts).toFixed(2));
  } else if ([
    "customer_receipts",
    "demand_letters",
    "payment_reminder_letters",
    "interest_entries",
    "interest_settlements",
    "client_tds_records",
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

app.get("/api/entities/:entity", authenticateToken, async (req, res) => {
  try {
    const entity = sanitizeEntity(req.params.entity);
    const data = await listRecords(entity, req.query.sort, req.query.limit);
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
    return res.json(mapRelations(modelName, record));
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
        const description = `Delayed payment interest for the period of ${startStr} to ${calcStr}`;

        await tx.ledger.create({
          data: {
            sales_order_id: payload.sales_order_id,
            customer_id: payload.customer_id,
            transaction_type: "LATE_FEE_INTEREST",
            amount: Number(payload.interest_amount || 0),
            reference_date: new Date(payload.period_to),
            description: description,
            status: "UNPAID"
          }
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
    if (Object.keys(payload).length > 0) {
        if (modelName === "customers") {
            const mapped = sanitizeInputForPrisma(modelName, payload);
            // Only update fields that were actually in the original patch
            cleanedData = Object.keys(mapped).reduce((acc, key) => {
              if (mapped[key] !== undefined && mapped[key] !== null) acc[key] = mapped[key];
              return acc;
            }, {});
        } else {
            cleanedData = sanitizeInputForPrisma(modelName, payload);
        }
    }

    const include = getInclude(modelName);
    const record = await prisma[modelName].update({
      where: { id },
      data: cleanedData,
      ...(include ? { include } : {})
    });

    return res.json(mapRelations(modelName, record));
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
      // Delete all related records first to avoid foreign key constraint violations
      await prisma.payment_schedules.deleteMany({ where: { sales_order_id: id } });
      await prisma.customer_receipts.deleteMany({ where: { sales_order_id: id } });
      await prisma.demand_letters.deleteMany({ where: { sales_order_id: id } });
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
          const description = `Delayed payment interest for the period of ${startStr} to ${calcStr}`;

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
      const reversalLedger = await tx.ledger.create({
        data: {
          sales_order_id: receipt.sales_order_id,
          customer_id: receipt.customer_id,
          transaction_type: "REVERSAL",
          amount: amount,
          reference_date: new Date(),
          description: `Reversal of Receipt #${receipt.receipt_number} due to Cheque Bounce.`,
          status: "UNPAID"
        }
      });

      // 4. Create Penalty Ledger Entry
      const penaltyLedger = await tx.ledger.create({
        data: {
          sales_order_id: receipt.sales_order_id,
          customer_id: receipt.customer_id,
          transaction_type: "PENALTY",
          amount: penaltyFee,
          reference_date: new Date(),
          description: "Cheque Bounce Penalty Charge.",
          status: "UNPAID"
        }
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
