import assert from "node:assert";
import { calculateFPVAndInterest, calculateFpvWithFifoAllocation, calculateWorkbookFpvEngine } from "../utils/fpvCalculator.js";

console.log("Starting Backend FPV and Interest Calculator Unit Tests...\n");

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

// Test Case 1: Sum of allocation percentages must equal exactly 100
runTest("Validation Error when allocation percent sum is not 100", () => {
  assert.throws(
    () => {
      calculateFPVAndInterest({
        agreement_value: 1000000,
        booking_date: "2026-07-01",
        computation_date: "2026-07-07",
        interest_rate_pa: 10,
        discount_type: "Standard",
        milestones: [
          { description: "Milestone A", allocation_percent: 50, target_date: "2026-07-15", is_billed: true },
          { description: "Milestone B", allocation_percent: 49, target_date: "2026-07-20", is_billed: false }
        ]
      });
    },
    /Validation Error: The sum of allocation percentages must equal exactly 100/
  );
});

// Test Case 2: Standard FPV time-value calculation (Early Payment Discount / Late Penalty Interest)
// Agreement Value: 1,000,000
// Rate: 10%
// Comp Date: 2026-07-10
// Milestone 1 (Early): Allocation 40%, Target Date: 2026-07-20 (t = 10 days early)
//   M_value = 1,000,000 * 0.4 = 400,000
//   Adjustment = 400,000 * (10 / 100) * (10 / 365) = 1,095.89041... -> 1,095.89
//   PV = 400,000 - 1,095.89041... = 398,904.1095... -> 398,904.11
// Milestone 2 (Late): Allocation 60%, Target Date: 2026-07-05 (t = 5 days late)
//   M_value = 1,000,000 * 0.6 = 600,000
//   Adjustment = 600,000 * (10 / 100) * (5 / 365) = 821.9178... -> 821.92
//   PV = 600,000 + 821.9178... = 600,821.9178... -> 600,821.92
runTest("Standard calculation with early discount and late interest", () => {
  const result = calculateFPVAndInterest({
    agreement_value: 1000000,
    booking_date: "2026-07-01",
    computation_date: "2026-07-10",
    interest_rate_pa: 10,
    discount_type: "Standard",
    milestones: [
      { description: "Milestone A", allocation_percent: 40, target_date: "2026-07-20", is_billed: true },
      { description: "Milestone B", allocation_percent: 60, target_date: "2026-07-05", is_billed: false }
    ]
  });

  assert.strictEqual(result.itemized_breakdown.length, 2);
  const [mA, mB] = result.itemized_breakdown;

  // Milestone A (Early)
  assert.strictEqual(mA.m_value, "400000.00");
  assert.strictEqual(mA.days_diff, 10);
  assert.strictEqual(mA.type, "discount");
  assert.strictEqual(mA.adjustment, "1095.89");
  assert.strictEqual(mA.present_value, "398904.11");

  // Milestone B (Late)
  assert.strictEqual(mB.m_value, "600000.00");
  assert.strictEqual(mB.days_diff, -5);
  assert.strictEqual(mB.type, "penalty");
  assert.strictEqual(mB.adjustment, "821.92");
  assert.strictEqual(mB.present_value, "600821.92");

  // Totals verification
  // total_m_value = 1,000,000.00
  // total_present_value = 398,904.1095... + 600,821.9178... = 999,726.027... -> 999726.03
  // total_discount = 1095.89041... -> 1095.89
  // total_penalty = 821.9178... -> 821.92
  // net_adjustment = 999,726.03 - 1,000,000.00 = -273.97
  assert.strictEqual(result.totals.total_m_value, "1000000.00");
  assert.strictEqual(result.totals.total_present_value, "999726.03");
  assert.strictEqual(result.totals.total_discount, "1095.89");
  assert.strictEqual(result.totals.total_penalty, "821.92");
  assert.strictEqual(result.totals.net_adjustment, "-273.97");
});

// Test Case 3: Missing Target Date bypass
runTest("Graceful bypass of milestones with missing target_date", () => {
  const result = calculateFPVAndInterest({
    agreement_value: 1000000,
    booking_date: "2026-07-01",
    computation_date: "2026-07-10",
    interest_rate_pa: 10,
    discount_type: "Standard",
    milestones: [
      { description: "Milestone A (Static target date)", allocation_percent: 50, target_date: "2026-07-20", is_billed: true },
      { description: "Milestone B (No target date)", allocation_percent: 50, target_date: null, is_billed: false }
    ]
  });

  assert.strictEqual(result.itemized_breakdown.length, 2);
  const [mA, mB] = result.itemized_breakdown;

  // Milestone A (Regular early)
  assert.strictEqual(mA.m_value, "500000.00");
  assert.strictEqual(mA.days_diff, 10);
  assert.strictEqual(mA.type, "discount");
  assert.strictEqual(mA.adjustment, "1369.86"); // 500000 * 0.1 * 10 / 365 = 1369.863...
  assert.strictEqual(mA.present_value, "498630.14");

  // Milestone B (Bypassed)
  assert.strictEqual(mB.m_value, "500000.00");
  assert.strictEqual(mB.days_diff, 0);
  assert.strictEqual(mB.type, "bypass");
  assert.strictEqual(mB.adjustment, "0.00");
  assert.strictEqual(mB.present_value, "0.00"); // PV treated as zero

  // Totals verification
  // total_m_value = 1,000,000.00
  // total_present_value = 498,630.1369... + 0.00 = 498,630.1369... -> 498630.14
  // net_adjustment = 498630.14 - 1000000 = -501369.86
  assert.strictEqual(result.totals.total_m_value, "1000000.00");
  assert.strictEqual(result.totals.total_present_value, "498630.14");
  assert.strictEqual(result.totals.total_discount, "1369.86");
  assert.strictEqual(result.totals.total_penalty, "0.00");
  assert.strictEqual(result.totals.net_adjustment, "-501369.86");
});

runTest("Workbook-style FPV engine uses the Excel present-value formula", () => {
  const result = calculateWorkbookFpvEngine({
    agreementValue: 1000000,
    bookingDate: "2026-07-01",
    computationDate: "2026-07-10",
    discountRate: 10,
    milestones: [
      { id: "m1", description: "Booking Amount", allocation_percent: 100, due_date: "2026-07-20" }
    ],
    payments: [
      { id: "p1", reference: "Receipt 1", payment_date: "2026-07-10", amount: 100000 }
    ]
  });

  assert.strictEqual(result.allocations.length, 1);
  const allocation = result.allocations[0];
  assert.strictEqual(allocation.allocatedAmount, 100000);
  assert.strictEqual(allocation.days, 10);
  assert.strictEqual(allocation.discountRate, 0.002739726); // 10% * 10 / 365
  assert.ok(Math.abs(allocation.presentValue - 99726.775956) < 0.01);
  assert.ok(Math.abs(allocation.benefit - 273.224044) < 0.01);
  assert.strictEqual(result.summary.totalFutureValue, 100000);
  assert.ok(Math.abs(result.summary.totalPresentValue - 99726.78) < 0.01);
  assert.ok(Math.abs(result.summary.totalBenefit - 273.22) < 0.01);
  assert.strictEqual(result.summary.agreementDueNow, 0);
  assert.strictEqual(result.summary.agreementNotDue, 1000000);
  assert.strictEqual(result.summary.agreementReceivedTillDate, 100000);
  assert.strictEqual(result.summary.outstanding, 900000);
});

runTest("Workbook-style FPV engine uses interest rate when discount rate is omitted", () => {
  const result = calculateWorkbookFpvEngine({
    agreementValue: 1000000,
    computationDate: "2026-07-10",
    interestRate: 10,
    milestones: [
      { id: "m1", description: "Booking Amount", allocation_percent: 100, due_date: "2026-07-20" }
    ],
    payments: [
      { id: "p1", payment_date: "2026-07-10", amount: 100000 }
    ]
  });

  assert.strictEqual(result.summary.totalFutureValue, 100000);
  assert.ok(Math.abs(result.summary.totalPresentValue - 99726.78) < 0.01);
});

runTest("Workbook-style FPV engine exposes totals for the UI summary", () => {
  const result = calculateWorkbookFpvEngine({
    agreementValue: 1000000,
    computationDate: "2026-07-10",
    discountRate: 10,
    milestones: [
      { id: "m1", description: "Booking Amount", allocation_percent: 100, due_date: "2026-07-20" }
    ],
    payments: [
      { id: "p1", payment_date: "2026-07-10", amount: 100000 }
    ]
  });

  assert.strictEqual(result.totals.total_paid_amount, 100000);
  assert.strictEqual(result.totals.outstanding_amount, 900000);
  assert.strictEqual(result.totals.total_discount, 273.22);
  assert.strictEqual(result.summary.totalPayments, 100000);
});

runTest("Workbook-style FPV engine validates schedule and payment dates", () => {
  assert.throws(() => {
    calculateWorkbookFpvEngine({
      agreementValue: 1000000,
      computationDate: "2026-07-10",
      discountRate: 10,
      milestones: [
        { id: "m1", description: "Booking Amount", allocation_percent: 100, due_date: null }
      ],
      payments: [
        { id: "p1", payment_date: "2026-07-10", amount: 100000 }
      ]
    });
  }, /Validation Error: Milestone "Booking Amount" is missing due date/);
});

runTest("FIFO allocation applies payments to earliest outstanding milestones", () => {
  const result = calculateFpvWithFifoAllocation({
    agreement_value: 1000000,
    interest_rate: 10,
    computation_date: "2026-07-10",
    milestones: [
      { id: "m1", description: "Booking Amount", allocation_percent: 40, target_date: "2026-07-20", due_amount: 400000, source: "Customer" },
      { id: "m2", description: "15 Days", allocation_percent: 20, target_date: "2026-07-25", due_amount: 200000, source: "Customer" },
      { id: "m3", description: "Foundation", allocation_percent: 40, target_date: "2026-08-10", due_amount: 400000, source: "Presales" }
    ],
    payments: [
      { id: "p1", reference: "Payment 1", payment_date: "2026-07-15", amount: 500000 },
      { id: "p2", reference: "Payment 2", payment_date: "2026-07-23", amount: 100000 }
    ]
  });

  assert.strictEqual(result.allocations.length, 3);
  assert.strictEqual(result.allocations[0].allocated_amount, "400000.00");
  assert.strictEqual(result.allocations[1].allocated_amount, "100000.00");
  assert.strictEqual(result.allocations[2].allocated_amount, "100000.00");
  assert.strictEqual(result.totals.total_discount, "876.71");
  assert.strictEqual(result.totals.total_late_interest, "0.00");
  assert.strictEqual(result.totals.outstanding_amount, "400000.00");
});

console.log("\nAll Backend FPV tests passed successfully!");
