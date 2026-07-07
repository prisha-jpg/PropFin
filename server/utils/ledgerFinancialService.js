import path from "node:path";
import fsSync from "node:fs";

const SETTINGS_FILE = path.join(process.cwd(), "server", "system_settings.json");

function getSettings() {
  let settings = { cancellation_charge_percent: 5, cancellation_gst_rate: 18 };
  try {
    if (fsSync.existsSync(SETTINGS_FILE)) {
      const data = fsSync.readFileSync(SETTINGS_FILE, "utf-8");
      settings = JSON.parse(data);
    }
  } catch (err) {
    console.warn("Failed to load settings file, using defaults", err);
  }
  return settings;
}

export const LedgerEventType = {
  MILESTONE: "MILESTONE",
  GST: "GST",
  RECEIPT: "RECEIPT",
  RECEIPT_REVERSAL: "RECEIPT_REVERSAL",
  INTEREST: "INTEREST",
  PENALTY: "PENALTY",
  REFUND: "REFUND",
  CANCELLATION_CHARGE: "CANCELLATION_CHARGE",
  CANCELLATION_GST: "CANCELLATION_GST",
  DEMAND_REVERSAL: "DEMAND_REVERSAL",
  GST_REVERSAL: "GST_REVERSAL",
  WRITE_OFF: "WRITE_OFF",
  ADJUSTMENT: "ADJUSTMENT"
};

export function mapDbTransactionTypeToEnum(dbType) {
  if (!dbType) return "ADJUSTMENT";
  const upper = dbType.toUpperCase();
  if (upper === "MILESTONE" || upper === "MILESTONE_REVERSAL_REVERSAL") return "MILESTONE";
  if (upper === "GST" || upper === "GST_REVERSAL_REVERSAL") return "GST";
  if (upper === "RECEIPT" || upper === "RECEIPT_REVERSAL_REVERSAL" || upper === "TDS_REVERSAL_REVERSAL") return "RECEIPT";
  
  if (upper === "RECEIPT_REVERSAL" || upper === "REVERSAL") return "RECEIPT_REVERSAL";
  if (upper === "LATE_FEE_INTEREST" || upper === "INTEREST") return "INTEREST";
  if (upper === "PENALTY") return "PENALTY";
  if (upper === "REFUND") return "REFUND";
  if (upper === "CANCELLATION_CHARGE" || upper === "CANCELLATION_CHARGE_REVERSAL") return "CANCELLATION_CHARGE";
  if (upper === "CANCELLATION_GST" || upper === "CANCELLATION_GST_REVERSAL") return "CANCELLATION_GST";
  
  if (upper === "DEMAND_REVERSAL" || upper === "MILESTONE_REVERSAL") return "DEMAND_REVERSAL";
  if (upper === "GST_REVERSAL") return "GST_REVERSAL";
  if (upper === "WRITE_OFF") return "WRITE_OFF";
  
  return "ADJUSTMENT";
}

export function getHumanReadableType(enumVal) {
  const mapping = {
    MILESTONE: "Milestone",
    GST: "GST",
    RECEIPT: "Receipt",
    RECEIPT_REVERSAL: "Receipt Reversal",
    INTEREST: "Interest",
    PENALTY: "Penalty",
    REFUND: "Refund",
    CANCELLATION_CHARGE: "Cancellation Charge",
    CANCELLATION_GST: "Cancellation GST",
    DEMAND_REVERSAL: "Demand Reversal",
    GST_REVERSAL: "GST Reversal",
    WRITE_OFF: "Write Off",
    ADJUSTMENT: "Adjustment"
  };
  return mapping[enumVal] || "Adjustment";
}

export async function postLedgerEntry(tx, {
  sales_order_id,
  customer_id,
  transaction_type,
  amount,
  reference_date,
  description,
  reference_no = null,
  ledger_reference_type = null,
  ledger_reference_id = null,
  cancellation_request_id = null,
  financial_snapshot_version = 1,
  created_by = null,
  journal_voucher_no = null
}) {
  const isCredit = checkIsCredit(transaction_type, amount);
  const debitVal = isCredit ? 0 : Math.abs(Number(amount));
  const creditVal = isCredit ? Math.abs(Number(amount)) : 0;

  const lastEntry = await tx.ledger.findFirst({
    where: { customer_id },
    orderBy: { created_at: "desc" }
  });
  const prevBalance = lastEntry ? Number(lastEntry.running_balance || 0) : 0;
  const runningBalance = prevBalance + debitVal - creditVal;

  return await tx.ledger.create({
    data: {
      sales_order_id,
      customer_id,
      transaction_type,
      amount,
      reference_date: reference_date || new Date(),
      description,
      status: "UNPAID",
      ledger_reference_type,
      ledger_reference_id,
      cancellation_request_id,
      financial_snapshot_version,
      reference_no,
      debit: debitVal,
      credit: creditVal,
      running_balance: runningBalance,
      created_by,
      journal_voucher_no
    }
  });
}

export function checkIsCredit(type, amount) {
  if (type === "REFUND") return false;
  const isCredit = 
    type.includes("WAIVER") || 
    type.includes("CREDIT") || 
    type === "MILESTONE_REVERSAL" || 
    type === "GST_REVERSAL" || 
    type.endsWith("_REVERSAL_REVERSAL") ||
    amount < 0;

  let checkCredit = isCredit;
  if (type === "MILESTONE_REVERSAL_REVERSAL" || type === "GST_REVERSAL_REVERSAL") {
    checkCredit = false;
  }
  if (type === "RECEIPT_REVERSAL_REVERSAL" || type === "TDS_REVERSAL_REVERSAL" || type === "CANCELLATION_CHARGE_REVERSAL" || type === "CANCELLATION_GST_REVERSAL") {
    checkCredit = true;
  }
  return checkCredit;
}

export function buildLedgerEntries(demands, receipts, adjustments) {
  const entries = [];

  demands.forEach(d => {
    const principal = Number(d.principal_amount || 0);
    const gst = Number(d.other_charges || 0);
    const interest = Number(d.interest_amount || 0);
    const interestGst = Number(d.gst_on_interest || 0);

    if (principal > 0) {
      entries.push({
        id: `dem-prl-${d.id}`,
        transaction_date: d.demand_date,
        consideration_date: d.demand_date,
        transactionType: "MILESTONE",
        type: "Milestone",
        referenceNo: d.demand_number,
        narration: `${d.demand_number} - Milestone Demand`,
        debit: principal,
        credit: 0,
        is_posted: true
      });
    }

    if (gst > 0) {
      entries.push({
        id: `dem-gst-${d.id}`,
        transaction_date: d.demand_date,
        consideration_date: d.demand_date,
        transactionType: "GST",
        type: "GST",
        referenceNo: d.demand_number,
        narration: `GST on Booking [Ref: ${d.demand_number}]`,
        debit: gst,
        credit: 0,
        is_posted: true
      });
    }

    if (interest > 0 || interestGst > 0) {
      entries.push({
        id: `int-${d.id}`,
        transaction_date: d.demand_date,
        consideration_date: d.demand_date,
        transactionType: "INTEREST",
        type: "Interest",
        referenceNo: d.demand_number,
        narration: `Delayed Payment Interest on ${d.demand_number}`,
        debit: interest + interestGst,
        credit: 0,
        is_posted: true
      });
    }
  });

  receipts.forEach(r => {
    entries.push({
      id: `rec-${r.id}`,
      transaction_date: r.receipt_date,
      consideration_date: r.consideration_date || r.receipt_date,
      transactionType: "RECEIPT",
      type: "Receipt",
      referenceNo: r.receipt_number,
      narration: `Receipt Ref: ${r.receipt_number}`,
      debit: 0,
      credit: Number(r.amount || 0) + Number(r.tds_amount || 0),
      is_posted: true
    });
  });

  adjustments.forEach(l => {
    const amount = Number(l.amount || 0);
    const checkCredit = checkIsCredit(l.transaction_type, amount);

    let debitVal = checkCredit ? 0 : Math.abs(amount);
    let creditVal = checkCredit ? Math.abs(amount) : 0;

    if (l.transaction_type === "RECEIPT_REVERSAL") {
      debitVal = 0;
      creditVal = 0;
    }

    const transactionType = mapDbTransactionTypeToEnum(l.transaction_type);

    entries.push({
      id: l.id,
      transaction_date: l.reference_date,
      consideration_date: l.reference_date,
      transactionType: transactionType,
      type: getHumanReadableType(transactionType),
      referenceNo: l.reference_no || null,
      narration: l.journal_voucher_no ? `${l.description || l.transaction_type} [JV: ${l.journal_voucher_no}]` : (l.description || l.transaction_type),
      debit: debitVal,
      credit: creditVal,
      is_posted: true
    });
  });

  entries.sort((a, b) => {
    const dateA = new Date(a.transaction_date).getTime();
    const dateB = new Date(b.transaction_date).getTime();
    if (dateA !== dateB) return dateA - dateB;
    
    const priorityA = a.debit > 0 ? 1 : 2;
    const priorityB = b.debit > 0 ? 1 : 2;
    return priorityA - priorityB;
  });

  let running_balance = 0;
  return entries.map(e => {
    running_balance = running_balance + e.debit - e.credit;
    return {
      ...e,
      net_balance: running_balance
    };
  });
}

export function getLedgerSummarySync(order, settings = null) {
  const currentSettings = settings || getSettings();
  const agreementValue = Number(order.agreement_value || order.basic_sale_value || 0);

  const demands = order.demand_letters || [];
  const receipts = (order.customer_receipts || []).filter(r => r.status !== "bounced");
  const adjustments = order.ledger || [];

  const amountPaid = receipts.reduce((sum, r) => sum + Number(r.amount || 0) + Number(r.tds_amount || 0), 0);

  // Interest retains
  let totalInterest = demands.reduce((sum, d) => sum + Number(d.interest_amount || 0) + Number(d.gst_on_interest || 0), 0);
  let cancellationCharges = 0; // Cancellation Fee
  let gstOnCancellation = 0; // Other Recoverable Charges (mapped to forfeiture_amount in DB)
  let milestoneReversalSum = 0;
  let hasCancellationCharges = false;
  let totalRefundsPaid = 0;

  for (const l of adjustments) {
    const amount = Number(l.amount || 0);
    if (l.transaction_type === "LATE_FEE_INTEREST") {
      totalInterest += amount;
    }
    if (l.transaction_type === "CANCELLATION_CHARGE") {
      cancellationCharges = Math.abs(amount);
      hasCancellationCharges = true;
    }
    if (l.transaction_type === "CANCELLATION_GST") {
      gstOnCancellation = Math.abs(amount);
    }
    if (l.transaction_type === "MILESTONE_REVERSAL") {
      milestoneReversalSum += Math.abs(amount);
    }
    if (l.transaction_type === "REFUND") {
      totalRefundsPaid += amount;
    }
  }

  // If cancellation is not yet finalized in ledger, calculate dynamically
  if (!hasCancellationCharges) {
    const chargePercent = Number(currentSettings.cancellation_charge_percent ?? 0.5);
    cancellationCharges = agreementValue * (chargePercent / 100);

    // Look up from order's cancellation_requests if present
    if (order.cancellation_requests && order.cancellation_requests.length > 0) {
      const activeReq = order.cancellation_requests.find(r => r.status !== "revoked" && r.status !== "rejected");
      if (activeReq) {
        gstOnCancellation = Number(activeReq.forfeiture_amount || 0);
      }
    }
  }

  const totalRecoveries = cancellationCharges + totalInterest + gstOnCancellation;
  const netPayable = amountPaid - totalRecoveries;

  let outstandingBalance = 0;
  if (order.status === "cancelled") {
    outstandingBalance = Number((-netPayable + totalRefundsPaid).toFixed(2));
  } else {
    // Normal active order outstanding balance
    let debits = 0;
    let credits = 0;
    for (const d of demands) {
      debits += Number(d.principal_amount || 0) + Number(d.other_charges || 0) + Number(d.interest_amount || 0) + Number(d.gst_on_interest || 0);
    }
    credits += amountPaid;

    for (const l of adjustments) {
      if (l.transaction_type === "RECEIPT_REVERSAL") continue;
      const amount = Number(l.amount || 0);
      const checkCredit = checkIsCredit(l.transaction_type, amount);
      if (checkCredit) {
        credits += Math.abs(amount);
      } else {
        debits += Math.abs(amount);
      }
    }
    outstandingBalance = Number((debits - credits).toFixed(2));
  }

  let settlementStatus = "Payable by Customer";
  if (netPayable > 0) {
    settlementStatus = "Refund Pending";
    if (order.refund_requests && order.refund_requests.length > 0) {
      const activeRefund = order.refund_requests.find(r => r.status !== "rejected" && r.status !== "cancelled");
      if (activeRefund) {
        if (activeRefund.status === "disbursed") {
          settlementStatus = "Settlement Completed";
        } else if (activeRefund.status === "approved" || activeRefund.status === "bank_processing") {
          settlementStatus = "Refund Approved";
        }
      }
    }
  } else if (netPayable === 0) {
    settlementStatus = "Fully Settled";
  }

  if (order.status === "cancelled" && Math.abs(outstandingBalance) < 0.01) {
    settlementStatus = "Settlement Completed";
  }

  const ledgerEntries = buildLedgerEntries(demands, receipts, adjustments);

  let receiptReversalsSum = 0;
  for (const l of adjustments) {
    if (l.transaction_type === "RECEIPT_REVERSAL") {
      receiptReversalsSum += Math.abs(Number(l.amount || 0));
    }
  }
  const amountReceivedToDate = Number((amountPaid - receiptReversalsSum).toFixed(2));

  return {
    agreementValue,
    totalDebits: order.status === "cancelled" ? totalRecoveries : (outstandingBalance > 0 ? outstandingBalance : 0),
    totalCredits: amountPaid,
    totalInterest,
    cancellationCharges,
    gstOnCancellation,
    outstandingBalance,
    refundableAmount: netPayable,
    amountPaid,
    ledgerEntries,
    // Unified settlement variables
    totalRecoveries,
    netPayable,
    settlementStatus,
    milestonePrincipalReversed: milestoneReversalSum,
    amountReceivedToDate
  };
}

export async function getLedgerSummary(salesOrderId, prisma) {
  if (!salesOrderId) {
    return {
      agreementValue: 0,
      totalDebits: 0,
      totalCredits: 0,
      totalInterest: 0,
      cancellationCharges: 0,
      gstOnCancellation: 0,
      outstandingBalance: 0,
      refundableAmount: 0,
      amountPaid: 0,
      ledgerEntries: []
    };
  }

  const order = await prisma.sales_orders.findUnique({
    where: { id: salesOrderId },
    include: {
      demand_letters: true,
      customer_receipts: true,
      ledger: true
    }
  });

  if (!order) {
    return {
      agreementValue: 0,
      totalDebits: 0,
      totalCredits: 0,
      totalInterest: 0,
      cancellationCharges: 0,
      gstOnCancellation: 0,
      outstandingBalance: 0,
      refundableAmount: 0,
      amountPaid: 0,
      ledgerEntries: []
    };
  }

  return getLedgerSummarySync(order);
}

// FinancialCalculationService Object implementation
export const FinancialCalculationService = {
  calculateOutstanding: async (orderId, prisma) => {
    const summary = await getLedgerSummary(orderId, prisma);
    return summary.outstandingBalance;
  },

  calculateCancellation: async (orderId, prisma) => {
    const summary = await getLedgerSummary(orderId, prisma);
    return {
      cancellationCharges: summary.cancellationCharges,
      gstOnCancellation: summary.gstOnCancellation,
      totalDeduction: summary.cancellationCharges + summary.gstOnCancellation
    };
  },

  calculateRefund: async (orderId, prisma) => {
    const summary = await getLedgerSummary(orderId, prisma);
    return summary.refundableAmount;
  },

  calculateLedgerBalance: async (orderId, prisma) => {
    const summary = await getLedgerSummary(orderId, prisma);
    return {
      agreementValue: summary.agreementValue,
      totalDebits: summary.totalDebits,
      totalCredits: summary.totalCredits,
      outstandingBalance: summary.outstandingBalance,
      amountPaid: summary.amountPaid
    };
  },

  generateLedgerEntries: async (orderId, prisma) => {
    const summary = await getLedgerSummary(orderId, prisma);
    return summary.ledgerEntries;
  },

  reverseCancellation: async (orderId, prisma, tx, requestId) => {
    const currentRequest = await tx.cancellation_requests.findFirst({
      where: { sales_order_id: orderId, id: requestId }
    });
    if (!currentRequest) return;

    const customerId = currentRequest.customer_id;
    const cancellationLedgerEntries = await tx.ledger.findMany({
      where: {
        sales_order_id: orderId,
        cancellation_request_id: requestId
      }
    });

    const milestoneReversals = cancellationLedgerEntries.filter(l => l.transaction_type === "MILESTONE_REVERSAL");
    for (const mr of milestoneReversals) {
      await postLedgerEntry(tx, {
        sales_order_id: orderId,
        customer_id: customerId,
        transaction_type: "MILESTONE_REVERSAL_REVERSAL",
        amount: Math.abs(Number(mr.amount)),
        reference_date: new Date(),
        description: `Reversal of Milestone Reversal [Ref: ${mr.description}]`,
        ledger_reference_type: "CancellationReversal",
        ledger_reference_id: requestId,
        cancellation_request_id: requestId,
        financial_snapshot_version: 1,
        reference_no: mr.reference_no
      });
    }

    const gstReversals = cancellationLedgerEntries.filter(l => l.transaction_type === "GST_REVERSAL");
    for (const gr of gstReversals) {
      await postLedgerEntry(tx, {
        sales_order_id: orderId,
        customer_id: customerId,
        transaction_type: "GST_REVERSAL_REVERSAL",
        amount: Math.abs(Number(gr.amount)),
        reference_date: new Date(),
        description: `Reversal of GST Reversal [Ref: ${gr.description}]`,
        ledger_reference_type: "CancellationReversal",
        ledger_reference_id: requestId,
        cancellation_request_id: requestId,
        financial_snapshot_version: 1,
        reference_no: gr.reference_no
      });
    }

    const receiptReversals = cancellationLedgerEntries.filter(l => l.transaction_type === "RECEIPT_REVERSAL");
    for (const rr of receiptReversals) {
      await postLedgerEntry(tx, {
        sales_order_id: orderId,
        customer_id: customerId,
        transaction_type: "RECEIPT_REVERSAL_REVERSAL",
        amount: -Number(rr.amount),
        reference_date: new Date(),
        description: `Reversal of Receipt Reversal [Ref: ${rr.description}]`,
        ledger_reference_type: "CancellationReversal",
        ledger_reference_id: requestId,
        cancellation_request_id: requestId,
        financial_snapshot_version: 1,
        reference_no: rr.reference_no
      });
    }

    const tdsReversals = cancellationLedgerEntries.filter(l => l.transaction_type === "TDS_REVERSAL");
    for (const tr of tdsReversals) {
      await postLedgerEntry(tx, {
        sales_order_id: orderId,
        customer_id: customerId,
        transaction_type: "TDS_REVERSAL_REVERSAL",
        amount: -Number(tr.amount),
        reference_date: new Date(),
        description: `Reversal of TDS Reversal [Ref: ${tr.description}]`,
        ledger_reference_type: "CancellationReversal",
        ledger_reference_id: requestId,
        cancellation_request_id: requestId,
        financial_snapshot_version: 1,
        reference_no: tr.reference_no
      });
    }

    const chargesEntry = cancellationLedgerEntries.find(l => l.transaction_type === "CANCELLATION_CHARGE");
    if (chargesEntry) {
      await postLedgerEntry(tx, {
        sales_order_id: orderId,
        customer_id: customerId,
        transaction_type: "CANCELLATION_CHARGE_REVERSAL",
        amount: -Number(chargesEntry.amount),
        reference_date: new Date(),
        description: `Reversal of Agreement Cancellation Charges`,
        ledger_reference_type: "CancellationReversal",
        ledger_reference_id: requestId,
        cancellation_request_id: requestId,
        financial_snapshot_version: 1,
        reference_no: chargesEntry.reference_no
      });
    }

    const gstEntry = cancellationLedgerEntries.find(l => l.transaction_type === "CANCELLATION_GST");
    if (gstEntry) {
      await postLedgerEntry(tx, {
        sales_order_id: orderId,
        customer_id: customerId,
        transaction_type: "CANCELLATION_GST_REVERSAL",
        amount: -Number(gstEntry.amount),
        reference_date: new Date(),
        description: `Reversal of GST on Cancellation Charges`,
        ledger_reference_type: "CancellationReversal",
        ledger_reference_id: requestId,
        cancellation_request_id: requestId,
        financial_snapshot_version: 1,
        reference_no: gstEntry.reference_no
      });
    }
  },

  restoreBooking: async (orderId, prisma, tx, unitId) => {
    await tx.sales_orders.update({
      where: { id: orderId },
      data: {
        status: "open_order",
        cancellation_date: null
      }
    });

    await tx.units.update({
      where: { id: unitId },
      data: { status: "booked" }
    });

    await tx.demand_letters.updateMany({
      where: { sales_order_id: orderId, status: "cancelled" },
      data: { status: "generated" }
    });
  }
};
