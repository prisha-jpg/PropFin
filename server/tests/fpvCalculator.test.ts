import assert from "node:assert";
import { calculateDynamicFPV, hydrateCustomerSchedule } from "../../src/utils/fpv";

console.log("Starting Dynamic FPV Calculator Unit Tests...\n");

function runTest(name: string, fn: () => void) {
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
// Agreement Value: 35887703
// Discount Rate: 10.35%
// Computation Date: 2025-09-10
// Due Date: 2025-10-10 (exactly 30 days)
// Percentage: 10%
runTest("Standard Verification (10% slab, 30 days early)", () => {
  const result = calculateDynamicFPV({
    agreementValue: 35887703,
    computationDate: "2025-09-10",
    discountRate: 10.35,
    dueDetails: [
      { slabName: "Structure Completion", dueDate: "2025-10-10", percentage: 10 }
    ]
  });

  const row = result.processedSchedule[0];
  
  // Verify future value (FV)
  // FV = 35887703 * 0.1 = 3588770.3 -> rounded to 3588770
  assert.strictEqual(row.amount, 3588770);
  
  // Verify days (n = 30)
  assert.strictEqual(row.days, 30);
  
  // Verify discount factor
  // factor = (10.35 / 100) * (30 / 365) = 0.008506849315068493
  const expectedFactor = (10.35 / 100) * (30 / 365);
  assert.ok(Math.abs(row.discountFactor - expectedFactor) < 1e-10);
  
  // Verify present value (PV)
  // PV = 3588770.3 / (1 + factor) = 3558498.71... -> rounded to 3558499
  assert.strictEqual(row.presentValue, 3558499);
  
  // Verify benefit amount
  // Benefit = FV - PV = 3588770.3 - 3558498.71... = 30271.58... -> rounded to 30272
  assert.strictEqual(row.benefitAmount, 30272);
  
  // Verify totals
  assert.strictEqual(result.totals.totalFV, 3588770);
  assert.strictEqual(result.totals.totalPV, 3558499);
  assert.strictEqual(result.totals.totalBenefit, 30272);
});

// Test Case 2: Past Due Date Edge Case
runTest("Past Due Date Edge Case", () => {
  const result = calculateDynamicFPV({
    agreementValue: 1000000,
    computationDate: "2025-09-10",
    discountRate: 10,
    dueDetails: [
      { slabName: "Past Slab", dueDate: "2025-09-05", percentage: 50 }
    ]
  });

  const row = result.processedSchedule[0];
  
  // Verify FV: 1,000,000 * 0.5 = 500,000
  assert.strictEqual(row.amount, 500000);
  
  // Days should be 0 because due date (Sept 5) is in the past compared to comp date (Sept 10)
  assert.strictEqual(row.days, 0);
  assert.strictEqual(row.discountFactor, 0);
  assert.strictEqual(row.presentValue, 500000);
  assert.strictEqual(row.benefitAmount, 0);
  
  // Totals
  assert.strictEqual(result.totals.totalFV, 500000);
  assert.strictEqual(result.totals.totalPV, 500000);
  assert.strictEqual(result.totals.totalBenefit, 0);
});

// Test Case 3: Due Date exactly equal to Computation Date
runTest("Due Date equals Computation Date Case", () => {
  const result = calculateDynamicFPV({
    agreementValue: 1000000,
    computationDate: "2025-09-10",
    discountRate: 10,
    dueDetails: [
      { slabName: "Current Slab", dueDate: "2025-09-10", percentage: 50 }
    ]
  });

  const row = result.processedSchedule[0];
  
  assert.strictEqual(row.days, 0);
  assert.strictEqual(row.discountFactor, 0);
  assert.strictEqual(row.presentValue, 500000);
  assert.strictEqual(row.benefitAmount, 0);
});

// Test Case 4: Multiple rows with mixed future and past dates
runTest("Multiple rows with mixed future and past dates", () => {
  const result = calculateDynamicFPV({
    agreementValue: 10000000, // 10 Cr / 10M
    computationDate: "2025-09-10",
    discountRate: 12.0,
    dueDetails: [
      { slabName: "Slab 1 (Past)", dueDate: "2025-09-01", percentage: 20 },      // FV = 2,000,000, days = 0
      { slabName: "Slab 2 (Future 1)", dueDate: "2025-09-20", percentage: 30 },  // FV = 3,000,000, days = 10
      { slabName: "Slab 3 (Future 2)", dueDate: "2025-10-10", percentage: 50 }   // FV = 5,000,000, days = 30
    ]
  });

  assert.strictEqual(result.processedSchedule.length, 3);
  
  const [row1, row2, row3] = result.processedSchedule;
  
  // Row 1 assertions
  assert.strictEqual(row1.amount, 2000000);
  assert.strictEqual(row1.days, 0);
  assert.strictEqual(row1.presentValue, 2000000);
  assert.strictEqual(row1.benefitAmount, 0);
  
  // Row 2 assertions (10 days)
  assert.strictEqual(row2.amount, 3000000);
  assert.strictEqual(row2.days, 10);
  // factor = 0.12 * (10 / 365) = 0.00328767123
  // PV = 3,000,000 / 1.00328767123 = 2990169.39... -> 2990169
  // Benefit = 3,000,000 - 2990169.39... = 9830.6 -> 9831
  assert.strictEqual(row2.presentValue, 2990169);
  assert.strictEqual(row2.benefitAmount, 9831);
  
  // Row 3 assertions (30 days)
  assert.strictEqual(row3.amount, 5000000);
  assert.strictEqual(row3.days, 30);
  // factor = 0.12 * (30 / 365) = 0.00986301369
  // PV = 5,000,000 / 1.00986301369 = 4951166.57... -> 4951167
  // Benefit = 5,000,000 - 4951166.57... = 48833.42... -> 48833
  assert.strictEqual(row3.presentValue, 4951167);
  assert.strictEqual(row3.benefitAmount, 48833);
  
  // Totals verification
  // totalFV = 2000000 + 3000000 + 5000000 = 10000000
  // totalPV = 2000000 + 2990169 + 4951167 = 9941336
  // totalBenefit = 0 + 9831 + 48833 = 58664
  assert.strictEqual(result.totals.totalFV, 10000000);
  assert.strictEqual(result.totals.totalPV, 9941336);
  assert.strictEqual(result.totals.totalBenefit, 58664);
});

// Test Case 5: Input validation & Date object inputs
runTest("Input validation & Date object inputs", () => {
  const result = calculateDynamicFPV({
    agreementValue: 1000000,
    computationDate: new Date(2025, 8, 10), // Sept 10
    discountRate: 10,
    dueDetails: [
      { slabName: "Date Object Slab", dueDate: new Date(2025, 9, 10), percentage: 100 } // Oct 10
    ]
  });

  const row = result.processedSchedule[0];
  // In javascript, new Date(2025, 8, 10) is September 10, new Date(2025, 9, 10) is October 10.
  // Days difference:
  // Date.UTC(2025, 9, 10) - Date.UTC(2025, 8, 10) = 30 days.
  assert.strictEqual(row.days, 30);
});

// Test Case 6: hydrateCustomerSchedule verification
runTest("hydrateCustomerSchedule verification", () => {
  const master = [
    { name: "Booking Amount", percent: 10, expectedDate: "" },
    { name: "Payable within 15 Days from Agreement Date", percent: 10, expectedDate: "" },
    { name: "On Completion of Foundation Works", percent: 10, expectedDate: "2026-10-30" },
  ];

  const bookingDate = "2026-07-15";
  const agreementDate = "2026-07-20";

  const hydrated = hydrateCustomerSchedule(master, bookingDate, agreementDate);

  // Row 1: Booking Amount -> Booking date (2026-07-15)
  assert.strictEqual(hydrated[0].dueDate, "2026-07-15");

  // Row 2: Payable within 15 Days from Agreement Date -> Agreement date (2026-07-20) + 15 days = 2026-08-04
  assert.strictEqual(hydrated[1].dueDate, "2026-08-04");

  // Row 3: Foundation -> Keeps static target date "2026-10-30"
  assert.strictEqual(hydrated[2].dueDate, "2026-10-30");
});

console.log("\nAll FPV tests passed successfully!");
