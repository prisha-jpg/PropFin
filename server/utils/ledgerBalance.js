export async function calculateCustomerLedgerBalance(salesOrderId, prismaClient) {
  if (!salesOrderId) {
    return {
      outstanding_balance: 0,
      refundable_amount: 0,
      recoverable_amount: 0,
      total_receipts: 0,
      total_interest: 0,
    };
  }

  const order = await prismaClient.sales_orders.findUnique({
    where: { id: salesOrderId }
  });
  if (!order) {
    return {
      outstanding_balance: 0,
      refundable_amount: 0,
      recoverable_amount: 0,
      total_receipts: 0,
      total_interest: 0,
    };
  }

  // Load demands
  const demands = await prismaClient.demand_letters.findMany({
    where: { sales_order_id: salesOrderId }
  });

  // Load receipts
  const receipts = await prismaClient.customer_receipts.findMany({
    where: { sales_order_id: salesOrderId, status: { not: "bounced" } }
  });

  // Load adjustments
  const adjustments = await prismaClient.ledger.findMany({
    where: { sales_order_id: salesOrderId }
  });

  let totalDebits = 0;
  let totalCredits = 0;

  // Apply all debits from demands
  for (const d of demands) {
    totalDebits += Number(d.principal_amount || 0);
    totalDebits += Number(d.other_charges || 0); // GST
    totalDebits += Number(d.interest_amount || 0);
    totalDebits += Number(d.gst_on_interest || 0);
  }

  // Apply all credits from receipts
  for (const r of receipts) {
    totalCredits += Number(r.amount || 0);
    totalCredits += Number(r.tds_amount || 0);
  }

  // Apply adjustments / cancellation entries / reversal entries
  for (const l of adjustments) {
    const amount = Number(l.amount || 0);
    const isCredit = 
      l.transaction_type.includes("WAIVER") || 
      l.transaction_type.includes("CREDIT") || 
      l.transaction_type === "MILESTONE_REVERSAL" || 
      l.transaction_type === "GST_REVERSAL" || 
      l.transaction_type.endsWith("_REVERSAL_REVERSAL") ||
      amount < 0;

    let checkCredit = isCredit;
    if (l.transaction_type === "MILESTONE_REVERSAL_REVERSAL" || l.transaction_type === "GST_REVERSAL_REVERSAL") {
      checkCredit = false;
    }
    if (l.transaction_type === "RECEIPT_REVERSAL_REVERSAL" || l.transaction_type === "TDS_REVERSAL_REVERSAL" || l.transaction_type === "CANCELLATION_CHARGE_REVERSAL" || l.transaction_type === "CANCELLATION_GST_REVERSAL") {
      checkCredit = true;
    }

    if (checkCredit) {
      totalCredits += Math.abs(amount);
    } else {
      totalDebits += Math.abs(amount);
    }
  }

  const running_balance = Number((totalDebits - totalCredits).toFixed(2));
  const totalReceipts = receipts.reduce((sum, r) => sum + Number(r.amount || 0) + Number(r.tds_amount || 0), 0);

  let outstanding_balance = running_balance;
  if (order.status === "cancelled") {
    // For cancelled orders, net cash outstanding balance is: running_balance - totalReceipts
    outstanding_balance = Number((running_balance - totalReceipts).toFixed(2));
  }

  const refundable_amount = outstanding_balance < 0 ? Math.abs(outstanding_balance) : 0;
  const recoverable_amount = outstanding_balance > 0 ? outstanding_balance : 0;

  const interestFromDemands = demands.reduce((sum, d) => sum + Number(d.interest_amount || 0) + Number(d.gst_on_interest || 0), 0);
  const interestFromLedger = adjustments.filter(l => l.transaction_type === "LATE_FEE_INTEREST").reduce((sum, l) => sum + Number(l.amount || 0), 0);
  const totalInterest = interestFromDemands + interestFromLedger;

  return {
    outstanding_balance,
    refundable_amount,
    recoverable_amount,
    total_receipts: totalReceipts,
    total_interest: totalInterest,
  };
}
