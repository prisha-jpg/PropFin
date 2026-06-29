import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import assert from "node:assert";

const JWT_SECRET = process.env.JWT_SECRET || "propfin-default-jwt-secret-key-32-chars-long";

const generateToken = (payload) => {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 24 * 60 * 60 * 1000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
};

async function testChequeBounce() {
  console.log("Starting Cheque Bounce / Receipt Reversal integration test...");
  const prisma = new PrismaClient();

  let customer = null;
  let salesOrder = null;
  let project = null;
  let unit = null;
  let receipt = null;
  let originalBalance = 0;

  try {
    customer = await prisma.customers.findFirst();
    project = await prisma.projects.findFirst();
    unit = await prisma.units.findFirst();

    if (!customer || !project || !unit) {
      console.log("⚠️ Skipping test because seed data is missing.");
      return;
    }

    originalBalance = Number(customer.total_outstanding_balance || 0);

    // Create transient Sales Order
    salesOrder = await prisma.sales_orders.create({
      data: {
        order_number: `TSO-${Date.now().toString(36).toUpperCase()}`,
        customer_id: customer.id,
        project_id: project.id,
        unit_id: unit.id,
        booking_date: new Date(),
        status: "open_order",
        basic_sale_value: 500000.0,
      }
    });

    // Create transient Payment Receipt
    receipt = await prisma.customer_receipts.create({
      data: {
        receipt_number: `TRCT-${Date.now().toString(36).toUpperCase()}`,
        sales_order_id: salesOrder.id,
        customer_id: customer.id,
        amount: 25000.00,
        payment_mode: "cheque",
        receipt_date: new Date(),
        status: "received"
      }
    });

    const token = generateToken({ id: "admin-id", email: "admin@propfin.com" });

    console.log(`Sending POST to bounce receipt endpoint on port 4001 for Receipt: ${receipt.receipt_number}...`);
    const response = await fetch(`http://127.0.0.1:4001/api/receipts/${receipt.id}/bounce`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ bounce_reason: "Insufficient Funds" })
    });

    assert.strictEqual(response.status, 200);
    const data = await response.json();
    assert.strictEqual(data.success, true);
    console.log("API response status 200. Reversal payload:", data.data);

    // Verify Receipt status updated
    const updatedReceipt = await prisma.customer_receipts.findUnique({
      where: { id: receipt.id }
    });
    assert.strictEqual(updatedReceipt.status, "bounced");
    assert.strictEqual(updatedReceipt.bounce_reason, "Insufficient Funds");
    console.log("✅ Verified: Receipt status set to 'bounced' and reason saved.");

    // Verify Ledger Entries
    const ledgerEntries = await prisma.ledger.findMany({
      where: { sales_order_id: salesOrder.id }
    });
    // Should have 2 entries: 1 reversal and 1 penalty
    assert.strictEqual(ledgerEntries.length, 2);

    const reversal = ledgerEntries.find(l => l.transaction_type === "REVERSAL");
    assert.ok(reversal);
    assert.strictEqual(Number(reversal.amount), 25000.00);

    const penalty = ledgerEntries.find(l => l.transaction_type === "PENALTY");
    assert.ok(penalty);
    assert.strictEqual(Number(penalty.amount), 500.00);
    console.log("✅ Verified: Ledger Reversal and Penalty charge entries created.");

    // Verify Customer balance updated
    const updatedCust = await prisma.customers.findUnique({
      where: { id: customer.id }
    });
    assert.strictEqual(Number(updatedCust.total_outstanding_balance), originalBalance + 25000.00 + 500.00);
    console.log("✅ Verified: Outstanding balance of the customer successfully updated.");

  } catch (err) {
    console.error("❌ Test failed:", err);
    process.exit(1);
  } finally {
    console.log("Cleaning up test database records...");
    if (salesOrder) {
      await prisma.ledger.deleteMany({ where: { sales_order_id: salesOrder.id } });
      if (receipt) {
        await prisma.customer_receipts.delete({ where: { id: receipt.id } });
      }
      await prisma.sales_orders.delete({ where: { id: salesOrder.id } });
    }
    if (customer) {
      await prisma.customers.update({
        where: { id: customer.id },
        data: { total_outstanding_balance: originalBalance }
      });
    }
    await prisma.$disconnect();
    console.log("Database clean up successful.");
  }
}

testChequeBounce().then(() => {
  console.log("\n🎉 Cheque Bounce / Reversal integration tests passed successfully!");
});
