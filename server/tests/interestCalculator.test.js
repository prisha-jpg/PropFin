import assert from "node:assert";
import { calculateLatePaymentInterest } from "../utils/interestCalculator.js";

console.log("Starting Interest Calculator Unit Tests...\n");

function runTest(name, fn) {
  try {
    fn();
    console.log(`\u001b[32m✅ Passed: ${name}\u001b[0m`);
  } catch (error) {
    console.error(`\u001b[31m❌ Failed: ${name}\u001b[0m`);
    console.error(error);
    process.exit(1);
  }
}

// Test Case 1: Standard Verification
// Principal: 500,000
// Annual Rate: 18%
// Days Overdue (D): 20
// Expected Interest Output: ~4931.50
// Expected New Balance: 504,931.50
runTest("Standard Verification (500k, 18%, 20 days)", () => {
  // Grace period 15 days, demand letter 2026-06-01, actual due date 2026-06-16
  // Calculation date: 2026-07-06 (exactly 20 days after 2026-06-16)
  const result = calculateLatePaymentInterest(
    500000,
    18.0,
    "2026-06-01",
    15,
    "2026-07-06"
  );

  assert.strictEqual(result.daysOverdue, 20);
  assert.strictEqual(result.interest, 4931.51); // 500000 * 0.18 * 20 / 365 = 4931.5068 -> 4931.51
  assert.strictEqual(result.newBalance, 504931.51);
});

// Test Case 2: Payment/Calculation made within Grace Period
runTest("Calculation within Grace Period", () => {
  // Grace period 15 days, demand letter 2026-06-01, actual due date 2026-06-16
  // Calculation date: 2026-06-10 (before 2026-06-16)
  const result = calculateLatePaymentInterest(
    500000,
    18.0,
    "2026-06-01",
    15,
    "2026-06-10"
  );

  assert.strictEqual(result.daysOverdue, 0);
  assert.strictEqual(result.interest, 0);
  assert.strictEqual(result.newBalance, 500000);
});

// Test Case 3: Calculation exactly on the actual due date
runTest("Calculation exactly on the Actual Due Date", () => {
  // Grace period 15 days, demand letter 2026-06-01, actual due date 2026-06-16
  // Calculation date: 2026-06-16
  const result = calculateLatePaymentInterest(
    500000,
    18.0,
    "2026-06-01",
    15,
    "2026-06-16"
  );

  assert.strictEqual(result.daysOverdue, 0);
  assert.strictEqual(result.interest, 0);
  assert.strictEqual(result.newBalance, 500000);
});

// Test Case 4: Error Handling - Negative Principal
runTest("Error Handling - Negative Principal", () => {
  assert.throws(() => {
    calculateLatePaymentInterest(-100, 18, "2026-06-01", 15, "2026-07-06");
  }, /Outstanding principal cannot be negative/);
});

// Test Case 5: Error Handling - Negative Rate
runTest("Error Handling - Negative Penalty Rate", () => {
  assert.throws(() => {
    calculateLatePaymentInterest(500000, -5, "2026-06-01", 15, "2026-07-06");
  }, /Annual penalty rate cannot be negative/);
});

// Test Case 6: Error Handling - Negative Grace Days
runTest("Error Handling - Negative Grace Days", () => {
  assert.throws(() => {
    calculateLatePaymentInterest(500000, 18, "2026-06-01", -1, "2026-07-06");
  }, /Grace period days cannot be negative/);
});

// Test Case 7: Error Handling - Invalid Date
runTest("Error Handling - Invalid Date Format", () => {
  assert.throws(() => {
    calculateLatePaymentInterest(500000, 18, "invalid-date", 15, "2026-07-06");
  }, /Invalid demand letter date/);
});

console.log("\n\u001b[32m🎉 Core calculation unit tests passed successfully!\u001b[0m");

import { PrismaClient } from "@prisma/client";
import { postDelayedInterestToLedger } from "../utils/interestCalculator.js";

async function runDatabaseTests() {
  console.log("\nStarting Database Integration Tests...");
  const prisma = new PrismaClient();

  let customer = null;
  let project = null;
  let unit = null;
  let salesOrder = null;
  let originalBalance = 0;

  try {
    // 1. Fetch existing customer, project, unit
    customer = await prisma.customers.findFirst();
    project = await prisma.projects.findFirst();
    unit = await prisma.units.findFirst();

    if (!customer || !project || !unit) {
      console.log("⚠️ Skipping DB integration tests because seed data is missing.");
      return;
    }

    originalBalance = Number(customer.total_outstanding_balance || 0);

    // 2. Create transient Sales Order
    salesOrder = await prisma.sales_orders.create({
      data: {
        order_number: `TSO-${Date.now().toString(36).toUpperCase()}`,
        customer_id: customer.id,
        project_id: project.id,
        unit_id: unit.id,
        booking_date: new Date(),
        status: "open_order",
        basic_sale_value: 500000.0,
      }
    });

    console.log(`Created transient sales order: ${salesOrder.order_number}`);

    // TEST CASE A: Standard Ledger Posting & Balance Update
    // Principal: 500000, 18% APR, 20 days overdue
    const calcDate = "2026-07-06";
    const result = await postDelayedInterestToLedger(prisma, {
      salesOrderId: salesOrder.id,
      customerId: customer.id,
      outstandingPrincipal: 500000,
      annualPenaltyRate: 18.0,
      demandLetterDate: "2026-06-01",
      gracePeriodDays: 15,
      calculationDate: calcDate,
      isFinalSettlement: true
    });

    assert.strictEqual(result.status, "POSTED");
    assert.strictEqual(result.ledgerEntries.length, 2);
    assert.strictEqual(result.ledgerEntries[0].amount, 4073.42);
    assert.strictEqual(result.ledgerEntries[1].amount, 1745.75);
    assert.strictEqual(Math.round(result.totalOutstandingBalance * 100) / 100, Math.round((originalBalance + 5819.17) * 100) / 100);
    console.log("✅ Passed: Standard Ledger Posting & Balance Update");

    // TEST CASE B: Idempotency Check (Running twice on the same calculation date)
    const resultDuplicate = await postDelayedInterestToLedger(prisma, {
      salesOrderId: salesOrder.id,
      customerId: customer.id,
      outstandingPrincipal: 500000,
      annualPenaltyRate: 18.0,
      demandLetterDate: "2026-06-01",
      gracePeriodDays: 15,
      calculationDate: calcDate,
      isFinalSettlement: true
    });

    assert.strictEqual(resultDuplicate.status, "SKIPPED_ALREADY_POSTED");
    assert.strictEqual(Math.round(resultDuplicate.totalOutstandingBalance * 100) / 100, Math.round((originalBalance + 5819.17) * 100) / 100);
    console.log("✅ Passed: Idempotency Check (Duplicate calculation skipped)");

    // TEST CASE C: Transactional Integrity / Rollback on Error
    let errorOccurred = false;
    try {
      await prisma.$transaction(async (tx) => {
        // Increment customer balance
        await tx.customers.update({
          where: { id: customer.id },
          data: { total_outstanding_balance: { increment: 10000 } }
        });
        
        // This insert will fail because transaction_type is null
        await tx.ledger.create({
          data: {
            sales_order_id: salesOrder.id,
            customer_id: customer.id,
            transaction_type: null,
            amount: 100,
            reference_date: new Date(),
            description: "Invalid Entry",
          }
        });
      });
    } catch (err) {
      errorOccurred = true;
    }

    assert.strictEqual(errorOccurred, true);
    // Verify customer balance was NOT modified (rolled back to post-calc state)
    const currentCustomer = await prisma.customers.findUnique({ where: { id: customer.id } });
    assert.strictEqual(Number(currentCustomer.total_outstanding_balance), originalBalance + 5819.17);
    console.log("✅ Passed: Transactional Integrity / Rollback on Failure");

    // TEST CASE D: Month-End Verification (Skipping non-month-end months unless isFinalSettlement is true)
    console.log("TEST CASE D: Starting Month-End Verification...");
    const orderNo = `TSO-${Date.now().toString(36).toUpperCase()}-ME`;
    const salesOrderME = await prisma.sales_orders.create({
      data: {
        order_number: orderNo,
        customer_id: customer.id,
        project_id: project.id,
        unit_id: unit.id,
        booking_date: new Date(),
        status: "open_order",
        basic_sale_value: 500000.0,
      }
    });

    const resultMonthEndSkip = await postDelayedInterestToLedger(prisma, {
      salesOrderId: salesOrderME.id,
      customerId: customer.id,
      outstandingPrincipal: 500000,
      annualPenaltyRate: 18.0,
      demandLetterDate: "2026-06-01",
      gracePeriodDays: 15,
      calculationDate: "2026-07-06",
      isFinalSettlement: false // strict month end only
    });

    assert.strictEqual(resultMonthEndSkip.status, "POSTED");
    assert.strictEqual(resultMonthEndSkip.ledgerEntries.length, 1); // July 1 - July 6 is skipped because it is not month end!
    console.log("✅ Passed: Month-End Verification (Non-month-end month skipped)");

    // Clean up salesOrderME
    await prisma.ledger.deleteMany({ where: { sales_order_id: salesOrderME.id } });
    await prisma.sales_orders.delete({ where: { id: salesOrderME.id } });

  } finally {
    // 3. Clean up
    console.log("Cleaning up database test records...");
    if (salesOrder) {
      try {
        await prisma.ledger.deleteMany({ where: { sales_order_id: salesOrder.id } });
        await prisma.sales_orders.delete({ where: { id: salesOrder.id } });
      } catch (err) {
        console.error("Cleanup error (sales order):", err.message);
      }
    }
    if (customer) {
      try {
        await prisma.customers.update({
          where: { id: customer.id },
          data: { total_outstanding_balance: originalBalance }
        });
      } catch (err) {
        console.error("Cleanup error (customer):", err.message);
      }
    }
    await prisma.$disconnect();
    console.log("Cleaned up successfully.");
  }
}

runDatabaseTests().then(() => {
  console.log("\n\u001b[32m🎉 All unit and integration tests passed successfully!\u001b[0m");
}).catch(err => {
  console.error("❌ DB integration tests failed:", err);
  process.exit(1);
});
