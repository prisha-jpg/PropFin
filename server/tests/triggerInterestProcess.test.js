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

async function testBulkInterestProcess() {
  console.log("Starting bulk interest insertion API test...");
  const prisma = new PrismaClient();

  let customer = null;
  let salesOrder = null;
  let project = null;
  let unit = null;
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

    const token = generateToken({ id: "admin-id", email: "admin@propfin.com" });

    // Mock calculations payload as sent from Frontend InterestCalculation.jsx
    const payload = [
      {
        customer_id: customer.id,
        sales_order_id: salesOrder.id,
        principal_amount: 500000.0,
        interest_rate: 18.0,
        interest_amount: 4931.51,
        period_from: "2026-06-01",
        period_to: "2026-07-06",
        days: 20
      }
    ];

    const port = process.env.API_PORT || 4000;
    console.log(`Sending POST to bulk interest entries API endpoint on port ${port}...`);
    const response = await fetch(`http://127.0.0.1:${port}/api/entities/InterestEntry/bulk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(response.status, 201);
    const data = await response.json();
    console.log("API response status 201. Data received:", data);

    // Verify Ledger records were created
    const ledgerEntries = await prisma.ledger.findMany({
      where: { sales_order_id: salesOrder.id }
    });
    assert.strictEqual(ledgerEntries.length, 1);
    assert.strictEqual(Number(ledgerEntries[0].amount), 4931.51);
    assert.strictEqual(ledgerEntries[0].transaction_type, "LATE_FEE_INTEREST");
    console.log("✅ Verified: Ledger Entry successfully written to database.");

    // Verify Interest calculation run was created
    const runs = await prisma.interest_calculation_runs.findMany({
      where: { remarks: "Generated via frontend calculation process" }
    });
    assert.ok(runs.length > 0);
    console.log("✅ Verified: Parent calculation run successfully written.");

    // Verify Customer Balance was updated
    const updatedCust = await prisma.customers.findUnique({
      where: { id: customer.id }
    });
    assert.strictEqual(Number(updatedCust.total_outstanding_balance), originalBalance + 4931.51);
    console.log("✅ Verified: Customer balance successfully incremented.");

  } catch (err) {
    console.error("❌ Test failed:", err);
    process.exit(1);
  } finally {
    console.log("Cleaning up test database records...");
    if (salesOrder) {
      const dbEntries = await prisma.interest_entries.findMany({
        where: { sales_order_id: salesOrder.id }
      });
      const runIds = dbEntries.map(e => e.run_id);

      await prisma.ledger.deleteMany({ where: { sales_order_id: salesOrder.id } });
      await prisma.interest_entries.deleteMany({ where: { sales_order_id: salesOrder.id } });
      await prisma.sales_orders.delete({ where: { id: salesOrder.id } });
      
      if (runIds.length > 0) {
        await prisma.interest_calculation_runs.deleteMany({
          where: { id: { in: runIds } }
        });
      }
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

testBulkInterestProcess().then(() => {
  console.log("\n🎉 All bulk interest process API tests passed successfully!");
});
