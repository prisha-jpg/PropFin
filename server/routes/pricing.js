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
// 4. JIT HISTORICAL INTEREST SYNCHRONIZATION LEDGER RETRIEVAL
// ==========================================
router.get("/ledger/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(customerId)) {
      return res.status(400).json({ success: false, message: "Invalid customer ID format" });
    }

    await prisma.$transaction(async (tx) => {
      const customers = await tx.$queryRaw`
        SELECT id FROM customers WHERE id = ${customerId}::uuid FOR UPDATE
      `;
      if (!customers || customers.length === 0) {
        throw new Error("Customer not found");
      }

      await syncHistoricalInterest(customerId, tx);
    });

    const ledger = await prisma.ledger.findMany({
      where: { customer_id: customerId },
      orderBy: { reference_date: "asc" }
    });

    res.json(ledger);
  } catch (error) {
    console.error("Ledger sync retrieval error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;