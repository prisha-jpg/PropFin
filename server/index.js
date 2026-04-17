import "dotenv/config";
import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import pricingRoutes from "./routes/pricing.js";

const PORT = Number(process.env.API_PORT || 4000);
const DATABASE_URL = process.env.DATABASE_URL;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL. Add it to your .env file.");
  process.exit(1);
}

const prisma = new PrismaClient();

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: "2mb" }));
app.use("/api/pricing", pricingRoutes);

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
    return {
      order_number: payload.order_number || `SO${Date.now()}`,
      customer_id: payload.customer_id,
      project_id: payload.project_id,
      unit_id: payload.unit_id,
      booking_date: payload.booking_date ? new Date(payload.booking_date) : new Date(),
      basic_sale_value: toNumberOrZero(payload.basic_sale_value),
      status: payload.status || "open_order",
      notes: payload.notes || null,
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
  SalesOrder: "sales_orders",
  PaymentReceipt: "customer_receipts",
  DemandLetter: "demand_letters",
  DashboardNote: "dashboard_notes",
  PaymentReminder: "payment_reminder_letters"
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

  try {
    const rows = await prisma[modelName].findMany({
      orderBy,
      take: safeLimit
    });
    return rows;
  } catch (error) {
    if (error.code === 'P2009' || error.message.includes('Unknown argument')) {
      // Fallback basic order if sort field doesn't exist
      const rows = await prisma[modelName].findMany({
         orderBy: { created_at: 'desc' },
         take: safeLimit
      });
      return rows;
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

app.get("/api/auth/me", (_req, res) => {
  res.json({
    id: "local-user",
    full_name: "Local User",
    role: "admin",
  });
});

app.get("/api/entities/:entity", async (req, res) => {
  try {
    const entity = sanitizeEntity(req.params.entity);
    const data = await listRecords(entity, req.query.sort, req.query.limit);
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/entities/:entity/:id", async (req, res) => {
  try {
    const entity = sanitizeEntity(req.params.entity);
    const { id } = req.params;
    
    const modelName = entityMap[entity] || entity.toLowerCase();
    
    if (!prisma[modelName]) {
      return res.status(404).json({ message: "Model not found" });
    }

    const record = await prisma[modelName].findUnique({
      where: { id }
    });

    if (!record) {
      return res.status(404).json({ message: "Record not found" });
    }
    return res.json(record);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/entities/:entity", async (req, res) => {
  try {
    const entity = sanitizeEntity(req.params.entity);
    const modelName = entityMap[entity] || entity.toLowerCase();
    
    if (!prisma[modelName]) {
      return res.status(404).json({ message: "Model not found" });
    }

    const payload = req.body || {};
    const cleanedData = sanitizeInputForPrisma(modelName, payload);

    const record = await prisma[modelName].create({
      data: cleanedData
    });
    return res.status(201).json(record);
  } catch (error) {
    console.error("Create error:", error);
    return res.status(500).json({ message: error.message });
  }
});

app.patch("/api/entities/:entity/:id", async (req, res) => {
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

    const record = await prisma[modelName].update({
      where: { id },
      data: cleanedData,
    });

    return res.json(record);
  } catch (error) {
    if (error.code === 'P2025') {
       return res.status(404).json({ message: "Record not found" });
    }
    console.error("Update error:", error);
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/entities/:entity/bulk", async (req, res) => {
  const records = Array.isArray(req.body) ? req.body : [];
  const entity = sanitizeEntity(req.params.entity);
  
  const modelName = entityMap[entity] || entity.toLowerCase();
  if (!prisma[modelName]) {
    return res.status(404).json({ message: "Model not found" });
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

ensureStorage()
  .then(() => {
    app.listen(PORT, "127.0.0.1", () => {
      console.log(`Local API listening on http://127.0.0.1:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize PostgreSQL storage:", error.message);
    process.exit(1);
  });
