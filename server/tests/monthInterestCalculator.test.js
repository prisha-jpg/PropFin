import assert from "node:assert";
import { calculateMonthlyDelayedInterest } from "../utils/monthInterestCalculator.js";

console.log("Starting Monthly Delayed Payment Interest Unit Tests...\n");

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ Passed: ${name}`);
  } catch (err) {
    console.error(`❌ Failed: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// 1. Edge Case: Fully Paid Milestones
runTest("Fully Paid Milestone", () => {
  const result = calculateMonthlyDelayedInterest({
    milestoneDemand: 50000,
    amountPaid: 50000,
    dueDate: "2026-01-10",
    calculationEndDate: "2026-02-10",
    annualInterestRate: 18.0
  });

  assert.deepStrictEqual(result, []);
});

// 2. Edge Case: Overpaid Milestone (No outstanding principal)
runTest("Overpaid Milestone", () => {
  const result = calculateMonthlyDelayedInterest({
    milestoneDemand: 50000,
    amountPaid: 55000,
    dueDate: "2026-01-10",
    calculationEndDate: "2026-02-10",
    annualInterestRate: 18.0
  });

  assert.deepStrictEqual(result, []);
});

// 3. Edge Case: Due Date in the Future
runTest("Due Date in the Future", () => {
  const result = calculateMonthlyDelayedInterest({
    milestoneDemand: 100000,
    amountPaid: 0,
    dueDate: "2026-06-15",
    calculationEndDate: "2026-05-15",
    annualInterestRate: 18.0
  });

  assert.deepStrictEqual(result, []);
});

// 4. Edge Case: Due Date Equals End Date
runTest("Due Date Equals End Date", () => {
  const result = calculateMonthlyDelayedInterest({
    milestoneDemand: 100000,
    amountPaid: 0,
    dueDate: "2026-05-15",
    calculationEndDate: "2026-05-15",
    annualInterestRate: 18.0
  });

  assert.deepStrictEqual(result, []);
});

// 5. Standard Case: Partial Start/End months and full intermediate month (Non-Leap Year 2026)
runTest("Standard Multi-Month Overdue Period (Non-Leap Year)", () => {
  const result = calculateMonthlyDelayedInterest({
    milestoneDemand: 500000,
    amountPaid: 0,
    dueDate: "2026-01-28",
    calculationEndDate: "2026-03-05",
    annualInterestRate: 18.0
  });

  assert.strictEqual(result.length, 3);

  // January 2026
  assert.strictEqual(result[0].monthYear, "01-2026");
  assert.strictEqual(result[0].daysOverdue, 3);
  assert.strictEqual(result[0].interestAmount, 739.73);
  assert.strictEqual(result[0].narration, "Delayed payment interest for the period of 29/01/2026 to 31/01/2026");

  // February 2026
  assert.strictEqual(result[1].monthYear, "02-2026");
  assert.strictEqual(result[1].daysOverdue, 28);
  assert.strictEqual(result[1].interestAmount, 6904.11);
  assert.strictEqual(result[1].narration, "Delayed payment interest for the period of 01/02/2026 to 28/02/2026");

  // March 2026
  assert.strictEqual(result[2].monthYear, "03-2026");
  assert.strictEqual(result[2].daysOverdue, 5);
  assert.strictEqual(result[2].interestAmount, 1232.88);
  assert.strictEqual(result[2].narration, "Delayed payment interest for the period of 01/03/2026 to 05/03/2026");
});

// 6. Leap Year Case: Dynamic leap year day check (2024 is a leap year, Feb has 29 days, total is 366)
runTest("Leap Year Calculation Adjustments (Leap Year 2024)", () => {
  const result = calculateMonthlyDelayedInterest({
    milestoneDemand: 500000,
    amountPaid: 0,
    dueDate: "2024-02-15",
    calculationEndDate: "2024-03-05",
    annualInterestRate: 18.0
  });

  assert.strictEqual(result.length, 2);

  // February 2024
  assert.strictEqual(result[0].monthYear, "02-2024");
  assert.strictEqual(result[0].daysOverdue, 14); // Feb 16 to Feb 29 inclusive
  assert.strictEqual(result[0].interestAmount, 3442.62); // (500000 * 18 * 14) / (366 * 100) = 3442.62
  assert.strictEqual(result[0].narration, "Delayed payment interest for the period of 16/02/2024 to 29/02/2024");

  // March 2024
  assert.strictEqual(result[1].monthYear, "03-2024");
  assert.strictEqual(result[1].daysOverdue, 5); // Mar 1 to Mar 5 inclusive
  assert.strictEqual(result[1].interestAmount, 1229.51); // (500000 * 18 * 5) / (366 * 100) = 1229.51
  assert.strictEqual(result[1].narration, "Delayed payment interest for the period of 01/03/2024 to 05/03/2024");
});

console.log("\n\u001b[32m🎉 All monthly interest calculation unit tests passed successfully!\u001b[0m");
