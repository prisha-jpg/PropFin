import express from "express";
import { PrismaClient } from "@prisma/client";

const router = express.Router();
const prisma = new PrismaClient();

// ==========================================
// 1. UNIT PRICING ENGINE
// ==========================================
router.post("/calculate-unit", async (req, res) => {
  try {
    const { carpet_area, sba, rate_per_sqft, maintenance_deposit = 300000, caic_charges = 0 } = req.body;

    // Based on the PL.xlsx logic:
    // Basic Sale Value (BSV) = SBA * Rate per sqft (Note: PL.xlsx sometimes adds PLC or parking, we'll keep it standard here)
    const basic_sale_value = Number(sba) * Number(rate_per_sqft);
    
    // GST is 5% on Basic Sale Value
    const gst_amount = basic_sale_value * 0.05;
    
    // Total Value Calculation
    const total_value = basic_sale_value + gst_amount + Number(maintenance_deposit) + Number(caic_charges);

    res.json({
      success: true,
      data: {
        basic_sale_value: basic_sale_value.toFixed(2),
        gst_amount: gst_amount.toFixed(2),
        maintenance_deposit: Number(maintenance_deposit).toFixed(2),
        caic_charges: Number(caic_charges).toFixed(2),
        total_sale_value: total_value.toFixed(2)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
    const { sales_order_id, annual_interest_rate = 0.18, calculation_date = new Date() } = req.body;

    if (!sales_order_id) {
      return res.status(400).json({ success: false, message: "Missing sales_order_id" });
    }

    // 1. Fetch all Schedules and Receipts for this Order
    const schedules = await prisma.payment_schedules.findMany({
      where: { sales_order_id },
      orderBy: { original_due_date: 'asc' }
    });

    const receipts = await prisma.customer_receipts.findMany({
      where: { sales_order_id, status: 'cleared' },
      orderBy: { consideration_date: 'asc' }
    });

    // 2. The Engine: Calculate Overdue Interest (FIFO Method)
    let totalInterest = 0;
    const calcDate = new Date(calculation_date);
    const breakdown = [];

    // Helper to calculate days between dates
    const getDaysDiff = (start, end) => {
      const diffTime = Math.abs(end - start);
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };

    // Calculate per milestone
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

      const daysOverdue = getDaysDiff(dueDate, endDate);
      const principal = Number(schedule.due_amount);
      
      // Math: (Principal * Rate * Days) / 365
      const interestAmount = (principal * Number(annual_interest_rate) * daysOverdue) / 365;
      const gstOnInterest = interestAmount * 0.18; // 18% GST on Interest

      totalInterest += (interestAmount + gstOnInterest);

      breakdown.push({
        milestone: schedule.milestone_name,
        principal: principal.toFixed(2),
        due_date: dueDate.toISOString().split('T')[0],
        paid_date: matchedReceipt ? endDate.toISOString().split('T')[0] : 'Unpaid',
        days_overdue: daysOverdue,
        interest_amount: interestAmount.toFixed(2),
        gst_on_interest: gstOnInterest.toFixed(2),
        total_penalty: (interestAmount + gstOnInterest).toFixed(2)
      });
    }

    res.json({
      success: true,
      data: {
        total_interest_due: totalInterest.toFixed(2),
        annual_rate: `${(annual_interest_rate * 100)}%`,
        calculation_date: calcDate.toISOString().split('T')[0],
        breakdown: breakdown
      }
    });

  } catch (error) {
    console.error("Interest calculation error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});
export default router;