/**
 * Calculates late payment interest and the new outstanding balance using simple interest applied on a pro-rata daily basis.
 *
 * @param {number} outstandingPrincipal - The principal amount overdue (P).
 * @param {number} annualPenaltyRate - Annual penalty rate percentage (R, e.g., 18.0 for 18%).
 * @param {string|Date} demandLetterDate - The date when the demand was issued.
 * @param {number} gracePeriodDays - Number of days allowed as grace period.
 * @param {string|Date} calculationDate - The date of the calculation.
 * @returns {Object} Result containing calculated interest, the new total balance, and number of days overdue.
 */
export function calculateLatePaymentInterest(
  outstandingPrincipal,
  annualPenaltyRate,
  demandLetterDate,
  gracePeriodDays,
  calculationDate
) {
  // Input validations & error handling
  if (outstandingPrincipal === undefined || outstandingPrincipal === null) {
    throw new Error("Outstanding principal is required.");
  }
  if (annualPenaltyRate === undefined || annualPenaltyRate === null) {
    throw new Error("Annual penalty rate is required.");
  }
  if (!demandLetterDate) {
    throw new Error("Demand letter date is required.");
  }
  if (gracePeriodDays === undefined || gracePeriodDays === null) {
    throw new Error("Grace period days is required.");
  }
  if (!calculationDate) {
    throw new Error("Calculation date is required.");
  }

  const principal = Number(outstandingPrincipal);
  const rate = Number(annualPenaltyRate);
  const graceDays = Number(gracePeriodDays);

  if (isNaN(principal)) {
    throw new Error("Outstanding principal must be a valid number.");
  }
  if (isNaN(rate)) {
    throw new Error("Annual penalty rate must be a valid number.");
  }
  if (isNaN(graceDays) || !Number.isInteger(graceDays)) {
    throw new Error("Grace period days must be a valid integer.");
  }

  if (principal < 0) {
    throw new Error("Outstanding principal cannot be negative.");
  }
  if (rate < 0) {
    throw new Error("Annual penalty rate cannot be negative.");
  }
  if (graceDays < 0) {
    throw new Error("Grace period days cannot be negative.");
  }

  // Parse dates cleanly
  const start = new Date(demandLetterDate);
  const calc = new Date(calculationDate);

  if (isNaN(start.getTime())) {
    throw new Error("Invalid demand letter date.");
  }
  if (isNaN(calc.getTime())) {
    throw new Error("Invalid calculation date.");
  }

  // Grace Period Check: Calculate actual due date
  const actualDueDate = new Date(start);
  actualDueDate.setDate(actualDueDate.getDate() + graceDays);

  // Eligibility Check: If calculation_date is before actual_due_date, no interest is accrued
  if (calc < actualDueDate) {
    return {
      interest: 0,
      newBalance: Number(principal.toFixed(2)),
      daysOverdue: 0
    };
  }

  // Days Overdue Calculation (D):
  // Using Math.round to mitigate daylight saving time (DST) adjustments.
  // One day is exactly 24 hours.
  const timeDifference = calc.getTime() - actualDueDate.getTime();
  const daysOverdue = Math.round(timeDifference / (1000 * 60 * 60 * 24));

  if (daysOverdue < 0) {
    return {
      interest: 0,
      newBalance: Number(principal.toFixed(2)),
      daysOverdue: 0
    };
  }

  // Computation: Interest = P * (R / 100) * (D / 365)
  const interestCalculated = principal * (rate / 100) * (daysOverdue / 365);
  
  // Output: Return rounded to 2 decimal places
  const roundedInterest = Math.round((interestCalculated + Number.EPSILON) * 100) / 100;
  const newBalance = Math.round((principal + roundedInterest + Number.EPSILON) * 100) / 100;

  return {
    interest: roundedInterest,
    newBalance: newBalance,
    daysOverdue: daysOverdue
  };
}

/**
 * Automatically calculates late payment interest, creates a ledger entry,
 * and updates the customer's outstanding balance inside an ACID transaction.
 *
 * @param {Object} prismaInstance - The Prisma client instance.
 * @param {Object} params - The inputs required for interest calculation.
 * @param {string} params.salesOrderId - Sales Order ID.
 * @param {string} params.customerId - Customer ID.
 * @param {number} params.outstandingPrincipal - Overdue principal.
 * @param {number} params.annualPenaltyRate - Penalty APR.
 * @param {string|Date} params.demandLetterDate - Demand letter issue date.
 * @param {number} params.gracePeriodDays - Grace period in days.
 * @param {string|Date} params.calculationDate - Month-end calculation date.
 * @returns {Promise<Object>} The posted ledger entry and updated balance.
 */
function parseDateToUtc(d) {
  const dateObj = new Date(d);
  if (isNaN(dateObj.getTime())) {
    throw new Error(`Invalid date provided: ${d}`);
  }
  return new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
}

function formatUtcDMY(d) {
  const dd = d.getUTCDate().toString().padStart(2, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function isUtcLastDayOfMonth(date) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return d === lastDay;
}

/**
 * Shared helper function to calculate month-by-month delayed payment interest breakdown for a demand milestone.
 */
export function calculateMonthlyBreakdown({
  principalAmount,
  dueDate,
  payments,
  annualPenaltyRate,
  calculationEndDate,
  isFinalSettlement
}) {
  const rate = Number(annualPenaltyRate);
  const dueUtc = parseDateToUtc(dueDate);
  const calcEndUtc = parseDateToUtc(calculationEndDate);

  // Group payments by date to simplify timeline
  const uniquePaymentsMap = new Map();
  for (const p of payments) {
    const d = parseDateToUtc(p.date);
    const dateKey = d.getTime();
    uniquePaymentsMap.set(dateKey, (uniquePaymentsMap.get(dateKey) || 0) + Number(p.amount));
  }
  const groupedPayments = Array.from(uniquePaymentsMap.entries()).map(([time, amount]) => ({
    date: new Date(time),
    amount
  })).sort((a, b) => a.date - b.date);

  // 1. Before Due Date: receipts received on or before milestone due date reduce initial outstanding
  let outstandingOnDueDate = Number(principalAmount);
  const latePayments = [];

  for (const gp of groupedPayments) {
    if (gp.date <= dueUtc) {
      outstandingOnDueDate -= gp.amount;
    } else {
      latePayments.push(gp);
    }
  }

  if (outstandingOnDueDate <= 0) {
    return []; // No delayed payment interest if paid on or before due date
  }

  // 2. If Customer Has Not Paid by Due Date
  const overdueStart = new Date(dueUtc.getTime() + 24 * 60 * 60 * 1000); // Due Date + 1 day
  
  if (overdueStart > calcEndUtc) {
    return [];
  }

  const monthlyEntries = [];

  let currentYear = overdueStart.getUTCFullYear();
  let currentMonth = overdueStart.getUTCMonth(); // 0-indexed
  const endYear = calcEndUtc.getUTCFullYear();
  const endMonth = calcEndUtc.getUTCMonth();

  let runningOutstanding = outstandingOnDueDate;

  while (
    (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) &&
    runningOutstanding > 0
  ) {
    const firstDayOfMonth = new Date(Date.UTC(currentYear, currentMonth, 1));
    const lastDayOfMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 0));

    const rangeStart = overdueStart > firstDayOfMonth ? overdueStart : firstDayOfMonth;
    const rangeEnd = calcEndUtc < lastDayOfMonth ? calcEndUtc : lastDayOfMonth;

    if (rangeStart <= rangeEnd) {
      const timeDiff = rangeEnd.getTime() - rangeStart.getTime();
      const daysInMonth = Math.round(timeDiff / (1000 * 60 * 60 * 24)) + 1;

      // Slice the month range [rangeStart, rangeEnd] into sub-periods based on payment dates
      const monthPayments = latePayments.filter(p => p.date >= rangeStart && p.date <= rangeEnd);

      let monthInterestSum = 0;
      let currentStart = new Date(rangeStart);

      for (const lp of monthPayments) {
        if (runningOutstanding <= 0) break;
        if (lp.date > currentStart) {
          const days = Math.round((lp.date.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24));
          if (days > 0 && runningOutstanding > 0) {
            monthInterestSum += (runningOutstanding * rate * days) / (365 * 100);
          }
        }
        currentStart = new Date(lp.date);
        runningOutstanding -= lp.amount;
      }

      // Final sub-period from currentStart to rangeEnd
      if (currentStart <= rangeEnd && runningOutstanding > 0) {
        const days = Math.round((rangeEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        if (days > 0 && runningOutstanding > 0) {
          monthInterestSum += (runningOutstanding * rate * days) / (365 * 100);
        }
      }

      const roundedInterest = Math.round((monthInterestSum + Number.EPSILON) * 100) / 100;
      const gstAmount = 0.00;
      const totalAmount = roundedInterest;

      // Add monthly interest to running balance at the end of the month
      runningOutstanding = runningOutstanding + roundedInterest;

      if (totalAmount > 0) {
        const isLastDay = isUtcLastDayOfMonth(rangeEnd);
        const isMilestoneFullyPaidHere = runningOutstanding <= 0;

        if (isLastDay || isFinalSettlement || isMilestoneFullyPaidHere) {
          monthlyEntries.push({
            rangeStart,
            rangeEnd,
            daysOverdue: daysInMonth,
            roundedInterest,
            gstAmount,
            totalAmount
          });
        }
      }

      if (runningOutstanding < 0) {
        runningOutstanding = 0;
      }
    }

    if (currentMonth === 11) {
      currentMonth = 0;
      currentYear += 1;
    } else {
      currentMonth += 1;
    }
  }

  return monthlyEntries;
}

export async function postDelayedInterestToLedger(prismaInstance, params) {
  const salesOrderId = params.salesOrderId || params.sales_order_id;
  const customerId = params.customerId || params.customer_id;
  
  const milestoneDemand = params.milestoneDemand !== undefined ? params.milestoneDemand : params.outstandingPrincipal;
  const annualPenaltyRate = params.annual_interest_rate !== undefined ? params.annual_interest_rate : params.annualPenaltyRate;
  const demandLetterDate = params.dueDate !== undefined ? params.dueDate : params.demandLetterDate;
  
  const calculationDate = params.calculationEndDate !== undefined ? params.calculationEndDate : params.calculationDate;
  const gracePeriodDays = params.gracePeriodDays !== undefined ? params.gracePeriodDays : 0;
  
  const milestoneName = params.milestoneName || params.milestone_name || "";

  if (!salesOrderId) throw new Error("salesOrderId is required.");
  if (!customerId) throw new Error("customerId is required.");

  // 1. Query database for the last interest posting date for this milestone to use for idempotency skips
  const lastInterestEntry = await prismaInstance.ledger.findFirst({
    where: {
      sales_order_id: salesOrderId,
      customer_id: customerId,
      transaction_type: { in: ["LATE_FEE_INTEREST", "INTEREST"] },
      ...(milestoneName ? {
        description: {
          contains: milestoneName
        }
      } : {})
    },
    orderBy: {
      reference_date: "desc"
    }
  });

  // Query all demands and receipts for this sales order to run a clean local FIFO allocation
  const demands = await prismaInstance.demand_letters.findMany({
    where: {
      sales_order_id: salesOrderId,
      status: { not: "cancelled" }
    },
    orderBy: { due_date: "asc" }
  });

  const receipts = await prismaInstance.customer_receipts.findMany({
    where: {
      sales_order_id: salesOrderId,
      status: { not: "bounced" }
    },
    orderBy: { consideration_date: "asc" }
  });

  // Run the FIFO allocation waterfall
  const demandsFifo = demands.map(d => ({
    id: d.id,
    demand_number: d.demand_number,
    due_date: d.due_date ? new Date(d.due_date) : null,
    principal_amount: Number(d.principal_amount) + Number(d.other_charges || 0),
    remaining_principal: Number(d.principal_amount) + Number(d.other_charges || 0),
    payment_schedule_id: d.payment_schedule_id,
    payments: []
  }));

  const receiptsFifo = receipts.map(r => ({
    id: r.id,
    amount: Number(r.amount),
    remaining_amount: Number(r.amount),
    consideration_date: r.consideration_date ? new Date(r.consideration_date) : new Date(r.receipt_date)
  })).sort((a, b) => a.consideration_date - b.consideration_date);

  for (const r of receiptsFifo) {
    for (const d of demandsFifo) {
      if (r.remaining_amount <= 0) break;
      if (!d.due_date) continue;
      if (d.remaining_principal <= 0) continue;

      const allocated = Math.min(r.remaining_amount, d.remaining_principal);
      d.payments.push({
        amount: allocated,
        date: r.consideration_date
      });
      d.remaining_principal -= allocated;
      r.remaining_amount -= allocated;
    }
  }

  // Find the matched demand from FIFO
  let matchedDemand = null;

  if (milestoneName) {
    if (milestoneName.startsWith("PRL Demand - ")) {
      const demandNumber = milestoneName.replace("PRL Demand - ", "").trim();
      matchedDemand = demandsFifo.find(d => d.demand_number === demandNumber);
    } else {
      const schedule = await prismaInstance.payment_schedules.findFirst({
        where: {
          sales_order_id: salesOrderId,
          milestone_name: milestoneName
        }
      });
      if (schedule) {
        matchedDemand = demandsFifo.find(d => d.payment_schedule_id === schedule.id);
      }
    }
  }

  if (!matchedDemand) {
    const targetDueTime = parseDateToUtc(demandLetterDate).getTime();
    matchedDemand = demandsFifo.find(d => {
      const dDueTime = d.due_date ? parseDateToUtc(d.due_date).getTime() : 0;
      return dDueTime === targetDueTime && Math.abs(d.principal_amount - Number(milestoneDemand)) < 0.01;
    });
  }

  // Fallback if not found in database (e.g. standard mock/transient test cases)
  if (!matchedDemand) {
    const virtualDueDate = new Date(demandLetterDate);
    matchedDemand = {
      principal_amount: Number(milestoneDemand),
      due_date: virtualDueDate,
      payments: []
    };
  }

  const overdueDueDate = new Date(matchedDemand.due_date);
  if (gracePeriodDays > 0) {
    overdueDueDate.setDate(overdueDueDate.getDate() + Number(gracePeriodDays));
  }

  const startUtc = parseDateToUtc(overdueDueDate);
  const endUtc = parseDateToUtc(calculationDate);

  if (startUtc >= endUtc) {
    const customer = await prismaInstance.customers.findUnique({
      where: { id: customerId }
    });
    return {
      status: lastInterestEntry ? "SKIPPED_ALREADY_POSTED" : "NO_INTEREST_DUE",
      ledgerEntry: lastInterestEntry || null,
      ledgerEntries: [],
      totalOutstandingBalance: customer ? Number(customer.total_outstanding_balance) : 0
    };
  }

  const monthlyEntriesToCreate = calculateMonthlyBreakdown({
    principalAmount: matchedDemand.principal_amount,
    dueDate: overdueDueDate,
    payments: matchedDemand.payments,
    annualPenaltyRate: annualPenaltyRate,
    calculationEndDate: calculationDate,
    isFinalSettlement: params.isFinalSettlement === true
  });

  if (monthlyEntriesToCreate.length === 0) {
    const customer = await prismaInstance.customers.findUnique({
      where: { id: customerId }
    });
    return {
      status: "NO_INTEREST_DUE",
      interest: 0,
      ledgerEntries: [],
      totalOutstandingBalance: customer ? Number(customer.total_outstanding_balance) : 0
    };
  }

  const performCalculations = async (tx) => {
    let totalAddedInterest = 0;
    const createdLedgerEntries = [];

    for (const item of monthlyEntriesToCreate) {
      const existingLedgerEntry = await tx.ledger.findFirst({
        where: {
          sales_order_id: salesOrderId,
          customer_id: customerId,
          transaction_type: { in: ["LATE_FEE_INTEREST", "INTEREST"] },
          reference_date: item.rangeEnd,
          ...(milestoneName ? {
            description: {
              contains: milestoneName
            }
          } : {})
        }
      });

      if (existingLedgerEntry) {
        continue;
      }

      const description = milestoneName
        ? `Delayed payment interest for ${milestoneName} for the period of ${formatUtcDMY(item.rangeStart)} to ${formatUtcDMY(item.rangeEnd)} (${item.daysOverdue} days)`
        : `Delayed payment interest for the period of ${formatUtcDMY(item.rangeStart)} to ${formatUtcDMY(item.rangeEnd)} (${item.daysOverdue} days)`;

      const debitVal = Number(item.totalAmount);
      const lastEntry = await tx.ledger.findFirst({
        where: { customer_id: customerId },
        orderBy: { created_at: "desc" }
      });
      const prevBalance = lastEntry ? Number(lastEntry.running_balance || 0) : 0;
      const runningBalance = prevBalance + debitVal;

      const newLedgerEntry = await tx.ledger.create({
        data: {
          sales_order_id: salesOrderId,
          customer_id: customerId,
          transaction_type: "INTEREST",
          amount: item.totalAmount,
          reference_date: item.rangeEnd,
          description: description,
          status: "UNPAID",
          debit: debitVal,
          credit: 0,
          running_balance: runningBalance,
          reference_no: milestoneName ? `INT-${milestoneName}` : `INT-${salesOrderId}`
        }
      });

      totalAddedInterest += item.totalAmount;
      createdLedgerEntries.push({
        ...newLedgerEntry,
        amount: Number(newLedgerEntry.amount)
      });
    }

    if (totalAddedInterest > 0) {
      const updatedCustomer = await tx.customers.update({
        where: { id: customerId },
        data: {
          total_outstanding_balance: {
            increment: totalAddedInterest
          }
        }
      });

      return {
        status: "POSTED",
        ledgerEntries: createdLedgerEntries,
        ledgerEntry: createdLedgerEntries[createdLedgerEntries.length - 1],
        totalOutstandingBalance: Number(updatedCustomer.total_outstanding_balance)
      };
    } else {
      const customer = await tx.customers.findUnique({
        where: { id: customerId }
      });
      return {
        status: "SKIPPED_ALREADY_POSTED",
        ledgerEntries: [],
        ledgerEntry: lastInterestEntry || null,
        totalOutstandingBalance: customer ? Number(customer.total_outstanding_balance) : 0
      };
    }
  };

  if (typeof prismaInstance.$transaction === "function") {
    return await prismaInstance.$transaction(performCalculations);
  } else {
    return await performCalculations(prismaInstance);
  }
}

/**
 * Just-In-Time synchronization utility to backfill overdue past month-end interest entries
 * for a customer's active sales orders, standard schedules, and PRL demands.
 *
 * @param {string} customerId - Customer ID.
 * @param {Object} tx - The active database transaction client.
 */
export async function syncHistoricalInterest(customerId, tx) {
  const today = new Date();

  // Fetch latest completed interest run to get the active interest rate dynamically
  const latestRun = await tx.interest_calculation_runs.findFirst({
    where: { status: "completed" },
    orderBy: { run_date: "desc" }
  });
  
  let dynamicRate = 18.0;
  if (latestRun && latestRun.interest_rate) {
    dynamicRate = Number(latestRun.interest_rate);
    if (dynamicRate <= 1) {
      dynamicRate = dynamicRate * 100;
    }
  } else {
    // Try to get the rate from the latest interest_entries record
    const latestEntry = await tx.interest_entries.findFirst({
      where: { interest_rate: { not: null } },
      orderBy: { created_at: "desc" }
    });
    if (latestEntry && latestEntry.interest_rate) {
      dynamicRate = Number(latestEntry.interest_rate);
      if (dynamicRate <= 1) {
        dynamicRate = dynamicRate * 100;
      }
    }
  }

  // Fetch active sales orders for this customer
  const salesOrders = await tx.sales_orders.findMany({
    where: {
      customer_id: customerId
    }
  });

  const activeOrderIds = salesOrders
    .filter(o => o.status !== "cancelled" && o.status !== "resale")
    .map(o => o.id);

  // 1. Delete existing interest entries only for active sales orders for this customer to ensure clean calculation from scratch
  await tx.ledger.deleteMany({
    where: {
      customer_id: customerId,
      sales_order_id: { in: activeOrderIds },
      transaction_type: { in: ["LATE_FEE_INTEREST", "INTEREST"] }
    }
  });

  // 2. Fetch non-interest ledger entries for base outstanding balance calculation
  const nonInterestLedgers = await tx.ledger.findMany({
    where: {
      customer_id: customerId,
      transaction_type: { notIn: ["LATE_FEE_INTEREST", "INTEREST"] }
    }
  });

  // 3. Calculate the clean base outstanding balance (without interest)
  let baseOutstanding = 0;

  for (const order of salesOrders) {
    const hasReversals = await tx.ledger.findFirst({
      where: {
        sales_order_id: order.id,
        transaction_type: "MILESTONE_REVERSAL"
      }
    });

    const allDemands = await tx.demand_letters.findMany({
      where: {
        sales_order_id: order.id,
        ...(hasReversals ? {} : { status: { not: "cancelled" } })
      }
    });
    allDemands.forEach(d => {
      baseOutstanding += Number(d.principal_amount || 0) + Number(d.other_charges || 0); // principal + gst (other_charges)
    });

    const allReceipts = await tx.customer_receipts.findMany({
      where: {
        sales_order_id: order.id,
        status: { not: "bounced" }
      }
    });
    allReceipts.forEach(r => {
      baseOutstanding -= Number(r.amount || 0);
      baseOutstanding -= Number(r.tds_amount || 0);
    });
  }

  nonInterestLedgers.forEach(l => {
    baseOutstanding += Number(l.amount || 0);
  });

  // Fetch all LATE_FEE_INTEREST entries of cancelled/resale orders and add to baseOutstanding
  const cancelledOrderIds = salesOrders
    .filter(o => o.status === "cancelled" || o.status === "resale")
    .map(o => o.id);

  if (cancelledOrderIds.length > 0) {
    const cancelledInterestEntries = await tx.ledger.findMany({
      where: {
        customer_id: customerId,
        sales_order_id: { in: cancelledOrderIds },
        transaction_type: { in: ["LATE_FEE_INTEREST", "INTEREST"] }
      }
    });
    cancelledInterestEntries.forEach(l => {
      baseOutstanding += Number(l.amount || 0);
    });
  }

  let totalNewInterest = 0;

  for (const order of salesOrders) {
    if (order.status === "cancelled" || order.status === "resale") continue;
    // Fetch all unpaid/active demand letters
    const demands = await tx.demand_letters.findMany({
      where: {
        sales_order_id: order.id,
        demand_type: { in: ["first", "subsequent_prl"] },
        status: { notIn: ["cancelled"] }
      },
      orderBy: { due_date: "asc" }
    });

    const receipts = await tx.customer_receipts.findMany({
      where: {
        sales_order_id: order.id,
        status: { not: "bounced" }
      },
      orderBy: { consideration_date: "asc" }
    });

    // Structure demands and receipts for FIFO waterfall
    const demandsFifo = demands.map(d => ({
      id: d.id,
      demand_number: d.demand_number,
      due_date: d.due_date ? new Date(d.due_date) : null,
      principal_amount: Number(d.principal_amount) + Number(d.other_charges || 0),
      remaining_principal: Number(d.principal_amount) + Number(d.other_charges || 0),
      payment_schedule_id: d.payment_schedule_id,
      payments: []
    }));

    const receiptsFifo = receipts.map(r => ({
      id: r.id,
      amount: Number(r.amount),
      remaining_amount: Number(r.amount),
      consideration_date: r.consideration_date ? new Date(r.consideration_date) : new Date(r.receipt_date)
    })).sort((a, b) => a.consideration_date - b.consideration_date);

    // Run FIFO allocation waterfall
    for (const r of receiptsFifo) {
      for (const d of demandsFifo) {
        if (r.remaining_amount <= 0) break;
        if (!d.due_date) continue;
        if (d.remaining_principal <= 0) continue;

        const allocated = Math.min(r.remaining_amount, d.remaining_principal);
        d.payments.push({
          amount: allocated,
          date: r.consideration_date
        });
        d.remaining_principal -= allocated;
        r.remaining_amount -= allocated;
      }
    }

    // Process demands to calculate and post delayed interest
    for (const d of demandsFifo) {
      if (!d.due_date) continue;
      const dueDate = d.due_date;
      if (dueDate >= today) continue;

      // Determine calculation end date
      const isFullyPaid = d.remaining_principal === 0;
      const lastPayment = d.payments.length > 0 ? d.payments[d.payments.length - 1] : null;
      const endDate = isFullyPaid && lastPayment ? lastPayment.date : today;

      const monthlyEntriesToCreate = calculateMonthlyBreakdown({
        principalAmount: d.principal_amount,
        dueDate: d.due_date,
        payments: d.payments,
        annualPenaltyRate: dynamicRate,
        calculationEndDate: endDate,
        isFinalSettlement: false
      });

      let milestoneName = "";
      if (d.payment_schedule_id) {
        const sched = await tx.payment_schedules.findUnique({
          where: { id: d.payment_schedule_id }
        });
        if (sched) {
          milestoneName = sched.milestone_name;
        }
      }
      if (!milestoneName) {
        milestoneName = `PRL Demand - ${d.demand_number}`;
      }

      // Create new correct entries
      for (const item of monthlyEntriesToCreate) {
        const description = `Delayed payment interest for ${milestoneName} [Ref: ${d.demand_number}] for the period of ${formatUtcDMY(item.rangeStart)} to ${formatUtcDMY(item.rangeEnd)} (${item.daysOverdue} days)`;

        const debitVal = Number(item.totalAmount);
        const lastEntry = await tx.ledger.findFirst({
          where: { customer_id: customerId },
          orderBy: { created_at: "desc" }
        });
        const prevBalance = lastEntry ? Number(lastEntry.running_balance || 0) : 0;
        const runningBalance = prevBalance + debitVal;

        await tx.ledger.create({
          data: {
            sales_order_id: order.id,
            customer_id: customerId,
            transaction_type: "INTEREST",
            amount: item.totalAmount,
            reference_date: item.rangeEnd,
            description: description,
            status: "UNPAID",
            debit: debitVal,
            credit: 0,
            running_balance: runningBalance,
            reference_no: `INT-${d.demand_number}`
          }
        });

        totalNewInterest += item.totalAmount;
      }
    }
  }

  // 4. Update the customer's total outstanding balance with the mathematically correct values
  const finalBalance = baseOutstanding + totalNewInterest;
  await tx.customers.update({
    where: { id: customerId },
    data: {
      total_outstanding_balance: finalBalance
    }
  });
}
