
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import assert from "node:assert";
import { syncHistoricalInterest } from "../utils/interestCalculator.js";

const JWT_SECRET = process.env.JWT_SECRET || "propfin-default-jwt-secret-key-32-chars-long";

const generateToken = (payload) => {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 24 * 60 * 60 * 1000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
};

async function runTests() {
  console.log("Starting Unit Cancellation & Configurable Charges Integration Tests...\n");

  const prisma = new PrismaClient();
  let serverProcess = null;
  const port = 4025;

  let customer = null;
  let project = null;
  let unit = null;
  let salesOrder = null;
  let demand = null;
  let receipt = null;
  let cancellationRequest = null;
  let originalBalance = 0;

  try {
    // 1. Setup DB Seed Data
    customer = await prisma.customers.findFirst();
    project = await prisma.projects.findFirst();
    unit = await prisma.units.findFirst();

    if (!customer || !project || !unit) {
      console.log("⚠️ Skipping test because seed data is missing.");
      return;
    }

    // Clean up any left-over test records from previous runs
    console.log("Cleaning up left-over test records...");
    await prisma.cancellation_requests.deleteMany({
      where: { request_number: { startsWith: "CAN" } }
    }).catch(() => {});
    await prisma.ledger.deleteMany({
      where: {
        OR: [
          { ledger_id: { startsWith: "LDG-REV-" } },
          { description: { contains: "Agreement Cancellation Fee" } },
          { description: { contains: "Agreement Cancellation Charges" } },
          { description: { contains: "GST on Cancellation" } },
          { transaction_type: { in: ["MILESTONE_REVERSAL", "GST_REVERSAL", "MILESTONE_REVERSAL_REVERSAL", "GST_REVERSAL_REVERSAL", "CANCELLATION_CHARGE", "CANCELLATION_CHARGE_REVERSAL", "CANCELLATION_GST", "CANCELLATION_GST_REVERSAL"] } }
        ]
      }
    }).catch(() => {});
    await prisma.customer_receipts.deleteMany({
      where: { receipt_number: { startsWith: "TRCT-CAN-" } }
    }).catch(() => {});
    await prisma.demand_letters.deleteMany({
      where: { demand_number: { startsWith: "TDL-CAN-" } }
    }).catch(() => {});
    await prisma.sales_orders.deleteMany({
      where: { order_number: { startsWith: "TSO-CAN-" } }
    }).catch(() => {});

    // Sync historical interest first to establish a clean baseline balance
    await syncHistoricalInterest(customer.id, prisma);
    const baselineCust = await prisma.customers.findUnique({ where: { id: customer.id } });
    originalBalance = Number(baselineCust.total_outstanding_balance || 0);

    // Update unit to occupied first to test status revert later
    await prisma.units.update({
      where: { id: unit.id },
      data: { status: "booked" }
    });

    // 2. Start server
    serverProcess = spawn("node", ["server/index.js"], {
      stdio: "inherit",
      env: {
        ...process.env,
        API_PORT: String(port)
      }
    });

    // Wait for server to start
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const token = generateToken({ id: "c8d8e05b-b79d-4075-ac46-6b6f6894f54a", email: "admin@propfin.com" });

    // 3. Configure/Get system settings
    console.log("Fetching system settings...");
    const settingsRes = await fetch(`http://127.0.0.1:${port}/api/system-settings`);
    assert.strictEqual(settingsRes.status, 200);
    const settings = await settingsRes.json();
    console.log("Loaded Settings:", settings);

    // Save custom settings for testing
    console.log("Saving custom settings (5% charges, 18% GST)...");
    const saveSettingsRes = await fetch(`http://127.0.0.1:${port}/api/system-settings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        cancellation_charge_percent: 5.0,
        cancellation_gst_rate: 18.0
      })
    });
    assert.strictEqual(saveSettingsRes.status, 200);
    const savedSettings = await saveSettingsRes.json();
    assert.strictEqual(savedSettings.settings.cancellation_charge_percent, 5.0);
    assert.strictEqual(savedSettings.settings.cancellation_gst_rate, 18.0);
    console.log("✅ Custom settings saved successfully.");

    // 4. Create transient Sales Order & related demands/receipts
    salesOrder = await prisma.sales_orders.create({
      data: {
        order_number: `TSO-CAN-${Date.now().toString(36).toUpperCase()}`,
        customer_id: customer.id,
        project_id: project.id,
        unit_id: unit.id,
        booking_date: new Date(),
        status: "open_order",
        agreement_value: 500000.0,
        basic_sale_value: 500000.0,
      }
    });

    demand = await prisma.demand_letters.create({
      data: {
        demand_number: `TDL-CAN-${Date.now().toString(36).toUpperCase()}`,
        sales_order_id: salesOrder.id,
        customer_id: customer.id,
        demand_date: new Date(),
        due_date: new Date(),
        principal_amount: 500000.0,
        other_charges: 25000.0, // GST on demand (5%)
        status: "generated"
      }
    });

    receipt = await prisma.customer_receipts.create({
      data: {
        receipt_number: `TRCT-CAN-${Date.now().toString(36).toUpperCase()}`,
        sales_order_id: salesOrder.id,
        customer_id: customer.id,
        amount: 100000.0, // paid 100k
        payment_mode: "bank_transfer",
        receipt_date: new Date(),
        status: "received"
      }
    });

    // 5. Create Cancellation Request
    console.log("Creating cancellation request...");
    const createReqRes = await fetch(`http://127.0.0.1:${port}/api/entities/CancellationRequest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        sales_order_id: salesOrder.id,
        customer_id: customer.id,
        reason: "financial",
        remarks: "Unable to pay",
        amount_received: 100000,
        admin_charges: 2500, // 0.5% of 500k
        other_recoverable_charges: 0,
        deduction_amount: 2500,
        refund_amount: 97500,
        penalty_rate: 0.5,
        status: "pending"
      })
    });

    assert.strictEqual(createReqRes.status, 201);
    cancellationRequest = await createReqRes.json();
    assert.strictEqual(cancellationRequest.status, "pending");
    assert.strictEqual(Number(cancellationRequest.cancellation_charges), 2500);
    assert.strictEqual(Number(cancellationRequest.forfeiture_amount), 0); // forfeiture_amount stores other_recoverable_charges
    console.log("✅ Cancellation request created successfully in pending status.");

    // 6. Approve Cancellation Request
    console.log("Approving cancellation request...");
    const approveRes = await fetch(`http://127.0.0.1:${port}/api/entities/CancellationRequest/${cancellationRequest.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        status: "approved",
        approval_date: new Date().toISOString().split("T")[0]
      })
    });

    assert.strictEqual(approveRes.status, 200);
    const approvedRequest = await approveRes.json();
    assert.strictEqual(approvedRequest.status, "approved");
    console.log("✅ Cancellation request status set to approved.");

    // 7. Verify Sales Order and Unit statuses
    const updatedOrder = await prisma.sales_orders.findUnique({
      where: { id: salesOrder.id }
    });
    assert.strictEqual(updatedOrder.status, "cancelled");
    assert.ok(updatedOrder.cancellation_date);
    console.log("✅ Verified: Sales order status set to 'cancelled'.");

    const updatedUnit = await prisma.units.findUnique({
      where: { id: unit.id }
    });
    assert.strictEqual(updatedUnit.status, "cancelled");
    console.log("✅ Verified: Unit status set to 'cancelled'.");

    // 8. Verify Ledger Reversal Postings
    const ledgerEntries = await prisma.ledger.findMany({
      where: { sales_order_id: salesOrder.id }
    });

    // We expect the following entries in ledger:
    // - Reversal of Demand Principal (credit): MILESTONE_REVERSAL, amount: -500000
    // - Reversal of Demand GST (credit): GST_REVERSAL, amount: -25000
    // - Cancellation charges (debit): CANCELLATION_CHARGE, amount: 2500
    console.log("Created Ledger Entries:", ledgerEntries.map(l => ({ type: l.transaction_type, amount: l.amount, desc: l.description })));
    assert.strictEqual(ledgerEntries.length, 3);

    const demandReversal = ledgerEntries.find(l => l.transaction_type === "MILESTONE_REVERSAL" && l.description.includes("Principal"));
    assert.ok(demandReversal);
    assert.strictEqual(Number(demandReversal.amount), -500000);
    assert.strictEqual(Number(demandReversal.credit), 500000);
    assert.strictEqual(Number(demandReversal.debit), 0);
    assert.ok(demandReversal.reference_no);

    const gstReversal = ledgerEntries.find(l => l.transaction_type === "GST_REVERSAL" && l.description.includes("GST"));
    assert.ok(gstReversal);
    assert.strictEqual(Number(gstReversal.amount), -25000);
    assert.strictEqual(Number(gstReversal.credit), 25000);
    assert.strictEqual(Number(gstReversal.debit), 0);
    assert.ok(gstReversal.reference_no);

    const chargeEntry = ledgerEntries.find(l => l.transaction_type === "CANCELLATION_CHARGE");
    assert.ok(chargeEntry);
    assert.strictEqual(Number(chargeEntry.amount), 2500);
    assert.strictEqual(Number(chargeEntry.debit), 2500);
    assert.strictEqual(Number(chargeEntry.credit), 0);
    assert.ok(chargeEntry.reference_no);

    console.log("✅ Verified: All offset and cancellation charge ledger entries successfully created.");

    // Customer outstanding balance should be originalBalance - 97500
    const updatedCustomer = await prisma.customers.findUnique({
      where: { id: customer.id }
    });
    assert.strictEqual(Number(updatedCustomer.total_outstanding_balance), originalBalance - 97500);
    console.log("✅ Verified: Customer outstanding balance successfully recalculated (includes cancellation charges).");

    // == REFUND WORKFLOW TESTS ==
    console.log("\nStarting Refund Workflow tests...");
    
    // 1. Create Refund Request
    console.log("Creating refund request...");
    const refundCreateRes = await fetch(`http://127.0.0.1:${port}/api/entities/RefundRequest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        sales_order_id: salesOrder.id,
        customer_id: customer.id,
        refund_amount: 97500,
        account_holder_name: "Test User",
        account_number: "1234567890",
        ifsc_code: "ICIC0001234",
        payment_mode: "neft"
      })
    });
    assert.strictEqual(refundCreateRes.status, 201);
    const refundRequestObj = await refundCreateRes.json();
    assert.strictEqual(refundRequestObj.status, "pending");
    assert.strictEqual(Number(refundRequestObj.refund_amount), 97500);
    console.log("✅ Refund request created in pending status.");

    // Verify ledger has not changed yet (should still be 3 entries)
    const ledgerAfterReq = await prisma.ledger.findMany({
      where: { sales_order_id: salesOrder.id }
    });
    assert.strictEqual(ledgerAfterReq.length, 3);
    console.log("✅ Verified: Refund request creation did not post any ledger entries.");

    // 2. Test duplicate protection
    console.log("Testing duplicate refund request prevention...");
    const refundDupRes = await fetch(`http://127.0.0.1:${port}/api/entities/RefundRequest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        sales_order_id: salesOrder.id,
        customer_id: customer.id,
        refund_amount: 97500
      })
    });
    assert.strictEqual(refundDupRes.status, 409);
    console.log("✅ Verified: Duplicate refund request prevented (409).");

    // 3. Disburse the Refund
    console.log("Disbursing the refund...");
    const refundDisburseRes = await fetch(`http://127.0.0.1:${port}/api/entities/RefundRequest/${refundRequestObj.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        status: "disbursed",
        transaction_reference: "UTR-TEST-12345"
      })
    });
    assert.strictEqual(refundDisburseRes.status, 200);
    const disbursedRequest = await refundDisburseRes.json();
    assert.strictEqual(disbursedRequest.status, "disbursed");
    assert.ok(disbursedRequest.journal_voucher_no);
    assert.strictEqual(disbursedRequest.transaction_reference, "UTR-TEST-12345");
    console.log("✅ Refund disbursed successfully.");

    // 4. Verify Ledger Posting for Refund
    const ledgerAfterDisburse = await prisma.ledger.findMany({
      where: { sales_order_id: salesOrder.id }
    });
    assert.strictEqual(ledgerAfterDisburse.length, 4);
    const refundLedger = ledgerAfterDisburse.find(l => l.transaction_type === "REFUND");
    assert.ok(refundLedger);
    assert.strictEqual(Number(refundLedger.amount), 97500);
    assert.strictEqual(Number(refundLedger.debit), 97500);
    assert.strictEqual(Number(refundLedger.credit), 0);
    assert.strictEqual(refundLedger.journal_voucher_no, disbursedRequest.journal_voucher_no);
    console.log("✅ Verified: Refund ledger entry posted correctly with Debit and JV link.");

    // 5. Verify Outstanding Balance has been settled
    const customerAfterDisburse = await prisma.customers.findUnique({
      where: { id: customer.id }
    });
    assert.strictEqual(Number(customerAfterDisburse.total_outstanding_balance), originalBalance);
    console.log("✅ Verified: Customer outstanding balance successfully settled to baseline.");

    // Cleanup the refund request for subsequent tests
    await prisma.refund_requests.delete({ where: { id: refundRequestObj.id } });
    await prisma.ledger.delete({ where: { id: refundLedger.id } });

    // 9. Re-run approval to verify idempotency (should skip all logic and not create duplicates)
    console.log("Re-approving cancellation request (idempotency verification)...");
    const reApproveRes = await fetch(`http://127.0.0.1:${port}/api/entities/CancellationRequest/${cancellationRequest.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        status: "approved",
        approval_date: new Date().toISOString().split("T")[0]
      })
    });
    const reApproveBody = await reApproveRes.json();
    console.log("Re-approve HTTP status:", reApproveRes.status, "body:", JSON.stringify(reApproveBody));
    assert.strictEqual(reApproveRes.status, 200);
    const reApproveData = reApproveBody;
    assert.strictEqual(reApproveData.status, "approved");

    const postReApproveLedgerEntries = await prisma.ledger.findMany({
      where: { sales_order_id: salesOrder.id }
    });
    assert.strictEqual(postReApproveLedgerEntries.length, 3);
    console.log("✅ Verified: Re-approving did not create duplicate ledger entries.");

    // 10. Verify preventing duplicate cancellation requests
    console.log("Verifying multiple cancellation prevention...");
    const dupRes = await fetch(`http://127.0.0.1:${port}/api/entities/CancellationRequest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        sales_order_id: salesOrder.id,
        customer_id: customer.id,
        reason: "personal",
        status: "pending"
      })
    });
    const dupBody = await dupRes.json();
    console.log("Duplicate creation response:", dupRes.status, dupBody);
    assert.strictEqual(dupRes.status, 409);
    assert.ok(dupBody.message.includes("CANCELLATION_ALREADY_EXISTS"));
    console.log("✅ Verified: Prevented duplicate cancellation request creation.");

    // 11. Verify Cancel Cancellation (Revocation) workflow
    console.log("Testing Cancel Cancellation (Revocation) workflow...");
    const revokeRes = await fetch(`http://127.0.0.1:${port}/api/entities/CancellationRequest/${cancellationRequest.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        status: "revoked"
      })
    });
    assert.strictEqual(revokeRes.status, 200);
    const revokedRequest = await revokeRes.json();
    assert.strictEqual(revokedRequest.status, "revoked");
    console.log("✅ Revocation API call succeeded.");

    // Verify Sales Order status is restored to open_order
    const restoredOrder = await prisma.sales_orders.findUnique({
      where: { id: salesOrder.id }
    });
    assert.strictEqual(restoredOrder.status, "open_order");
    assert.strictEqual(restoredOrder.cancellation_date, null);
    console.log("✅ Verified: Sales order restored to 'open_order'.");

    // Verify Unit status is restored to booked
    const restoredUnit = await prisma.units.findUnique({
      where: { id: unit.id }
    });
    assert.strictEqual(restoredUnit.status, "booked");
    console.log("✅ Verified: Unit restored to 'booked'.");

    // Verify ledger entries after revocation
    const finalLedgerEntries = await prisma.ledger.findMany({
      where: { sales_order_id: salesOrder.id }
    });
    console.log("Final Ledger Entries (after revocation):", finalLedgerEntries.map(l => ({ type: l.transaction_type, amount: l.amount })));
    
    // Original 3 entries + 3 reversal entries = 6 entries total
    assert.strictEqual(finalLedgerEntries.length, 6);

    const chargeRev = finalLedgerEntries.find(l => l.transaction_type === "CANCELLATION_CHARGE_REVERSAL");
    assert.ok(chargeRev);
    assert.strictEqual(Number(chargeRev.amount), -2500);

    const milestoneRevRev = finalLedgerEntries.find(l => l.transaction_type === "MILESTONE_REVERSAL_REVERSAL");
    assert.ok(milestoneRevRev);
    assert.strictEqual(Number(milestoneRevRev.amount), 500000);

    const gstRevRev = finalLedgerEntries.find(l => l.transaction_type === "GST_REVERSAL_REVERSAL");
    assert.ok(gstRevRev);
    assert.strictEqual(Number(gstRevRev.amount), 25000);

    console.log("✅ Verified: Ledger entries correctly restored via reversal-reversals.");

  } catch (error) {
    console.error("❌ Test run failed:", error);
    process.exitCode = 1;
  } finally {
    // 10. Clean up
    console.log("\nCleaning up test records...");
    if (serverProcess) {
      serverProcess.kill();
    }
    if (cancellationRequest) {
      await prisma.cancellation_requests.delete({ where: { id: cancellationRequest.id } }).catch(() => {});
    }
    if (salesOrder) {
      await prisma.refund_requests.deleteMany({ where: { sales_order_id: salesOrder.id } }).catch(() => {});
      await prisma.ledger.deleteMany({ where: { sales_order_id: salesOrder.id } }).catch(() => {});
      await prisma.customer_receipts.deleteMany({ where: { sales_order_id: salesOrder.id } }).catch(() => {});
      await prisma.demand_letters.deleteMany({ where: { sales_order_id: salesOrder.id } }).catch(() => {});
      await prisma.sales_orders.delete({ where: { id: salesOrder.id } }).catch(() => {});
    }
    if (customer) {
      await prisma.customers.update({
        where: { id: customer.id },
        data: { total_outstanding_balance: originalBalance }
      }).catch(() => {});
    }
    await prisma.$disconnect();
    console.log("Cleanup finished.");
  }
}

runTests().then(() => {
  if (process.exitCode !== 1) {
    console.log("\n🎉 Unit Cancellation and Configurable Charges tests passed successfully!");
  }
});
