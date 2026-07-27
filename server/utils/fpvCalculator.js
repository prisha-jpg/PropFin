import { Prisma } from "@prisma/client";

const Decimal = Prisma.Decimal;

function toDecimal(value) {
  if (value instanceof Decimal) return value;
  if (typeof value === "number" && Number.isFinite(value)) return new Decimal(value);
  return new Decimal(value ?? 0);
}

function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDecimal(value) {
  return value.toFixed(2);
}

function toNumber(value) {
  return Number(value ?? 0);
}

function normalizePercentage(rawPercent) {
  const numeric = Number(rawPercent ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  return numeric > 0 && numeric <= 1 ? numeric * 100 : numeric;
}

function getDayDifference(dueDate, paymentDate) {
  const due = parseDateValue(dueDate);
  const payment = parseDateValue(paymentDate);
  if (!due || !payment) return 0;
  const utcDue = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const utcPayment = Date.UTC(payment.getFullYear(), payment.getMonth(), payment.getDate());
  return Math.round((utcDue - utcPayment) / (1000 * 60 * 60 * 24));
}

function toDisplayNumber(value, decimals = 2) {
  const decimalValue = value instanceof Decimal ? value : toDecimal(value);
  return Number(decimalValue.toFixed(decimals));
}

function formatDateValue(value) {
  const dateValue = parseDateValue(value);
  if (!dateValue) return null;
  const year = dateValue.getFullYear();
  const month = `${dateValue.getMonth() + 1}`.padStart(2, "0");
  const day = `${dateValue.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * @typedef {Object} Milestone
 * @property {string} description - Description of the construction stage / milestone.
 * @property {number|string|Decimal} allocation_percent - Percentage allocation (must sum to exactly 100).
 * @property {string|Date|null} [target_date] - Expected completion date, or null/optional if unmet.
 * @property {boolean} is_billed - Whether this milestone has been billed.
 */

/**
 * @typedef {("Payment Before Due Date" | "Standard")} DiscountType
 */

/**
 * @typedef {Object} FPVCalculationRequest
 * @property {number|string|Decimal} agreement_value - The total cost (e.g. 34847890).
 * @property {string|Date} booking_date - Booking date.
 * @property {string|Date} computation_date - Date the customer is making upfront payment / discount is computed.
 * @property {number|string|Decimal} interest_rate_pa - Annual rate (percentage per annum, e.g. 10.35).
 * @property {DiscountType} discount_type - The discount type option.
 * @property {Milestone[]} milestones - The list of milestone objects.
 */

/**
 * @typedef {Object} ProcessedMilestone
 * @property {string} description
 * @property {string} allocation_percent - allocation percent string rounded to 2 decimal places
 * @property {string|null} target_date - target date ISO string or null
 * @property {boolean} is_billed
 * @property {string} m_value - Absolute monetary value of the milestone
 * @property {number} days_diff - The calendar day delta (target_date - computation_date)
 * @property {string} adjustment - The simple interest/discount adjustment amount
 * @property {string} present_value - Adjusted milestone value (present value)
 * @property {("discount" | "penalty" | "none" | "bypass")} type - The type of adjustment applied
 */

/**
 * @typedef {Object} FPVCalculationResponse
 * @property {ProcessedMilestone[]} itemized_breakdown - Itemized calculation for each milestone
 * @property {Object} totals
 * @property {string} totals.total_m_value - Sum of all milestone monetary values
 * @property {string} totals.total_present_value - Sum of all present values
 * @property {string} totals.total_discount - Total discount applied
 * @property {string} totals.total_penalty - Total penalties/interest applied
 * @property {string} totals.net_adjustment - Net adjustment (present value - absolute milestone value)
 */

/**
 * Performs dynamic Present Value (FPV) and Interest calculations for a payment schedule.
 * 
 * @param {FPVCalculationRequest} request - The FPV request body parameters.
 * @returns {FPVCalculationResponse} The itemized breakdown and calculated sums.
 */
export function calculateFPVAndInterest(request) {
  const {
    agreement_value,
    computation_date,
    interest_rate_pa,
    milestones
  } = request;

  // Input sanitization / validation
  if (!agreement_value || isNaN(Number(agreement_value))) {
    throw new Error("Validation Error: agreement_value must be a valid number");
  }
  if (!computation_date) {
    throw new Error("Validation Error: computation_date is required");
  }
  if (!interest_rate_pa || isNaN(Number(interest_rate_pa))) {
    throw new Error("Validation Error: interest_rate_pa must be a valid number");
  }
  if (!Array.isArray(milestones) || milestones.length === 0) {
    throw new Error("Validation Error: milestones must be a non-empty array");
  }

  const decAgreementValue = new Decimal(agreement_value);
  const decRate = new Decimal(interest_rate_pa);
  const compDate = new Date(computation_date);
  if (isNaN(compDate.getTime())) {
    throw new Error(`Validation Error: Invalid computation_date "${computation_date}"`);
  }

  // 1. Validate that the sum of allocation percentages across all milestones equals exactly 100.
  let totalAllocation = new Decimal(0);
  for (const m of milestones) {
    if (m.allocation_percent === undefined || m.allocation_percent === null) {
      throw new Error(`Validation Error: Milestone "${m.description}" is missing allocation_percent`);
    }
    totalAllocation = totalAllocation.add(new Decimal(m.allocation_percent));
  }
  
  if (!totalAllocation.equals(new Decimal(100))) {
    throw new Error(`Validation Error: The sum of allocation percentages must equal exactly 100. Got ${totalAllocation.toString()}%`);
  }

  // 2. Iterate and Apportion
  let rawTotalMValue = new Decimal(0);
  let rawTotalPresentValue = new Decimal(0);
  let rawTotalDiscount = new Decimal(0);
  let rawTotalPenalty = new Decimal(0);

  const itemized_breakdown = milestones.map((m, index) => {
    const mPercent = new Decimal(m.allocation_percent);
    
    // Milestone Apportionment
    // M_value = Agreement_Value * (Allocation_Percent / 100)
    const mValue = decAgreementValue.mul(mPercent).div(new Decimal(100));
    rawTotalMValue = rawTotalMValue.add(mValue);

    // Handle missing dates gracefully
    if (!m.target_date) {
      const zero = new Decimal(0);
      return {
        description: m.description || `Milestone ${index + 1}`,
        allocation_percent: mPercent.toFixed(2),
        target_date: null,
        is_billed: !!m.is_billed,
        m_value: mValue.toFixed(2),
        days_diff: 0,
        adjustment: zero.toFixed(2),
        present_value: zero.toFixed(2),
        type: "bypass"
      };
    }

    const targetDate = new Date(m.target_date);
    if (isNaN(targetDate.getTime())) {
      throw new Error(`Validation Error: Milestone "${m.description}" has an invalid target_date "${m.target_date}"`);
    }

    // Time Delta Calculation
    // Exact difference in calendar days (targetDate - computationDate)
    const utcComp = Date.UTC(compDate.getFullYear(), compDate.getMonth(), compDate.getDate());
    const utcTarget = Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const daysDiff = Math.round((utcTarget - utcComp) / (1000 * 60 * 60 * 24));

    // Simple Interest/Discount Calculation
    // Adjustment = M_value * (r / 100) * (t / 365)
    const t = Math.abs(daysDiff);
    const tDec = new Decimal(t);
    const denominator = new Decimal(365);
    const adjustment = mValue.mul(decRate).div(new Decimal(100)).mul(tDec).div(denominator);

    let presentValue = new Decimal(0);
    let type = "none";

    if (daysDiff > 0) {
      // computation_date < target_date: early (discount applies)
      presentValue = mValue.sub(adjustment);
      rawTotalDiscount = rawTotalDiscount.add(adjustment);
      type = "discount";
    } else if (daysDiff < 0) {
      // computation_date > target_date: late (interest applies)
      presentValue = mValue.add(adjustment);
      rawTotalPenalty = rawTotalPenalty.add(adjustment);
      type = "penalty";
    } else {
      presentValue = mValue;
      type = "none";
    }

    rawTotalPresentValue = rawTotalPresentValue.add(presentValue);

    return {
      description: m.description || `Milestone ${index + 1}`,
      allocation_percent: mPercent.toFixed(2),
      target_date: targetDate.toISOString().split("T")[0],
      is_billed: !!m.is_billed,
      m_value: mValue.toFixed(2),
      days_diff: daysDiff,
      adjustment: adjustment.toFixed(2),
      present_value: presentValue.toFixed(2),
      type
    };
  });

  return {
    itemized_breakdown,
    totals: {
      total_m_value: rawTotalMValue.toFixed(2),
      total_present_value: rawTotalPresentValue.toFixed(2),
      total_discount: rawTotalDiscount.toFixed(2),
      total_penalty: rawTotalPenalty.toFixed(2),
      net_adjustment: rawTotalPresentValue.sub(rawTotalMValue).toFixed(2)
    }
  };
}

export function calculateWorkbookFpvEngine(payload = {}) {
  const {
    agreementValue,
    agreement_value,
    bookingDate,
    booking_date,
    computationDate,
    computation_date,
    discountRate,
    discount_rate,
    interestRate,
    interest_rate,
    milestones = [],
    payments = [],
    reconciliation = {}
  } = payload;

  const resolvedAgreementValue = toNumber(agreementValue ?? agreement_value);
  const resolvedDiscountRate = toNumber(discountRate ?? discount_rate ?? interestRate ?? interest_rate);
  const resolvedComputationDate = computationDate ?? computation_date;
  const resolvedBookingDate = bookingDate ?? booking_date;
  const resolvedInterestRate = toNumber(interestRate ?? interest_rate);

  const validationErrors = [];

  if (!Number.isFinite(resolvedAgreementValue) || resolvedAgreementValue <= 0) {
    validationErrors.push("Validation Error: agreement value must be a positive number");
  }
  if (!resolvedComputationDate) {
    validationErrors.push("Validation Error: computation date is required");
  }
  if (!Number.isFinite(resolvedDiscountRate) || resolvedDiscountRate === 0) {
    validationErrors.push("Validation Error: discount rate must be provided");
  }
  if (!Array.isArray(milestones) || milestones.length === 0) {
    validationErrors.push("Validation Error: milestones must be a non-empty array");
  }
  if (!Array.isArray(payments)) {
    validationErrors.push("Validation Error: payments must be an array");
  }

  if (validationErrors.length) {
    throw new Error(validationErrors[0]);
  }

  const agreementValueDecimal = toDecimal(resolvedAgreementValue);
  const discountRateDecimal = toDecimal(resolvedDiscountRate);
  const computationDateValue = parseDateValue(resolvedComputationDate);

  if (!computationDateValue) {
    throw new Error(`Validation Error: Invalid computation date "${resolvedComputationDate}"`);
  }

  const normalizedMilestones = milestones.map((milestone, index) => {
    const allocationPercent = toDecimal(normalizePercentage(milestone.allocation_percent ?? milestone.percent ?? milestone.allocationPercent ?? 0));
    const dueDateValue = parseDateValue(milestone.due_date ?? milestone.dueDate ?? milestone.target_date ?? milestone.targetDate ?? null);
    const description = milestone.description || milestone.milestone_name || milestone.name || `Milestone ${index + 1}`;
    const allocationValue = agreementValueDecimal.mul(allocationPercent).div(100);

    if (milestone.allocation_percent === undefined && milestone.percent === undefined && milestone.allocationPercent === undefined) {
      throw new Error(`Validation Error: Milestone "${description}" is missing allocation`);
    }
    if (!dueDateValue) {
      throw new Error(`Validation Error: Milestone "${description}" is missing due date`);
    }

    return {
      ...milestone,
      id: milestone.id || `milestone-${index + 1}`,
      description,
      allocation_percent: allocationPercent,
      due_date: dueDateValue,
      due_amount: allocationValue,
      remaining_amount: allocationValue,
      initial_amount: allocationValue,
    };
  });

  const totalAllocation = normalizedMilestones.reduce((sum, milestone) => sum.add(milestone.allocation_percent), new Decimal(0));
  if (!totalAllocation.equals(new Decimal(100))) {
    throw new Error(`Validation Error: The sum of allocation percentages must equal exactly 100. Got ${totalAllocation.toString()}%`);
  }

  const normalizedPayments = payments
    .filter((payment) => Number(payment.amount ?? payment.amountNum ?? 0) > 0)
    .map((payment, index) => {
      const paymentDateValue = parseDateValue(payment.payment_date ?? payment.paymentDate ?? payment.date ?? null);
      if (!paymentDateValue) {
        throw new Error(`Validation Error: Payment "${payment.reference || payment.description || `Payment ${index + 1}`}" is missing payment date`);
      }

      return {
        ...payment,
        id: payment.id || `payment-${index + 1}`,
        reference: payment.reference || payment.description || payment.receipt_number || `Payment ${index + 1}`,
        payment_date: paymentDateValue,
        amount: toDecimal(payment.amount ?? payment.amountNum ?? 0),
      };
    })
    .sort((a, b) => a.payment_date - b.payment_date);

  const sortedMilestones = [...normalizedMilestones].sort((a, b) => a.due_date - b.due_date);

  const allocations = [];
  let totalFutureValue = new Decimal(0);
  let totalPresentValue = new Decimal(0);

  for (const payment of normalizedPayments) {
    let remainingPayment = payment.amount;

    for (const milestone of sortedMilestones) {
      if (remainingPayment.lte(0) || milestone.remaining_amount.lte(0)) continue;

      const allocationAmount = Decimal.min(remainingPayment, milestone.remaining_amount);
      milestone.remaining_amount = milestone.remaining_amount.sub(allocationAmount);
      remainingPayment = remainingPayment.sub(allocationAmount);

      const days = getDayDifference(milestone.due_date, payment.payment_date);
      const proratedDiscountRate = discountRateDecimal.div(100).mul(days).div(365);
      const presentValue = allocationAmount.div(new Decimal(1).add(proratedDiscountRate));
      const benefit = allocationAmount.sub(presentValue);

      totalFutureValue = totalFutureValue.add(allocationAmount);
      totalPresentValue = totalPresentValue.add(presentValue);

      allocations.push({
        milestoneId: milestone.id,
        milestoneDescription: milestone.description,
        allocationPercent: Number(milestone.allocation_percent.toFixed(6)),
        dueDate: formatDateValue(milestone.due_date),
        receiptId: payment.id,
        receiptDate: formatDateValue(payment.payment_date),
        allocatedAmount: toDisplayNumber(allocationAmount, 2),
        days,
        discountRate: toDisplayNumber(proratedDiscountRate, 10),
        presentValue: toDisplayNumber(presentValue, 6),
        benefit: toDisplayNumber(benefit, 6),
        outstandingBalanceAfterAllocation: toDisplayNumber(milestone.remaining_amount, 2),
      });
    }
  }

  const agreementDueNow = normalizedMilestones.reduce((sum, milestone) => {
    return milestone.due_date <= computationDateValue ? sum.add(milestone.initial_amount) : sum;
  }, new Decimal(0));

  const agreementNotDue = normalizedMilestones.reduce((sum, milestone) => {
    return milestone.due_date > computationDateValue ? sum.add(milestone.initial_amount) : sum;
  }, new Decimal(0));

  const agreementReceivedTillDate = normalizedPayments.reduce((sum, payment) => {
    return payment.payment_date <= computationDateValue ? sum.add(payment.amount) : sum;
  }, new Decimal(0));

  const outstandingAgreementValue = agreementValueDecimal.sub(agreementReceivedTillDate);
  const totalBenefit = totalFutureValue.sub(totalPresentValue);
  const totalLateInterest = new Decimal(0);
  const totalPayments = normalizedPayments.reduce((sum, payment) => sum.add(payment.amount), new Decimal(0));

  const warnings = [];
  const expectedValues = reconciliation || {};
  if (expectedValues.expectedAgreementValue !== undefined && expectedValues.expectedAgreementValue !== null) {
    const expectedAgreementValueDecimal = toDecimal(expectedValues.expectedAgreementValue);
    if (!expectedAgreementValueDecimal.equals(agreementValueDecimal)) {
      warnings.push(`Reconciliation warning: agreement value mismatch (${expectedAgreementValueDecimal.toString()} vs ${agreementValueDecimal.toString()})`);
    }
  }
  if (expectedValues.expectedTotalReceipts !== undefined && expectedValues.expectedTotalReceipts !== null) {
    const expectedTotalReceiptsDecimal = toDecimal(expectedValues.expectedTotalReceipts);
    if (!expectedTotalReceiptsDecimal.equals(agreementReceivedTillDate)) {
      warnings.push(`Reconciliation warning: receipt total mismatch (${expectedTotalReceiptsDecimal.toString()} vs ${agreementReceivedTillDate.toString()})`);
    }
  }
  if (expectedValues.expectedOutstanding !== undefined && expectedValues.expectedOutstanding !== null) {
    const expectedOutstandingDecimal = toDecimal(expectedValues.expectedOutstanding);
    if (!expectedOutstandingDecimal.equals(outstandingAgreementValue)) {
      warnings.push(`Reconciliation warning: outstanding mismatch (${expectedOutstandingDecimal.toString()} vs ${outstandingAgreementValue.toString()})`);
    }
  }
  if (expectedValues.expectedDueScheduleAmount !== undefined && expectedValues.expectedDueScheduleAmount !== null) {
    const expectedDueScheduleAmountDecimal = toDecimal(expectedValues.expectedDueScheduleAmount);
    if (!expectedDueScheduleAmountDecimal.equals(agreementDueNow.add(agreementNotDue))) {
      warnings.push(`Reconciliation warning: due schedule mismatch (${expectedDueScheduleAmountDecimal.toString()} vs ${agreementDueNow.add(agreementNotDue).toString()})`);
    }
  }

  return {
    agreement: {
      agreementValue: toDisplayNumber(agreementValueDecimal, 2),
      bookingDate: resolvedBookingDate ? formatDateValue(parseDateValue(resolvedBookingDate)) : null,
      computationDate: formatDateValue(computationDateValue),
      discountRate: toDisplayNumber(discountRateDecimal, 10),
      interestRate: toDisplayNumber(resolvedInterestRate ? new Decimal(resolvedInterestRate) : new Decimal(0), 10),
    },
    milestones: normalizedMilestones.map((milestone) => ({
      id: milestone.id,
      description: milestone.description,
      allocationPercent: Number(milestone.allocation_percent.toFixed(6)),
      dueDate: formatDateValue(milestone.due_date),
      initialAmount: toDisplayNumber(milestone.initial_amount, 2),
      remainingAmount: toDisplayNumber(milestone.remaining_amount, 2),
    })),
    allocations,
    summary: {
      totalFutureValue: toDisplayNumber(totalFutureValue, 2),
      totalPresentValue: toDisplayNumber(totalPresentValue, 2),
      totalBenefit: toDisplayNumber(totalBenefit, 2),
      totalPayments: toDisplayNumber(totalPayments, 2),
      agreementDueNow: toDisplayNumber(agreementDueNow, 2),
      agreementNotDue: toDisplayNumber(agreementNotDue, 2),
      agreementReceivedTillDate: toDisplayNumber(agreementReceivedTillDate, 2),
      outstanding: toDisplayNumber(outstandingAgreementValue, 2),
      lateInterest: toDisplayNumber(totalLateInterest, 2),
      netAdjustment: toDisplayNumber(totalBenefit, 2),
    },
    totals: {
      total_due_amount: toDisplayNumber(agreementValueDecimal, 2),
      total_paid_amount: toDisplayNumber(totalPayments, 2),
      total_allocated_amount: toDisplayNumber(totalFutureValue, 2),
      total_discount: toDisplayNumber(totalBenefit, 2),
      total_late_interest: toDisplayNumber(totalLateInterest, 2),
      outstanding_amount: toDisplayNumber(outstandingAgreementValue, 2),
      net_adjustment: toDisplayNumber(totalBenefit, 2),
    },
    warnings,
  };
}

export function calculateFpvWithFifoAllocation(request) {
  const {
    agreement_value,
    interest_rate,
    computation_date,
    milestones = [],
    payments = []
  } = request;

  if (!agreement_value || isNaN(Number(agreement_value))) {
    throw new Error("Validation Error: agreement_value must be a valid number");
  }
  if (!computation_date) {
    throw new Error("Validation Error: computation_date is required");
  }
  if (!interest_rate || isNaN(Number(interest_rate))) {
    throw new Error("Validation Error: interest_rate must be a valid number");
  }
  if (!Array.isArray(milestones) || milestones.length === 0) {
    throw new Error("Validation Error: milestones must be a non-empty array");
  }
  if (!Array.isArray(payments)) {
    throw new Error("Validation Error: payments must be an array");
  }

  const agreementValueDecimal = toDecimal(agreement_value);
  const rateDecimal = toDecimal(interest_rate);
  const computationDate = parseDateValue(computation_date);
  if (!computationDate) {
    throw new Error(`Validation Error: Invalid computation_date "${computation_date}"`);
  }

  const normalizedMilestones = milestones
    .map((milestone, index) => {
      const dueAmount = toDecimal(milestone.due_amount ?? milestone.amount ?? milestone.row_amount ?? 0);
      const amount = dueAmount.gt(0)
        ? dueAmount
        : agreementValueDecimal.mul(toDecimal(normalizePercentage(milestone.allocation_percent ?? milestone.percent ?? 0)).div(100));

      return {
        ...milestone,
        id: milestone.id || `milestone-${index + 1}`,
        description: milestone.description || milestone.milestone_name || milestone.name || `Milestone ${index + 1}`,
        allocation_percent: normalizePercentage(milestone.allocation_percent ?? milestone.percent ?? 0),
        due_date: milestone.due_date || milestone.target_date || milestone.original_due_date || milestone.revised_due_date || milestone.dueDate || milestone.expected_date || milestone.expectedDate || null,
        initial_amount: amount,
        remaining_amount: amount,
        due_amount: amount,
      };
    })
    .sort((a, b) => {
      const aDate = parseDateValue(a.due_date);
      const bDate = parseDateValue(b.due_date);
      if (!aDate && !bDate) return a.display_order - b.display_order;
      if (!aDate) return 1;
      if (!bDate) return -1;
      return aDate - bDate;
    });

  const normalizedPayments = payments
    .filter((payment) => Number(payment.amount ?? payment.amountNum ?? 0) > 0)
    .map((payment) => ({
      ...payment,
      id: payment.id || `payment-${Math.random().toString(36).slice(2, 8)}`,
      payment_date: payment.payment_date || payment.paymentDate || null,
      amount: toDecimal(payment.amount ?? payment.amountNum ?? 0),
    }))
    .sort((a, b) => {
      const aDate = parseDateValue(a.payment_date);
      const bDate = parseDateValue(b.payment_date);
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      return aDate - bDate;
    });

  let totalDiscount = new Decimal(0);
  let totalLateInterest = new Decimal(0);
  let totalAllocated = new Decimal(0);

  const allocations = [];

  for (const payment of normalizedPayments) {
    let remainingPayment = payment.amount;

    for (const milestone of normalizedMilestones) {
      if (remainingPayment.lte(0) || milestone.remaining_amount.lte(0)) continue;

      const chunkAmount = Decimal.min(remainingPayment, milestone.remaining_amount);
      milestone.remaining_amount = milestone.remaining_amount.sub(chunkAmount);
      remainingPayment = remainingPayment.sub(chunkAmount);
      totalAllocated = totalAllocated.add(chunkAmount);

      const paymentDate = parseDateValue(payment.payment_date);
      const dueDate = parseDateValue(milestone.due_date);
      let daysDelta = 0;
      if (paymentDate && dueDate) {
        daysDelta = Math.round((paymentDate - dueDate) / (1000 * 60 * 60 * 24));
      }

      const adjustmentMagnitude = chunkAmount.mul(rateDecimal).div(100).mul(new Decimal(Math.abs(daysDelta))).div(new Decimal(365));

      if (daysDelta < 0) {
        totalDiscount = totalDiscount.add(adjustmentMagnitude);
      } else if (daysDelta > 0) {
        totalLateInterest = totalLateInterest.add(adjustmentMagnitude);
      }

      allocations.push({
        payment_id: payment.id,
        reference: payment.reference || payment.description || "",
        milestone_id: milestone.id,
        milestone_description: milestone.description,
        payment_date: payment.payment_date,
        due_date: milestone.due_date,
        allocated_amount: formatDecimal(chunkAmount),
        days_delta: daysDelta,
        adjustment: formatDecimal(adjustmentMagnitude),
        adjustment_type: daysDelta < 0 ? "discount" : daysDelta > 0 ? "late_interest" : "none"
      });
    }
  }

  const outstandingAmount = normalizedMilestones.reduce((sum, milestone) => sum.add(milestone.remaining_amount), new Decimal(0));
  const totalDueAmount = normalizedMilestones.reduce((sum, milestone) => sum.add(milestone.initial_amount), new Decimal(0));

  return {
    milestones: normalizedMilestones.map((milestone) => ({
      id: milestone.id,
      description: milestone.description,
      allocation_percent: milestone.allocation_percent,
      due_date: milestone.due_date,
      due_amount: formatDecimal(milestone.initial_amount),
      remaining_amount: formatDecimal(milestone.remaining_amount),
      sequence: milestone.display_order ?? milestone.sequence ?? null,
      milestone_type: milestone.milestone_type || milestone.schedule_type || "construction",
      billing_status: milestone.billing_status || milestone.status || "pending",
      source: milestone.source || (milestone.display_order && milestone.display_order <= 2 ? "Customer" : "Presales")
    })),
    allocations,
    totals: {
      total_due_amount: formatDecimal(totalDueAmount),
      total_paid_amount: formatDecimal(normalizedPayments.reduce((sum, payment) => sum.add(payment.amount), new Decimal(0))),
      total_allocated_amount: formatDecimal(totalAllocated),
      total_discount: formatDecimal(totalDiscount),
      total_late_interest: formatDecimal(totalLateInterest),
      outstanding_amount: formatDecimal(outstandingAmount),
      net_adjustment: formatDecimal(totalLateInterest.sub(totalDiscount))
    }
  };
}

/**
 * Calculate Financial Reconciliation using FIFO allocation.
 *
 * @param {Object} payload
 * @param {number|string|Decimal} payload.interestRate - Annual interest rate percentage (e.g. 10.35)
 * @param {Array} payload.milestones - [{ id, description, due_amount, due_date }]
 * @param {Array} payload.payments - [{ id, amount, payment_date, source }]
 *
 * @returns {Object} - { summary: {...}, allocations: [...] }
 */
export function calculateFinancialReconciliation(payload) {
  if (!payload) throw new Error("Validation Error: payload is required");

  const { interestRate, milestones = [], payments = [] } = payload;

  if (interestRate === undefined || interestRate === null || isNaN(Number(interestRate))) {
    throw new Error("Validation Error: interestRate must be a valid number");
  }

  if (!Array.isArray(milestones) || milestones.length === 0) {
    throw new Error("Validation Error: milestones must be a non-empty array");
  }

  if (!Array.isArray(payments)) {
    throw new Error("Validation Error: payments must be an array");
  }

  const rateDec = toDecimal(interestRate);

  // Normalize milestones
  const normalizedMilestones = milestones.map((m, idx) => {
    const dueAmount = toDecimal(m.due_amount ?? m.amount ?? 0);
    return {
      id: m.id || `ms-${idx + 1}`,
      description: m.description || m.name || `Milestone ${idx + 1}`,
      due_amount: dueAmount,
      remaining_amount: dueAmount,
      due_date: m.due_date ?? null,
    };
  })
    .sort((a, b) => {
      const aDate = parseDateValue(a.due_date);
      const bDate = parseDateValue(b.due_date);
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      return aDate - bDate;
    });

  // Normalize payments
  const normalizedPayments = payments
    .map((p, idx) => ({
      id: p.id || `pay-${idx + 1}`,
      amount: toDecimal(p.amount ?? p.value ?? 0),
      payment_date: p.payment_date ?? p.paymentDate ?? null,
      source: p.source ?? p.source_name ?? null,
      raw: p,
    }))
    .filter((p) => p.amount.gt(0))
    .sort((a, b) => {
      const ad = parseDateValue(a.payment_date);
      const bd = parseDateValue(b.payment_date);
      if (!ad && !bd) return 0;
      if (!ad) return 1;
      if (!bd) return -1;
      return ad - bd;
    });

  const allocations = [];
  let totalDiscount = new Decimal(0);
  let totalLateInterest = new Decimal(0);
  let totalPaid = new Decimal(0);

  const MS_PER_DAY = 1000 * 60 * 60 * 24;

  for (const payment of normalizedPayments) {
    let remainingPayment = payment.amount;
    totalPaid = totalPaid.add(payment.amount);

    // Allocate to milestones FIFO
    for (const milestone of normalizedMilestones) {
      if (remainingPayment.lte(0)) break;
      if (milestone.remaining_amount.lte(0)) continue;

      const chunk = Decimal.min(remainingPayment, milestone.remaining_amount);
      milestone.remaining_amount = milestone.remaining_amount.sub(chunk);
      remainingPayment = remainingPayment.sub(chunk);

      // Days = Due Date - Payment Date (exact calendar days)
      const payDate = parseDateValue(payment.payment_date);
      const dueDate = parseDateValue(milestone.due_date);
      let days = 0;
      if (payDate && dueDate) {
        const utcPay = Date.UTC(payDate.getFullYear(), payDate.getMonth(), payDate.getDate());
        const utcDue = Date.UTC(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
        days = Math.round((utcDue - utcPay) / MS_PER_DAY);
      } else {
        // un-dated milestones or payments cannot accrue interest
        days = 0;
      }

      const absDays = Math.abs(days);
      const adjustment = chunk.mul(rateDec).div(100).mul(new Decimal(absDays)).div(new Decimal(365));

      if (days > 0) {
        // payment is early => discount
        totalDiscount = totalDiscount.add(adjustment);
      } else if (days < 0) {
        // payment is late => penalty
        totalLateInterest = totalLateInterest.add(adjustment);
      }

      allocations.push({
        payment_id: payment.id,
        payment_reference: payment.raw && (payment.raw.reference || payment.raw.description) ? (payment.raw.reference || payment.raw.description) : null,
        milestone_id: milestone.id,
        milestone_description: milestone.description,
        payment_date: payment.payment_date,
        due_date: milestone.due_date,
        allocated_amount: formatDecimal(chunk),
        days_delta: days,
        adjustment: formatDecimal(adjustment),
        adjustment_type: days > 0 ? "discount" : days < 0 ? "late_interest" : "none"
      });
    }

    // If payment still has remaining amount after all milestones are fully paid => unallocated credit
    if (remainingPayment.gt(0)) {
      allocations.push({
        payment_id: payment.id,
        payment_reference: payment.raw && (payment.raw.reference || payment.raw.description) ? (payment.raw.reference || payment.raw.description) : null,
        milestone_id: null,
        milestone_description: "UNALLOCATED_CREDIT",
        payment_date: payment.payment_date,
        due_date: null,
        allocated_amount: formatDecimal(remainingPayment),
        days_delta: 0,
        adjustment: formatDecimal(new Decimal(0)),
        adjustment_type: "credit"
      });
    }
  }

  const totalDue = normalizedMilestones.reduce((s, m) => s.add(m.due_amount), new Decimal(0));
  const outstandingBalance = normalizedMilestones.reduce((s, m) => s.add(m.remaining_amount), new Decimal(0));

  return {
    summary: {
      total_due: formatDecimal(totalDue),
      total_paid: formatDecimal(totalPaid),
      outstanding_balance: formatDecimal(outstandingBalance),
      total_discount: formatDecimal(totalDiscount),
      total_late_interest: formatDecimal(totalLateInterest),
      net_adjustment: formatDecimal(totalLateInterest.sub(totalDiscount))
    },
    allocations
  };
}
