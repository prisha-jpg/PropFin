import express from "express";
import { PrismaClient } from "@prisma/client";
import { calculateUnitPricing } from "../../src/lib/unitPricing.js";
import { postDelayedInterestToLedger, syncHistoricalInterest } from "../utils/interestCalculator.js";

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
      where: { status: { notIn: ["cancelled", "resale"] } },
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

    const order = await prisma.sales_orders.findFirst({
      where: { unit_id: unitId, status: { notIn: ["cancelled", "resale"] } }
    });

    if (!order) {
      return res.status(404).json({ detail: "No active sales order found for this unit." });
    }

    const customerId = order.customer_id;

    // Run dynamic interest sync inside Express backend for this customer
    await syncHistoricalInterest(customerId, prisma);

    // Retrieve all relevant transaction types from core tables
    const demands = await prisma.demand_letters.findMany({
      where: { sales_order_id: order.id, status: { not: "cancelled" } },
      include: { payment_schedules: true }
    });

    const receipts = await prisma.customer_receipts.findMany({
      where: { sales_order_id: order.id, status: { not: "bounced" } }
    });

    const adjustments = await prisma.ledger.findMany({
      where: { sales_order_id: order.id }
    });

    const entries = [];

    // Map demands: Installment + Tax
    demands.forEach(d => {
      // Installment debit
      entries.push({
        id: d.id,
        transaction_date: d.demand_date,
        consideration_date: d.due_date || d.demand_date,
        type: "Installment",
        narration: `Milestone: ${d.payment_schedules?.milestone_name || d.demand_type || "Installment"}`,
        debit: Number(d.principal_amount || 0),
        credit: 0,
        is_posted: true
      });

      // Tax debit (GST)
      const gst = Number(d.other_charges || 0);
      if (gst > 0) {
        entries.push({
          id: d.id + "_tax",
          transaction_date: d.demand_date,
          consideration_date: d.due_date || d.demand_date,
          type: "Tax",
          narration: `GST on ${d.payment_schedules?.milestone_name || d.demand_type || "Installment"}`,
          debit: gst,
          credit: 0,
          is_posted: true
        });
      }

      // Overdue interest posted in demand letter
      const interest = Number(d.interest_amount || 0);
      if (interest > 0) {
        entries.push({
          id: d.id + "_interest",
          transaction_date: d.demand_date,
          consideration_date: d.demand_date,
          type: "Interest",
          narration: `Interest on overdue demands - Letter Ref: ${d.demand_number}`,
          debit: interest,
          credit: 0,
          is_posted: true
        });
      }

      // GST on interest
      const interestGst = Number(d.gst_on_interest || 0);
      if (interestGst > 0) {
        entries.push({
          id: d.id + "_interest_gst",
          transaction_date: d.demand_date,
          consideration_date: d.demand_date,
          type: "Tax",
          narration: `18% GST on Interest - Letter Ref: ${d.demand_number}`,
          debit: interestGst,
          credit: 0,
          is_posted: true
        });
      }
    });

    // Map receipts: Receipt + TDS
    receipts.forEach(r => {
      // Clear/received credit
      entries.push({
        id: r.id,
        transaction_date: r.receipt_date,
        consideration_date: r.consideration_date || r.receipt_date,
        type: "Receipt",
        narration: `Receipt - ${r.payment_mode || "NEFT"} ${r.receipt_number || ""} (${r.narration || "Payment"})`,
        debit: 0,
        credit: Number(r.amount || 0),
        is_posted: true
      });

      // TDS credit
      const tds = Number(r.tds_amount || 0);
      if (tds > 0) {
        entries.push({
          id: r.id + "_tds",
          transaction_date: r.receipt_date,
          consideration_date: r.consideration_date || r.receipt_date,
          type: "TDS",
          narration: `TDS Credit on Receipt ${r.receipt_number || ""}`,
          debit: 0,
          credit: tds,
          is_posted: true
        });
      }
    });

    // Map adjustments
    adjustments.forEach(l => {
      const isInterest = l.transaction_type === "LATE_FEE_INTEREST";
      const amount = Number(l.amount || 0);
      const isCredit = l.transaction_type.includes("WAIVER") || l.transaction_type.includes("CREDIT") || amount < 0;

      entries.push({
        id: l.id,
        transaction_date: l.reference_date,
        consideration_date: l.reference_date,
        type: isInterest ? "Interest" : "Adjustment",
        narration: l.description || l.transaction_type,
        debit: isCredit ? 0 : Math.abs(amount),
        credit: isCredit ? Math.abs(amount) : 0,
        is_posted: true
      });
    });

    // Sort chronologically
    entries.sort((a, b) => {
      const dateA = new Date(a.transaction_date).getTime();
      const dateB = new Date(b.transaction_date).getTime();
      if (dateA !== dateB) return dateA - dateB;
      
      const priorityA = a.debit > 0 ? 1 : 2;
      const priorityB = b.debit > 0 ? 1 : 2;
      return priorityA - priorityB;
    });

    // Calculate pro-rata running balance
    let running_balance = 0;
    const finalEntries = entries.map(e => {
      running_balance = running_balance + e.debit - e.credit;
      return {
        ...e,
        net_balance: running_balance
      };
    });

    res.json({
      customer_id: customerId,
      unit_id: unitId,
      as_of_date: asOfDate.toISOString().split("T")[0],
      total_outstanding_balance: running_balance,
      ledger_entries: finalEntries
    });
  } catch (error) {
    console.error("Error retrieving ledger:", error);
    res.status(500).json({ detail: error.message });
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

export default router;