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

export async function postDelayedInterestToLedger(prismaInstance, params) {
  // Extract inputs, supporting both the old and new parameter formats
  const salesOrderId = params.salesOrderId || params.sales_order_id;
  const customerId = params.customerId || params.customer_id;
  
  const milestoneDemand = params.milestoneDemand !== undefined ? params.milestoneDemand : params.outstandingPrincipal;
  const amountPaid = params.amountPaid !== undefined ? params.amountPaid : 0;
  
  const annualPenaltyRate = params.annual_interest_rate !== undefined ? params.annual_interest_rate : params.annualPenaltyRate;
  const demandLetterDate = params.dueDate !== undefined ? params.dueDate : params.demandLetterDate;
  
  const calculationDate = params.calculationEndDate !== undefined ? params.calculationEndDate : params.calculationDate;
  const gracePeriodDays = params.gracePeriodDays !== undefined ? params.gracePeriodDays : 0;
  
  const milestoneName = params.milestoneName || params.milestone_name || "";

  if (!salesOrderId) throw new Error("salesOrderId is required.");
  if (!customerId) throw new Error("customerId is required.");

  // Parse dates to get calendar month name for description and idempotency checks
  const calcDate = new Date(calculationDate);
  if (isNaN(calcDate.getTime())) {
    throw new Error("Invalid calculation date.");
  }

  // 1. Query database for the last interest posting date for this milestone
  const lastInterestEntry = await prismaInstance.ledger.findFirst({
    where: {
      sales_order_id: salesOrderId,
      customer_id: customerId,
      transaction_type: "LATE_FEE_INTEREST",
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

  const start = new Date(demandLetterDate);
  const actualDueDate = new Date(start);
  actualDueDate.setDate(actualDueDate.getDate() + Number(gracePeriodDays));

  const baseStartDate = lastInterestEntry ? lastInterestEntry.reference_date : actualDueDate;
  const startUtc = parseDateToUtc(baseStartDate);
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

  const overdueStart = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  const overdueEnd = endUtc;

  let currentYear = overdueStart.getUTCFullYear();
  let currentMonth = overdueStart.getUTCMonth(); // 0-indexed

  const endYear = overdueEnd.getUTCFullYear();
  const endMonth = overdueEnd.getUTCMonth();

  const monthlyEntriesToCreate = [];

  const outstandingPrincipal = Number(milestoneDemand || 0) - Number(amountPaid || 0);

  while (
    currentYear < endYear || 
    (currentYear === endYear && currentMonth <= endMonth)
  ) {
    const firstDayOfMonth = new Date(Date.UTC(currentYear, currentMonth, 1));
    const lastDayOfMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 0));

    const rangeStart = overdueStart > firstDayOfMonth ? overdueStart : firstDayOfMonth;
    const rangeEnd = overdueEnd < lastDayOfMonth ? overdueEnd : lastDayOfMonth;

    if (rangeStart <= rangeEnd) {
      const timeDiff = rangeEnd.getTime() - rangeStart.getTime();
      const daysOverdue = Math.round(timeDiff / (1000 * 60 * 60 * 24)) + 1;

      // strictly: (Outstanding_Principal * Annual_Rate * Days_In_Month) / (365 * 100)
      const interestCalculated = (Number(outstandingPrincipal) * Number(annualPenaltyRate) * daysOverdue) / (365 * 100);
      const roundedInterest = Math.round((interestCalculated + Number.EPSILON) * 100) / 100;
      
      // Calculate 18% GST on each month's interest amount
      const gstAmount = Math.round((roundedInterest * 0.18 + Number.EPSILON) * 100) / 100;
      const totalAmount = Math.round((roundedInterest + gstAmount + Number.EPSILON) * 100) / 100;

      console.log(`[Interest Calculation Engine] Variable Log:`, {
        Outstanding_Principal: Number(outstandingPrincipal),
        Annual_Rate: Number(annualPenaltyRate),
        Days_In_Month: daysOverdue,
        calculatedInterest: interestCalculated,
        roundedInterest: roundedInterest,
        gstAmount,
        totalAmount,
        period: `${formatUtcDMY(rangeStart)} to ${formatUtcDMY(rangeEnd)}`
      });

      if (totalAmount > 0) {
        const isLastDay = isUtcLastDayOfMonth(rangeEnd);
        const isFinalSettlement = params.isFinalSettlement === true;
        if (isLastDay || isFinalSettlement) {
          monthlyEntriesToCreate.push({
            rangeStart,
            rangeEnd,
            daysOverdue,
            roundedInterest,
            gstAmount,
            totalAmount
          });
        } else {
          console.log(`[Interest Calculation Engine] Skipping mid-month posting for ${formatUtcDMY(rangeEnd)} as isFinalSettlement is false.`);
        }
      }
    }

    if (currentMonth === 11) {
      currentMonth = 0;
      currentYear += 1;
    } else {
      currentMonth += 1;
    }
  }

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
          transaction_type: "LATE_FEE_INTEREST",
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
        ? `Delayed payment interest for ${milestoneName} for the period of ${formatUtcDMY(item.rangeStart)} to ${formatUtcDMY(item.rangeEnd)}`
        : `Delayed payment interest for the period of ${formatUtcDMY(item.rangeStart)} to ${formatUtcDMY(item.rangeEnd)}`;

      const newLedgerEntry = await tx.ledger.create({
        data: {
          sales_order_id: salesOrderId,
          customer_id: customerId,
          transaction_type: "LATE_FEE_INTEREST",
          amount: item.totalAmount,
          reference_date: item.rangeEnd,
          description: description,
          status: "UNPAID"
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

  // Fetch active sales orders for this customer
  const salesOrders = await tx.sales_orders.findMany({
    where: {
      customer_id: customerId,
      status: { notIn: ["cancelled", "resale"] }
    }
  });

  for (const order of salesOrders) {
    // Fetch outstanding standard schedules and PRL demands
    const schedules = await tx.payment_schedules.findMany({
      where: {
        sales_order_id: order.id,
        status: { not: "paid" }
      },
      orderBy: { original_due_date: "asc" }
    });

    const receipts = await tx.customer_receipts.findMany({
      where: { sales_order_id: order.id, status: "cleared" },
      orderBy: { consideration_date: "asc" }
    });

    const prlDemands = await tx.demand_letters.findMany({
      where: {
        sales_order_id: order.id,
        demand_type: { in: ["first", "subsequent_prl"] },
        status: { notIn: ["paid", "cancelled"] }
      },
      orderBy: { due_date: "asc" }
    });

    // Process standard schedules
    for (const schedule of schedules) {
      // Find if there is a linked demand letter to prevent double calculation (processed in the demand loop below)
      const linkedDemand = await tx.demand_letters.findFirst({
        where: { payment_schedule_id: schedule.id }
      });
      if (linkedDemand) continue;

      if (!schedule.original_due_date) continue;
      const dueDate = new Date(schedule.original_due_date);
      if (dueDate >= today) continue;

      const matchedReceipt = receipts.find(r => r.payment_schedule_id === schedule.id);
      const endDate = matchedReceipt && matchedReceipt.consideration_date
        ? new Date(matchedReceipt.consideration_date)
        : today;

      if (endDate <= dueDate) continue;

      await postDelayedInterestToLedger(tx, {
        salesOrderId: order.id,
        customerId: customerId,
        milestoneDemand: Number(schedule.due_amount),
        amountPaid: 0,
        dueDate: dueDate,
        calculationEndDate: endDate,
        annual_interest_rate: 18,
        milestoneName: schedule.milestone_name,
        isFinalSettlement: false
      });
    }

    // Process PRL demands
    for (const demand of prlDemands) {
      if (!demand.due_date) continue;
      const dueDate = new Date(demand.due_date);
      if (dueDate >= today) continue;

      const matchedReceipt = demand.payment_schedule_id
        ? receipts.find(r => r.payment_schedule_id === demand.payment_schedule_id)
        : null;
      const endDate = matchedReceipt && matchedReceipt.consideration_date
        ? new Date(matchedReceipt.consideration_date)
        : today;

      if (endDate <= dueDate) continue;

      let milestoneName = "";
      if (demand.payment_schedule_id) {
        const sched = await tx.payment_schedules.findUnique({
          where: { id: demand.payment_schedule_id }
        });
        if (sched) {
          milestoneName = sched.milestone_name;
        }
      }
      if (!milestoneName) {
        milestoneName = `PRL Demand - ${demand.demand_number}`;
      }

      await postDelayedInterestToLedger(tx, {
        salesOrderId: order.id,
        customerId: customerId,
        milestoneDemand: Number(demand.principal_amount),
        amountPaid: 0,
        dueDate: dueDate,
        calculationEndDate: endDate,
        annual_interest_rate: 18,
        milestoneName: milestoneName,
        isFinalSettlement: false
      });
    }
  }
}
