import express from "express";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs/promises";
import path from "node:path";
import { calculateUnitPricing } from "../../src/lib/unitPricing.js";
import { postDelayedInterestToLedger, syncHistoricalInterest } from "../utils/interestCalculator.js";
import { calculateCustomerLedgerBalance } from "../utils/ledgerBalance.js";
import { getLedgerSummary, getLedgerSummarySync } from "../utils/ledgerFinancialService.js";
import { calculateFPVAndInterest, calculateFpvWithFifoAllocation, calculateWorkbookFpvEngine } from "../utils/fpvCalculator.js";

const router = express.Router();
const prisma = new PrismaClient();

// ==========================================
// 1. UNIT PRICING ENGINE
// ==========================================
router.post("/calculate-unit", async (req, res) => {
  try {
    const data = calculateUnitPricing(req.body);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// MASTER PRICE LIST
// ==========================================
router.get("/master", async (_req, res) => {
  try {
    const units = await prisma.units.findMany({
      include: {
        unitPricing: true,
        projects: true,
        blocks: true,
      },
      orderBy: { unit_number: "asc" },
    });
    res.json(units);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/unit/:unitId", async (req, res) => {
  try {
    const unit = await prisma.units.findUnique({
      where: { id: req.params.unitId },
      include: {
        unitPricing: true,
        projects: true,
        blocks: true,
      },
    });

    if (!unit) {
      return res.status(404).json({ success: false, message: "Unit not found" });
    }

    res.json(unit);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/master", async (req, res) => {
  try {
    const { prices } = req.body;
    if (!Array.isArray(prices)) {
      return res.status(400).json({ error: "prices array is required" });
    }

    await prisma.$transaction(
      prices.flatMap((p) => {
        const ops = [];

        if (p.unit_id) {
          const unitUpdate = {};
          if (p.sba != null) unitUpdate.super_built_up_area = Number(p.sba);
          if (p.unit_type) unitUpdate.unit_type = p.unit_type;
          if (p.floor_number != null && p.floor_number !== "") {
            unitUpdate.floor_number = Number(p.floor_number);
          }

          if (Object.keys(unitUpdate).length > 0) {
            ops.push(
              prisma.units.update({
                where: { id: p.unit_id },
                data: unitUpdate,
              }),
            );
          }

          ops.push(
            prisma.unit_pricing.upsert({
              where: { unit_id: p.unit_id },
              create: {
                unit_id: p.unit_id,
                classification: p.classification || null,
                rate_per_sqft: Number(p.rate_per_sqft) || 0,
                caic_charges: Number(p.caic_charges) || 0,
                maintenance_deposit: Number(p.maintenance_deposit) || 0,
                gst_rate: Number(p.gst_rate ?? 5),
                basic_sale_value: Number(p.basic_sale_value) || 0,
                total_sale_value: Number(p.total_sale_value) || 0,
              },
              update: {
                classification: p.classification || null,
                rate_per_sqft: Number(p.rate_per_sqft) || 0,
                caic_charges: Number(p.caic_charges) || 0,
                maintenance_deposit: Number(p.maintenance_deposit) || 0,
                gst_rate: Number(p.gst_rate ?? 5),
                basic_sale_value: Number(p.basic_sale_value) || 0,
                total_sale_value: Number(p.total_sale_value) || 0,
              },
            }),
          );
        }

        return ops;
      }),
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Master price list save error:", error);
    res.status(500).json({ error: error.message });
  }
});


// ==========================================
// 2. PAYMENT SCHEDULE GENERATOR ENGINE
// ==========================================
router.post("/generate-schedule", async (req, res) => {
  try {
    const { sales_order_id, total_value } = req.body;

    if (!sales_order_id || !total_value) {
      return res.status(400).json({ success: false, message: "Missing sales_order_id or total_value" });
    }

    // This perfectly matches the PL.xlsx - Payment Schedule.csv exactly summing to 100% (1.00)
    const scheduleTemplate = [
      { name: "Booking Amount", percent: 0.10 },
      { name: "Payable within 15 Days from Agreement Date", percent: 0.10 },
      { name: "On Completion of Foundation Works", percent: 0.10 },
      { name: "On Completion of Parking Level 2 Roof slab", percent: 0.05 },
      { name: "On Completion of Parking Level 5 Roof slab", percent: 0.05 },
      { name: "On Completion of Third Floor Roof slab", percent: 0.05 },
      { name: "On Completion of Seventh Floor Roof slab", percent: 0.05 },
      { name: "On Completion of Eleventh Floor Roof slab", percent: 0.05 },
      { name: "On Completion of Fifteenth Floor Roof slab", percent: 0.05 },
      { name: "On Completion of Terrace slab", percent: 0.05 },
      { name: "On Completion of Internal Block Work", percent: 0.05 },
      { name: "On Completion of Internal Plastering", percent: 0.05 },
      { name: "On Completion of Internal Flooring", percent: 0.10 },
      { name: "On Completion of Doors and Windows", percent: 0.10 },
      { name: "On Handover - 5% on Basic Sale Value & Other Charges", percent: 0.05 },
    ];

    const valueNum = Number(total_value);
    
    // Map the template to actual database records
    const scheduleRecords = scheduleTemplate.map((milestone, index) => {
      const dueAmount = valueNum * milestone.percent;
      
      return {
        sales_order_id: sales_order_id,
        milestone_name: milestone.name,
        schedule_type: "construction",
        percentage_of_total: milestone.percent,
        due_amount: dueAmount,
        status: index === 0 ? "paid" : "pending", // Booking amount is usually paid immediately
        display_order: index + 1
      };
    });

    // Delete any existing schedules for this order to prevent duplicates, then insert the new ones
    await prisma.$transaction([
      prisma.payment_schedules.deleteMany({ where: { sales_order_id } }),
      prisma.payment_schedules.createMany({ data: scheduleRecords })
    ]);

    const createdSchedules = await prisma.payment_schedules.findMany({
      where: { sales_order_id },
      orderBy: { display_order: 'asc' }
    });

    res.json({
      success: true,
      message: "Payment schedule generated successfully based on PL.xlsx logic.",
      data: createdSchedules
    });

  } catch (error) {
    console.error("Schedule generation error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});
// ==========================================
// 3. OVERDUE INTEREST CALCULATION ENGINE
// ==========================================
router.post("/calculate-interest", async (req, res) => {
  try {
    const { sales_order_id, annual_interest_rate = 0.18, calculation_date = new Date(), isFinalSettlement = false, is_final_settlement = false } = req.body;

    if (!sales_order_id) {
      return res.status(400).json({ success: false, message: "Missing sales_order_id" });
    }

    const finalSettlementBypass = isFinalSettlement === true || is_final_settlement === true;

    // Query sales order to get customer_id
    const salesOrder = await prisma.sales_orders.findUnique({
      where: { id: sales_order_id }
    });
    if (!salesOrder) {
      return res.status(404).json({ success: false, message: "Sales order not found" });
    }
    const customerId = salesOrder.customer_id;

    // 1. Fetch all Schedules, Receipts and PRL Demands for this Order
    const schedules = await prisma.payment_schedules.findMany({
      where: { sales_order_id },
      orderBy: { original_due_date: 'asc' }
    });

    const receipts = await prisma.customer_receipts.findMany({
      where: { sales_order_id, status: 'cleared' },
      orderBy: { consideration_date: 'asc' }
    });

    const prlDemands = await prisma.demand_letters.findMany({
      where: {
        sales_order_id,
        demand_type: 'subsequent_prl',
        status: { notIn: ['paid', 'cancelled'] }
      },
      orderBy: { due_date: 'asc' }
    });

    const calcDate = new Date(calculation_date);
    const allLedgerEntries = [];

    // Normalize rate: if passed as decimal (e.g. 0.18), convert to percentage (18)
    let rate = Number(annual_interest_rate);
    if (rate <= 1) {
      rate = rate * 100;
    }

    // Calculate per milestone using the external month-by-month calculator utility
    for (const schedule of schedules) {
      if (!schedule.original_due_date || schedule.status === 'paid') continue;
      
      const dueDate = new Date(schedule.original_due_date);
      
      // If the due date hasn't passed yet, no interest
      if (dueDate >= calcDate) continue;

      // Find if any receipt paid for this specific schedule
      const matchedReceipt = receipts.find(r => r.payment_schedule_id === schedule.id);
      
      // End Date is either today (calcDate) if unpaid, or the receipt consideration date
      const endDate = matchedReceipt && matchedReceipt.consideration_date 
        ? new Date(matchedReceipt.consideration_date) 
        : calcDate;

      // If they paid on or before the due date, no interest
      if (endDate <= dueDate) continue;

      const result = await postDelayedInterestToLedger(prisma, {
        salesOrderId: sales_order_id,
        customerId: customerId,
        milestoneDemand: Number(schedule.due_amount),
        amountPaid: 0,
        dueDate: dueDate,
        calculationEndDate: endDate,
        annual_interest_rate: rate,
        milestoneName: schedule.milestone_name,
        isFinalSettlement: finalSettlementBypass
      });

      if (result && result.ledgerEntries) {
        allLedgerEntries.push(...result.ledgerEntries);
      }
    }

    // Calculate interest for outstanding PRL Demands
    for (const demand of prlDemands) {
      if (!demand.due_date) continue;

      const dueDate = new Date(demand.due_date);

      // If the due date hasn't passed yet, no interest
      if (dueDate >= calcDate) continue;

      // Find if any receipt paid for this specific demand schedule
      const matchedReceipt = demand.payment_schedule_id
        ? receipts.find(r => r.payment_schedule_id === demand.payment_schedule_id)
        : null;

      if (demand.payment_schedule_id) {
        const schedule = schedules.find(s => s.id === demand.payment_schedule_id);
        if (schedule && schedule.status === 'paid') continue;
      }

      const endDate = matchedReceipt && matchedReceipt.consideration_date
        ? new Date(matchedReceipt.consideration_date)
        : calcDate;

      // If they paid on or before the due date, no interest
      if (endDate <= dueDate) continue;

      const result = await postDelayedInterestToLedger(prisma, {
        salesOrderId: sales_order_id,
        customerId: customerId,
        milestoneDemand: Number(demand.principal_amount),
        amountPaid: 0,
        dueDate: dueDate,
        calculationEndDate: endDate,
        annual_interest_rate: rate,
        milestoneName: `PRL Demand - ${demand.demand_number}`,
        isFinalSettlement: finalSettlementBypass
      });

      if (result && result.ledgerEntries) {
        allLedgerEntries.push(...result.ledgerEntries);
      }
    }

    res.json({
      success: true,
      ledger_entries: allLedgerEntries,
      data: {
        ledger_entries: allLedgerEntries
      }
    });

  } catch (error) {
    console.error("Interest calculation error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 5. CRM LEDGER REPORT SERVICE
// ==========================================

// GET /pricing/ledger/customers
router.get("/ledger/customers", async (req, res) => {
  try {
    const customers = await prisma.customers.findMany({
      where: { is_active: true },
      orderBy: { created_at: "desc" }
    });
    res.json(customers.map(c => ({
      id: c.id,
      customer_code: c.customer_code,
      name_applicant_1: c.full_name || `${c.first_name} ${c.last_name || ""}`.trim(),
      pan_no: c.pan_number || "-"
    })));
  } catch (error) {
    console.error("Error listing ledger customers:", error);
    res.status(500).json({ message: error.message });
  }
});

// GET /pricing/ledger/units
router.get("/ledger/units", async (req, res) => {
  try {
    const orders = await prisma.sales_orders.findMany({
      include: {
        units: {
          include: {
            unitPricing: true
          }
        }
      }
    });

    res.json(orders.map(o => ({
      id: o.unit_id,
      project_id: o.project_id,
      customer_id: o.customer_id,
      unit_no: o.units?.unit_number || "Unknown",
      sale_area: Number(o.sale_area || o.units?.super_built_up_area || 0),
      basic_sale_value: Number(o.basic_sale_value || o.units?.unitPricing?.basic_sale_value || 0),
      total_value: Number(o.total_value || o.units?.unitPricing?.total_sale_value || 0)
    })));
  } catch (error) {
    console.error("Error listing ledger units:", error);
    res.status(500).json({ message: error.message });
  }
});

// GET /pricing/ledger/projects
router.get("/ledger/projects", async (req, res) => {
  try {
    const projects = await prisma.projects.findMany({
      where: { is_active: true }
    });
    res.json(projects.map(p => ({
      id: p.id,
      name: p.project_name
    })));
  } catch (error) {
    console.error("Error listing ledger projects:", error);
    res.status(500).json({ message: error.message });
  }
});

// GET /pricing/ledger/:unitId
router.get("/ledger/:unitId", async (req, res) => {
  try {
    const { unitId } = req.params;
    const asOfDateStr = req.query.as_of_date;
    const asOfDate = asOfDateStr ? new Date(asOfDateStr) : new Date();

    let order = await prisma.sales_orders.findFirst({
      where: { unit_id: unitId, status: { notIn: ["cancelled", "resale"] } },
      include: {
        demand_letters: true,
        customer_receipts: true,
        ledger: true,
        cancellation_requests: {
          where: {
            status: { notIn: ["revoked", "rejected"] }
          },
          orderBy: { created_at: "desc" },
          take: 1
        }
      }
    });

    if (!order) {
      order = await prisma.sales_orders.findFirst({
        where: { unit_id: unitId },
        orderBy: { updated_at: "desc" },
        include: {
          demand_letters: true,
          customer_receipts: true,
          ledger: true,
          cancellation_requests: {
            where: {
              status: { notIn: ["revoked", "rejected"] }
            },
            orderBy: { created_at: "desc" },
            take: 1
          }
        }
      });
    }

    if (!order) {
      return res.status(404).json({ detail: "No sales order found for this unit." });
    }

    const customerId = order.customer_id;

    // Run dynamic interest sync inside Express backend for this customer
    await syncHistoricalInterest(customerId, prisma);

    // Re-fetch order to include fresh interest entries
    const freshOrder = await prisma.sales_orders.findUnique({
      where: { id: order.id },
      include: {
        demand_letters: true,
        customer_receipts: true,
        ledger: true,
        cancellation_requests: {
          where: {
            status: { notIn: ["revoked", "rejected"] }
          },
          orderBy: { created_at: "desc" },
          take: 1
        }
      }
    });

    const summary = getLedgerSummarySync(freshOrder);

    res.json({
      customer_id: customerId,
      unit_id: unitId,
      as_of_date: asOfDate.toISOString().split("T")[0],
      total_outstanding_balance: summary.outstandingBalance,
      total_receipts: summary.amountPaid,
      total_interest: summary.totalInterest,
      estimated_refund: summary.refundableAmount,
      cancellation_charges: summary.cancellationCharges,
      cancellation_gst: summary.gstOnCancellation,
      total_deduction: summary.totalRecoveries,
      ledger_entries: summary.ledgerEntries,
      order_status: freshOrder.status,
      net_payable: summary.netPayable,
      total_recoveries: summary.totalRecoveries,
      settlement_status: summary.settlementStatus,
      milestone_principal_reversed: summary.milestonePrincipalReversed
    });
  } catch (error) {
    console.error("Error retrieving ledger:", error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /pricing/ledger-summary/:salesOrderId
router.get("/ledger-summary/:salesOrderId", async (req, res) => {
  try {
    const { salesOrderId } = req.params;
    const summary = await getLedgerSummary(salesOrderId, prisma);
    res.json(summary);
  } catch (error) {
    console.error("Error fetching ledger summary:", error);
    res.status(500).json({ message: error.message });
  }
});

// POST /pricing/ledger/milestone/trigger
router.post("/ledger/milestone/trigger", async (req, res) => {
  try {
    const { unit_id, milestone_name, installment_amount, tax_amount, transaction_date, consideration_date } = req.body;
    
    const order = await prisma.sales_orders.findFirst({
      where: { unit_id: unit_id, status: { notIn: ["cancelled", "resale"] } }
    });

    if (!order) {
      return res.status(404).json({ detail: "No active sales order found for unit." });
    }

    const tDate = transaction_date ? new Date(transaction_date) : new Date();
    const cDate = consideration_date ? new Date(consideration_date) : tDate;

    const demand = await prisma.demand_letters.create({
      data: {
        demand_number: "DM" + Date.now().toString(36).toUpperCase(),
        sales_order_id: order.id,
        customer_id: order.customer_id,
        demand_type: "subsequent_prl",
        demand_date: tDate,
        due_date: cDate,
        principal_amount: installment_amount,
        other_charges: tax_amount,
        status: "generated"
      }
    });

    res.json(demand);
  } catch (error) {
    console.error("Error triggering milestone:", error);
    res.status(500).json({ detail: error.message });
  }
});

// POST /pricing/ledger/transaction
router.post("/ledger/transaction", async (req, res) => {
  try {
    const { unit_id, transaction_date, consideration_date, type, narration, debit, credit } = req.body;

    const order = await prisma.sales_orders.findFirst({
      where: { unit_id: unit_id, status: { notIn: ["cancelled", "resale"] } }
    });

    if (!order) {
      return res.status(404).json({ detail: "No active sales order found for unit." });
    }

    const tDate = transaction_date ? new Date(transaction_date) : new Date();
    const cDate = consideration_date ? new Date(consideration_date) : tDate;

    if (type === "Receipt") {
      const receipt = await prisma.customer_receipts.create({
        data: {
          receipt_number: "RC" + Date.now().toString(36).toUpperCase(),
          sales_order_id: order.id,
          customer_id: order.customer_id,
          receipt_date: tDate,
          consideration_date: cDate,
          amount: credit,
          payment_mode: "Manual",
          narration: narration,
          status: "cleared"
        }
      });
      return res.json(receipt);
    } else if (type === "TDS") {
      const receipt = await prisma.customer_receipts.create({
        data: {
          receipt_number: "TDS" + Date.now().toString(36).toUpperCase(),
          sales_order_id: order.id,
          customer_id: order.customer_id,
          receipt_date: tDate,
          consideration_date: cDate,
          amount: 0,
          tds_amount: credit,
          payment_mode: "TDS",
          narration: narration,
          status: "cleared"
        }
      });
      return res.json(receipt);
    } else {
      const adj = await prisma.ledger.create({
        data: {
          sales_order_id: order.id,
          customer_id: order.customer_id,
          transaction_type: "ADJUSTMENT",
          amount: debit > 0 ? debit : -credit,
          reference_date: tDate,
          description: narration,
          status: "PAID"
        }
      });
      return res.json(adj);
    }
  } catch (error) {
    console.error("Error creating transaction:", error);
    res.status(500).json({ detail: error.message });
  }
});

// POST /pricing/ledger/setup/seed-data
router.post("/ledger/setup/seed-data", async (req, res) => {
  res.json({ message: "Database already seeded with production users." });
});

// POST /pricing/ledger/interest/run-cron
router.post("/ledger/interest/run-cron", async (req, res) => {
  try {
    const customers = await prisma.customers.findMany();
    for (const c of customers) {
      await syncHistoricalInterest(c.id, prisma);
    }
    res.json({
      status: "success",
      processed_units_count: customers.length,
      posted_interest_count: 0,
      details: []
    });
  } catch (error) {
    console.error("Error running interest run:", error);
    res.status(500).json({ detail: error.message });
  }
});

// POST /pricing/calculate-fpv
router.post("/calculate-fpv", async (req, res) => {
  try {
    const result = await buildFpvComputationResponse(req.body);
    res.json(result);
  } catch (error) {
    console.error("Error calculating FPV:", error);
    res.status(400).json({ detail: error.message });
  }
});

const PRESALES_SCHEDULE_FILE = path.join(process.cwd(), "server", "presales_payment_schedule.json");

const formatDateValue = (value) => {
  if (!value) return "";
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().split("T")[0];
};

const defaultPresalesSchedule = [
  { id: 1, name: "Booking Amount", percent: 10, expectedDate: "" },
  { id: 2, name: "Payable within 15 Days from Agreement Date", percent: 10, expectedDate: "" },
  { id: 3, name: "On Completion of Foundation Works", percent: 10, expectedDate: "2026-10-30" },
  { id: 4, name: "On Completion of Parking Level 2 Roof slab", percent: 5, expectedDate: "2026-12-30" },
  { id: 5, name: "On Completion of Parking Level 5 Roof slab", percent: 5, expectedDate: "2027-02-28" },
  { id: 6, name: "On Completion of Third Floor Roof slab", percent: 5, expectedDate: "2027-04-30" },
  { id: 7, name: "On Completion of Seventh Floor Roof slab", percent: 5, expectedDate: "2027-06-30" },
  { id: 8, name: "On Completion of Eleventh Floor Roof slab", percent: 5, expectedDate: "2027-08-31" },
  { id: 9, name: "On Completion of Fifteenth Floor Roof slab", percent: 5, expectedDate: "2027-10-31" },
  { id: 10, name: "On Completion of Terrace slab", percent: 5, expectedDate: "2027-12-31" },
  { id: 11, name: "On Completion of Internal Block Work", percent: 5, expectedDate: "2028-02-28" },
  { id: 12, name: "On Completion of Internal Plastering", percent: 5, expectedDate: "2028-04-30" },
  { id: 13, name: "On Completion of Internal Flooring", percent: 10, expectedDate: "2028-06-30" },
  { id: 14, name: "On Completion of Doors and Windows", percent: 10, expectedDate: "2028-08-31" },
  { id: 15, name: "On Handover - 5% on Basic Sale Value & Other Charges", percent: 5, expectedDate: "2028-10-31" },
];

const ensurePresalesScheduleFile = async () => {
  try {
    await fs.access(PRESALES_SCHEDULE_FILE);
  } catch {
    await fs.writeFile(PRESALES_SCHEDULE_FILE, JSON.stringify(defaultPresalesSchedule, null, 2), "utf-8");
  }
};

const readPresalesSchedule = async () => {
  await ensurePresalesScheduleFile();
  const data = await fs.readFile(PRESALES_SCHEDULE_FILE, "utf-8");
  const parsed = JSON.parse(data);
  return Array.isArray(parsed) ? parsed : defaultPresalesSchedule;
};

// GET /pricing/presales-schedule
router.get("/presales-schedule", async (_req, res) => {
  try {
    const schedule = await readPresalesSchedule();
    res.json(schedule);
  } catch (error) {
    console.error("Error loading presales schedule:", error);
    res.status(500).json({ detail: error.message });
  }
});

// POST /pricing/presales-schedule
router.post("/presales-schedule", async (req, res) => {
  try {
    const { schedule } = req.body;
    if (!Array.isArray(schedule)) {
      return res.status(400).json({ error: "Schedule must be an array" });
    }
    await ensurePresalesScheduleFile();
    await fs.writeFile(PRESALES_SCHEDULE_FILE, JSON.stringify(schedule, null, 2), "utf-8");
    res.json({ success: true, message: "Presales schedule updated successfully" });
  } catch (error) {
    console.error("Error saving presales schedule:", error);
    res.status(500).json({ detail: error.message });
  }
});

const buildCustomerSchedulePayload = async (salesOrderId) => {
  const salesOrder = await prisma.sales_orders.findUnique({
    where: { id: salesOrderId },
    select: {
      id: true,
      customer_id: true,
      booking_date: true,
      agreement_date: true,
      agreement_value: true,
      total_value: true,
      basic_sale_value: true,
      order_number: true,
    }
  });

  if (!salesOrder) {
    throw new Error("Sales order not found");
  }

  const paymentSchedules = await prisma.payment_schedules.findMany({
    where: { sales_order_id: salesOrderId },
    orderBy: { display_order: "asc" },
    select: {
      id: true,
      milestone_name: true,
      percentage_of_total: true,
      due_amount: true,
      original_due_date: true,
      revised_due_date: true,
      display_order: true,
      status: true,
    }
  });

  const presalesSchedule = await readPresalesSchedule();
  const baseValue = Number(salesOrder.basic_sale_value ?? salesOrder.total_value ?? salesOrder.agreement_value ?? 0);

  const dueSchedule = await Promise.all(paymentSchedules.map(async (schedule, index) => {
    const demandRecord = await prisma.demand_letters.findFirst({
      where: { sales_order_id: salesOrderId, payment_schedule_id: schedule.id },
      orderBy: { demand_date: "asc" },
      select: { demand_date: true, due_date: true }
    });

    const billedDate = demandRecord?.demand_date || demandRecord?.due_date || null;
    const fallbackDate = schedule.revised_due_date || schedule.original_due_date || null;
    const presalesDate = presalesSchedule[index]?.expectedDate || presalesSchedule[index]?.expected_date || null;
    const resolvedDueDate = billedDate || fallbackDate || presalesDate || null;

    const dueAmount = schedule.due_amount != null
      ? Number(schedule.due_amount)
      : (baseValue > 0 && schedule.percentage_of_total != null
        ? baseValue * Number(schedule.percentage_of_total)
        : 0);

    const allocationPercent = schedule.percentage_of_total != null ? Number(schedule.percentage_of_total) * 100 : null;
    const source = index < 2 ? "Customer" : "Presales";

    return {
      id: schedule.id,
      description: schedule.milestone_name,
      name: schedule.milestone_name,
      allocation_percent: allocationPercent,
      percent: allocationPercent,
      due_date: resolvedDueDate ? formatDateValue(resolvedDueDate) : "",
      due_amount: dueAmount,
      amount: dueAmount,
      rowAmount: dueAmount,
      sequence: schedule.display_order,
      milestone_type: index < 2 ? "Customer" : "Presales",
      billing_status: schedule.status,
      source,
    };
  }));

  const existingReceipts = await prisma.customer_receipts.findMany({
    where: {
      sales_order_id: salesOrderId,
      status: { in: ["received", "cleared"] }
    },
    orderBy: { receipt_date: "asc" },
    select: {
      id: true,
      receipt_number: true,
      receipt_date: true,
      amount: true,
    }
  });

  return {
    sales_order: salesOrder,
    booking_date: salesOrder.booking_date ? formatDateValue(salesOrder.booking_date) : "",
    due_schedule: dueSchedule,
    existing_receipts: existingReceipts.map((receipt) => ({
      id: receipt.id,
      description: receipt.receipt_number,
      date: formatDateValue(receipt.receipt_date),
      amount: Number(receipt.amount || 0),
      source: "ledger",
    })),
    base_value: baseValue,
  };
};

const buildFpvComputationResponse = async (body) => {
  const { sales_order_id, due_schedule = [], payments = [], due_details = [], payment_details = [] } = body;
  const scheduleRows = Array.isArray(due_schedule) && due_schedule.length ? due_schedule : (Array.isArray(due_details) ? due_details : []);
  const paymentRows = Array.isArray(payments) && payments.length ? payments : (Array.isArray(payment_details) ? payment_details : []);

  let agreementValue = Number(body.agreement_value ?? body.basic_sale_value ?? body.base_value ?? 0);
  if (!agreementValue && sales_order_id) {
    const salesOrder = await prisma.sales_orders.findUnique({
      where: { id: sales_order_id },
      select: { agreement_value: true, total_value: true, basic_sale_value: true }
    });
    agreementValue = Number(salesOrder?.basic_sale_value ?? salesOrder?.agreement_value ?? salesOrder?.total_value ?? 0);
  }

  const result = calculateWorkbookFpvEngine({
    agreementValue,
    bookingDate: body.booking_date || body.bookingDate,
    computationDate: body.computation_date || body.computationDate,
    discountRate: Number(body.discount_rate ?? body.discountRate ?? body.discount ?? body.interest_rate ?? body.interest_rate_pa ?? body.interestRate ?? 0),
    interestRate: Number(body.interest_rate ?? body.interest_rate_pa ?? body.interestRate ?? 0),
    milestones: scheduleRows.map((row, index) => ({
      id: row.id,
      description: row.description || row.name || row.milestone_name,
      allocation_percent: row.allocation_percent ?? row.percent,
      due_date: row.due_date || row.dueDate || row.target_date || row.original_due_date || row.revised_due_date || null,
      due_amount: row.due_amount ?? row.rowAmount ?? row.amount ?? row.value,
      source: row.source,
      sequence: row.sequence ?? index + 1,
      milestone_type: row.milestone_type,
      billing_status: row.billing_status,
    })),
    payments: paymentRows.map((row, index) => ({
      id: row.id || `payment-${index + 1}`,
      reference: row.reference || row.description || row.receipt_number,
      payment_date: row.payment_date || row.paymentDate || row.date,
      amount: row.amount,
      source: row.source,
    })),
    reconciliation: {
      expectedAgreementValue: Number(body.expected_agreement_value ?? body.expectedAgreementValue ?? agreementValue),
      expectedTotalReceipts: Number(body.expected_total_receipts ?? body.expectedTotalReceipts ?? 0) || null,
      expectedOutstanding: Number(body.expected_outstanding ?? body.expectedOutstanding ?? 0) || null,
      expectedDueScheduleAmount: Number(body.expected_due_schedule_amount ?? body.expectedDueScheduleAmount ?? 0) || null,
    },
  });

  return {
    agreement: result.agreement,
    milestones: result.milestones,
    allocations: result.allocations,
    totals: result.totals,
    summary: {
      ...result.summary,
      total_milestones: scheduleRows.length,
      total_allocation: scheduleRows.reduce((sum, row) => sum + Number(row.allocation_percent ?? row.percent ?? 0), 0),
    },
    warnings: result.warnings,
  };
};

router.get("/customer-schedule/:lienId", async (req, res) => {
  try {
    const payload = await buildCustomerSchedulePayload(req.params.lienId);
    res.json(payload);
  } catch (error) {
    console.error("Error loading customer schedule:", error);
    res.status(500).json({ detail: error.message });
  }
});

router.get("/fpv-workflow/:salesOrderId", async (req, res) => {
  try {
    const { salesOrderId } = req.params;
    const payload = await buildCustomerSchedulePayload(salesOrderId);

    const savedFpv = await prisma.fpv_calculations.findFirst({
      where: { sales_order_id: salesOrderId },
      select: {
        id: true,
        calculation_date: true,
        interest_rate: true,
        total_agreement_value: true,
        discount_on_upfront: true,
        interest_on_late_payment: true,
        net_fpv: true,
        schedule_details: true,
        payment_details: true,
      }
    });

    res.json({
      ...payload,
      due_details: payload.due_schedule,
      saved_fpv: savedFpv,
      summary: savedFpv ? {
        total_due_amount: savedFpv.total_agreement_value,
        total_paid_amount: 0,
        total_discount: savedFpv.discount_on_upfront,
        total_late_interest: savedFpv.interest_on_late_payment,
        outstanding_amount: savedFpv.net_fpv,
        net_adjustment: savedFpv.net_fpv,
      } : null,
    });
  } catch (error) {
    console.error("Error loading FPV workflow:", error);
    res.status(500).json({ detail: error.message });
  }
});

router.post("/fpv-workflow/compute", async (req, res) => {
  try {
    const result = await buildFpvComputationResponse(req.body);
    res.json(result);
  } catch (error) {
    console.error("Error computing FPV workflow:", error);
    res.status(400).json({ detail: error.message });
  }
});

// GET /pricing/fpv-calculation/:salesOrderId
router.get("/fpv-calculation/:salesOrderId", async (req, res) => {
  try {
    const { salesOrderId } = req.params;
    const record = await prisma.fpv_calculations.findFirst({
      where: { sales_order_id: salesOrderId }
    });
    res.json(record);
  } catch (error) {
    console.error("Error fetching FPV calculation:", error);
    res.status(500).json({ detail: error.message });
  }
});

// POST /pricing/fpv-calculation
router.post("/fpv-calculation", async (req, res) => {
  try {
    const {
      sales_order_id,
      customer_id,
      calculation_date,
      interest_rate,
      total_agreement_value,
      discount_on_upfront,
      interest_on_late_payment,
      net_fpv,
      schedule_details,
      payment_details
    } = req.body;

    if (!sales_order_id || !customer_id) {
      return res.status(400).json({ error: "Missing sales_order_id or customer_id" });
    }

    const existing = await prisma.fpv_calculations.findFirst({
      where: { sales_order_id }
    });

    let record;
    if (existing) {
      record = await prisma.fpv_calculations.update({
        where: { id: existing.id },
        data: {
          calculation_date: calculation_date ? new Date(calculation_date) : new Date(),
          interest_rate: interest_rate,
          total_agreement_value: total_agreement_value,
          discount_on_upfront: discount_on_upfront,
          interest_on_late_payment: interest_on_late_payment,
          net_fpv: net_fpv,
          schedule_details: schedule_details,
          payment_details: payment_details,
          updated_at: new Date()
        }
      });
    } else {
      const calculation_number = `FPV-${Math.floor(100000 + Math.random() * 900000)}`;
      record = await prisma.fpv_calculations.create({
        data: {
          calculation_number,
          sales_order_id,
          customer_id,
          calculation_date: calculation_date ? new Date(calculation_date) : new Date(),
          interest_rate: interest_rate,
          total_agreement_value: total_agreement_value,
          discount_on_upfront: discount_on_upfront,
          interest_on_late_payment: interest_on_late_payment,
          net_fpv: net_fpv,
          schedule_details: schedule_details,
          payment_details: payment_details,
        }
      });
    }

    res.json(record);
  } catch (error) {
    console.error("Error saving FPV calculation:", error);
    res.status(500).json({ detail: error.message });
  }
});

export default router;