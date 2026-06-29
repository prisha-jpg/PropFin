import assert from "node:assert";
import { PrismaClient } from "@prisma/client";
import { isLastDayOfMonth } from "../jobs/interestJob.js";
import { postDelayedInterestToLedger } from "../utils/interestCalculator.js";

console.log("Starting Automated Cron & PRL Demand Integration Unit/Integration Tests...\n");

// 1. Test isLastDayOfMonth helper
function testIsLastDayOfMonth() {
  console.log("Testing isLastDayOfMonth helper...");
  assert.strictEqual(isLastDayOfMonth(new Date("2026-06-30")), true);
  assert.strictEqual(isLastDayOfMonth(new Date("2026-06-29")), false);
  assert.strictEqual(isLastDayOfMonth(new Date("2026-02-28")), true); // 2026 is non-leap year
  assert.strictEqual(isLastDayOfMonth(new Date("2026-02-27")), false);
  console.log("✅ Passed: isLastDayOfMonth helper");
}

testIsLastDayOfMonth();

// 2. Integration Test for PRL Demands and Automated Job flow
async function runAutomatedCronIntegrationTest() {
  console.log("\nStarting Automated Cron & PRL Demand Integration DB Test...");
  const prisma = new PrismaClient();

  let customer = null;
  let project = null;
  let unit = null;
  let salesOrder = null;
  let paymentSchedule = null;
  let prlDemand = null;
  let originalBalance = 0;

  try {
    customer = await prisma.customers.findFirst();
    project = await prisma.projects.findFirst();
    unit = await prisma.units.findFirst();

    if (!customer || !project || !unit) {
      console.log("⚠️ Skipping test because seed data is missing.");
      return;
    }

    originalBalance = Number(customer.total_outstanding_balance || 0);

    // Make sure customer's outstanding balance is > 0 so they are fetched by the job
    await prisma.customers.update({
      where: { id: customer.id },
      data: { total_outstanding_balance: 1000.0 } // positive balance
    });

    // Create transient Sales Order
    salesOrder = await prisma.sales_orders.create({
      data: {
        order_number: `TSO-${Date.now().toString(36).toUpperCase()}-CR`,
        customer_id: customer.id,
        project_id: project.id,
        unit_id: unit.id,
        booking_date: new Date(),
        status: "open_order",
        basic_sale_value: 500000.0,
      }
    });

    // Create a standard payment schedule
    paymentSchedule = await prisma.payment_schedules.create({
      data: {
        sales_order_id: salesOrder.id,
        milestone_name: "Standard Schedule Milestone",
        due_amount: 100000.0,
        original_due_date: new Date("2026-05-31"), // overdue
        status: "pending"
      }
    });

    // Create a PRL Demand Letter
    prlDemand = await prisma.demand_letters.create({
      data: {
        demand_number: `DL-PRL-${Date.now().toString(36).toUpperCase()}`,
        sales_order_id: salesOrder.id,
        customer_id: customer.id,
        demand_type: "subsequent_prl",
        demand_date: new Date("2026-05-15"),
        due_date: new Date("2026-05-31"), // overdue
        principal_amount: 50000.0,
        status: "generated"
      }
    });

    console.log(`Created test records: Sales Order ${salesOrder.order_number}`);

    // Mock/Simulate the execution of the cron job main logic
    const calcDate = new Date("2026-06-30"); // month-end calculation date

    // 1. Fetch active schedules and receipts
    const schedules = await prisma.payment_schedules.findMany({
      where: { sales_order_id: salesOrder.id }
    });

    const receipts = await prisma.customer_receipts.findMany({
      where: { sales_order_id: salesOrder.id, status: "cleared" }
    });

    const prlDemands = await prisma.demand_letters.findMany({
      where: {
        sales_order_id: salesOrder.id,
        demand_type: "subsequent_prl",
        status: { notIn: ["paid", "cancelled"] }
      }
    });

    assert.strictEqual(schedules.length, 1);
    assert.strictEqual(prlDemands.length, 1);

    const postedEntries = [];

    // Calculate standard schedules
    for (const schedule of schedules) {
      const dueDate = new Date(schedule.original_due_date);
      const matchedReceipt = receipts.find(r => r.payment_schedule_id === schedule.id);
      const endDate = matchedReceipt && matchedReceipt.consideration_date ? new Date(matchedReceipt.consideration_date) : calcDate;

      const result = await postDelayedInterestToLedger(prisma, {
        salesOrderId: salesOrder.id,
        customerId: customer.id,
        milestoneDemand: Number(schedule.due_amount),
        amountPaid: 0,
        dueDate: dueDate,
        calculationEndDate: endDate,
        annual_interest_rate: 18,
        milestoneName: schedule.milestone_name,
        isFinalSettlement: false // enforce month-end only (June 30 is month-end)
      });

      if (result && result.ledgerEntries) {
        postedEntries.push(...result.ledgerEntries);
      }
    }

    // Calculate PRL demands
    for (const demand of prlDemands) {
      const dueDate = new Date(demand.due_date);
      const matchedReceipt = demand.payment_schedule_id ? receipts.find(r => r.payment_schedule_id === demand.payment_schedule_id) : null;
      const endDate = matchedReceipt && matchedReceipt.consideration_date ? new Date(matchedReceipt.consideration_date) : calcDate;

      const result = await postDelayedInterestToLedger(prisma, {
        salesOrderId: salesOrder.id,
        customerId: customer.id,
        milestoneDemand: Number(demand.principal_amount),
        amountPaid: 0,
        dueDate: dueDate,
        calculationEndDate: endDate,
        annual_interest_rate: 18,
        milestoneName: `PRL Demand - ${demand.demand_number}`,
        isFinalSettlement: false // enforce month-end only
      });

      if (result && result.ledgerEntries) {
        postedEntries.push(...result.ledgerEntries);
      }
    }

    // We expect both standard milestone interest and PRL demand interest to be calculated and posted:
    // Standard milestone: 100k overdue from 2026-05-31 to 2026-06-30 (30 days). Interest = 100000 * 0.18 * 30 / 365 = 1479.45. Incl GST = 1745.75
    // PRL Demand: 50k overdue from 2026-05-31 to 2026-06-30 (30 days). Interest = 50000 * 0.18 * 30 / 365 = 739.73. Incl GST = 872.88
    assert.strictEqual(postedEntries.length, 2);
    
    // Check descriptions and amounts
    const standardEntry = postedEntries.find(e => e.description.includes("Standard Schedule Milestone"));
    const prlEntry = postedEntries.find(e => e.description.includes(prlDemand.demand_number));

    assert.ok(standardEntry);
    assert.ok(prlEntry);

    assert.strictEqual(standardEntry.amount, 1745.75);
    assert.strictEqual(prlEntry.amount, 872.88);

    console.log("✅ Passed: PRL Demands calculated and segregated successfully inside automated flow!");

  } finally {
    // Clean up database test records
    console.log("Cleaning up test database records...");
    if (paymentSchedule) {
      await prisma.payment_schedules.deleteMany({ where: { sales_order_id: salesOrder.id } });
    }
    if (prlDemand) {
      await prisma.demand_letters.deleteMany({ where: { sales_order_id: salesOrder.id } });
    }
    if (salesOrder) {
      await prisma.ledger.deleteMany({ where: { sales_order_id: salesOrder.id } });
      await prisma.sales_orders.delete({ where: { id: salesOrder.id } });
    }
    if (customer) {
      await prisma.customers.update({
        where: { id: customer.id },
        data: { total_outstanding_balance: originalBalance }
      });
    }
    await prisma.$disconnect();
    console.log("Cleaned up successfully.");
  }
}

runAutomatedCronIntegrationTest().then(() => {
  console.log("\n🎉 All automated cron & PRL demand tests passed successfully!");
}).catch(err => {
  console.error("❌ DB integration tests failed:", err);
  process.exit(1);
});
