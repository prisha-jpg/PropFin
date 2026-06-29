import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import assert from "node:assert";

async function runRouteTest() {
  console.log("Starting Pricing Route Interest Calculation Integration Test...");
  const prisma = new PrismaClient();

  let customer = null;
  let project = null;
  let unit = null;
  let salesOrder = null;
  let paymentSchedule = null;
  let originalBalance = 0;
  let serverProcess = null;

  try {
    // 1. Fetch seed data
    customer = await prisma.customers.findFirst();
    project = await prisma.projects.findFirst();
    unit = await prisma.units.findFirst();

    if (!customer || !project || !unit) {
      console.log("⚠️ Skipping test because seed data is missing.");
      return;
    }

    originalBalance = Number(customer.total_outstanding_balance || 0);

    // 2. Create transient Sales Order
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

    // 3. Create transient Payment Schedule
    paymentSchedule = await prisma.payment_schedules.create({
      data: {
        sales_order_id: salesOrder.id,
        milestone_name: "Test Milestone",
        due_amount: 500000.0,
        original_due_date: new Date("2026-06-01"),
        status: "pending"
      }
    });

    console.log(`Created test sales order: ${salesOrder.order_number}`);
    console.log(`Created test payment schedule: ${paymentSchedule.milestone_name}`);

    // 4. Start the server on port 4005
    console.log("Spawning API server on port 4005...");
    serverProcess = spawn("node", ["server/index.js"], {
      env: {
        ...process.env,
        API_PORT: "4005"
      }
    });
    serverProcess.stdout.on("data", (data) => console.log(`[Server Output] ${data}`));
    serverProcess.stderr.on("data", (data) => console.error(`[Server Error] ${data}`));

    // Wait for server to start
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 5. Send POST request to the calculate-interest route
    console.log("Sending POST /api/pricing/calculate-interest request...");
    const response = await fetch("http://127.0.0.1:4005/api/pricing/calculate-interest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        sales_order_id: salesOrder.id,
        annual_interest_rate: 0.18,
        calculation_date: "2026-07-06",
        isFinalSettlement: true
      })
    });

    assert.strictEqual(response.status, 200);
    const result = await response.json();
    console.log("API response status 200. Data:", JSON.stringify(result, null, 2));

    // Verify response structure
    assert.strictEqual(result.success, true);
    assert.ok(Array.isArray(result.ledger_entries));
    assert.strictEqual(result.ledger_entries.length, 2);

    // Verify values including 18% GST
    // Month 1 amount (incl GST) should be 8437.8
    // Month 2 amount (incl GST) should be 1745.75
    assert.strictEqual(result.ledger_entries[0].amount, 8437.8);
    assert.strictEqual(result.ledger_entries[1].amount, 1745.75);

    // Verify DB Ledger state
    const dbLedgerEntries = await prisma.ledger.findMany({
      where: { sales_order_id: salesOrder.id }
    });
    assert.strictEqual(dbLedgerEntries.length, 2);
    assert.strictEqual(Number(dbLedgerEntries[0].amount), 8437.8);
    assert.strictEqual(Number(dbLedgerEntries[1].amount), 1745.75);

    // Verify customer outstanding balance was updated in DB
    const updatedCustomer = await prisma.customers.findUnique({
      where: { id: customer.id }
    });
    assert.strictEqual(Number(updatedCustomer.total_outstanding_balance), originalBalance + 10183.55);
    console.log("✅ Route verification passed successfully!");

  } catch (error) {
    console.error("❌ Route verification failed:", error);
    process.exit(1);
  } finally {
    console.log("Cleaning up test database records...");
    if (paymentSchedule) {
      try {
        await prisma.payment_schedules.deleteMany({
          where: { sales_order_id: salesOrder.id }
        });
      } catch (err) {
        console.error("Cleanup error (payment schedule):", err.message);
      }
    }
    if (salesOrder) {
      try {
        await prisma.ledger.deleteMany({
          where: { sales_order_id: salesOrder.id }
        });
        await prisma.sales_orders.delete({
          where: { id: salesOrder.id }
        });
      } catch (err) {
        console.error("Cleanup error (sales order):", err.message);
      }
    }
    if (customer) {
      try {
        await prisma.customers.update({
          where: { id: customer.id },
          data: { total_outstanding_balance: originalBalance }
        });
      } catch (err) {
        console.error("Cleanup error (customer):", err.message);
      }
    }
    await prisma.$disconnect();

    if (serverProcess) {
      console.log("Stopping API server...");
      serverProcess.kill();
    }
    console.log("Cleaned up successfully.");
  }
}

runRouteTest();
