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

  // 1. Delete all existing interest entries for this customer to ensure clean calculation from scratch
  await tx.ledger.deleteMany({
    where: {
      customer_id: customerId,
      transaction_type: "LATE_FEE_INTEREST"
    }
  });

  // 2. Fetch non-interest ledger entries for base outstanding balance calculation
  const nonInterestLedgers = await tx.ledger.findMany({
    where: {
      customer_id: customerId,
      transaction_type: { not: "LATE_FEE_INTEREST" }
    }
  });

  // 3. Calculate the clean base outstanding balance (without interest)
  let baseOutstanding = 0;

  for (const order of salesOrders) {
    const allDemands = await tx.demand_letters.findMany({
      where: {
        sales_order_id: order.id,
        status: { not: "cancelled" }
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

  let totalNewInterest = 0;

  for (const order of salesOrders) {
    // Fetch all unpaid/active demand letters
    const demands = await tx.demand_letters.findMany({
      where: {
        sales_order_id: order.id,
        demand_type: { in: ["first", "subsequent_prl"] },
        status: { notIn: ["cancelled"] }
      },
      orderBy: { due_date: "asc" }
    });

    // Fetch all cleared receipts
    const receipts = await tx.customer_receipts.findMany({
      where: {
        sales_order_id: order.id,
        status: "cleared"
      },
      orderBy: { consideration_date: "asc" }
    });

    // Structure demands and receipts for FIFO waterfall
    const demandsFifo = demands.map(d => ({
      id: d.id,
      demand_number: d.demand_number,
      due_date: d.due_date ? new Date(d.due_date) : null,
      principal_amount: Number(d.principal_amount),
      remaining_principal: Number(d.principal_amount),
      payment_schedule_id: d.payment_schedule_id,
      payments: []
    }));

    const receiptsFifo = receipts.map(r => ({
      id: r.id,
      amount: Number(r.amount),
      remaining_amount: Number(r.amount),
      consideration_date: r.consideration_date ? new Date(r.consideration_date) : new Date(r.receipt_date)
    }));

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

      // Calculate initial overdue principal before due_date has passed
      let overduePrincipal = d.principal_amount;
      const latePayments = [];

      for (const p of d.payments) {
        if (p.date <= dueDate) {
          overduePrincipal -= p.amount;
        } else {
          latePayments.push(p);
        }
      }

      if (overduePrincipal <= 0) continue;
      if (endDate <= dueDate) continue;

      // Post the late interest to ledger month by month
      let currentOverduePrincipal = overduePrincipal;
      const startUtc = parseDateToUtc(dueDate);
      const endUtc = parseDateToUtc(endDate);

      if (startUtc >= endUtc) {
        continue;
      }

      const overdueStart = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
      const overdueEnd = endUtc;

      let currentYear = overdueStart.getUTCFullYear();
      let currentMonth = overdueStart.getUTCMonth();
      const endYear = overdueEnd.getUTCFullYear();
      const endMonth = overdueEnd.getUTCMonth();

      const monthlyEntriesToCreate = [];

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

          // Find any payments made during this month range to calculate interest pro-rata
          const monthLatePayments = latePayments.filter(p => p.date >= rangeStart && p.date <= rangeEnd)
            .sort((a, b) => a.date - b.date);

          let monthInterest = 0;
          let tempDate = rangeStart;
          let tempPrincipal = currentOverduePrincipal;

          for (const lp of monthLatePayments) {
            const chunkDays = Math.round((lp.date.getTime() - tempDate.getTime()) / (1000 * 60 * 60 * 24));
            if (chunkDays > 0) {
              monthInterest += (tempPrincipal * 18 * chunkDays) / (365 * 100);
            }
            tempPrincipal -= lp.amount;
            tempDate = new Date(lp.date.getTime() + 24 * 60 * 60 * 1000);
          }

          const remainingDays = Math.round((rangeEnd.getTime() - tempDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          if (remainingDays > 0 && tempPrincipal > 0) {
            monthInterest += (tempPrincipal * 18 * remainingDays) / (365 * 100);
          }

          for (const lp of monthLatePayments) {
            currentOverduePrincipal -= lp.amount;
          }

          const roundedInterest = Math.round((monthInterest + Number.EPSILON) * 100) / 100;
          const gstAmount = Math.round((roundedInterest * 0.18 + Number.EPSILON) * 100) / 100;
          const totalAmount = Math.round((roundedInterest + gstAmount + Number.EPSILON) * 100) / 100;

          if (totalAmount > 0) {
            const isLastDay = isUtcLastDayOfMonth(rangeEnd);
            const isFinalSettlement = rangeEnd.getTime() === endUtc.getTime();

            if (isLastDay || isFinalSettlement) {
              monthlyEntriesToCreate.push({
                rangeStart,
                rangeEnd,
                daysOverdue,
                roundedInterest,
                gstAmount,
                totalAmount
              });
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
        const description = `Delayed payment interest for ${milestoneName} [Ref: ${d.demand_number}] for the period of ${formatUtcDMY(item.rangeStart)} to ${formatUtcDMY(item.rangeEnd)}`;

        await tx.ledger.create({
          data: {
            sales_order_id: order.id,
            customer_id: customerId,
            transaction_type: "LATE_FEE_INTEREST",
            amount: item.totalAmount,
            reference_date: item.rangeEnd,
            description: description,
            status: "UNPAID"
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
