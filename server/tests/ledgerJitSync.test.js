import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import assert from "node:assert";

async function runJitSyncTest() {
  console.log("Starting JIT Historical Interest Sync Integration Test...");
  const prisma = new PrismaClient();

  let customer = null;
  let project = null;
  let unit = null;
  let salesOrder = null;
  let paymentSchedule = null;
  let originalBalance = 0;
  let serverProcess = null;

  try {
    // 1. Fetch seed project and unit, create transient customer
    project = await prisma.projects.findFirst();
    unit = await prisma.units.findFirst();

    if (!project || !unit) {
      console.log("⚠️ Skipping test because seed project or unit is missing.");
      return;
    }

    customer = await prisma.customers.create({
      data: {
        customer_code: `TC-JIT-${Date.now().toString(36).toUpperCase()}`,
        first_name: "Transient JIT Customer",
        customer_type: "individual",
        nationality: "Indian"
      }
    });

    originalBalance = 0;

    // 2. Create transient Sales Order
    salesOrder = await prisma.sales_orders.create({
      data: {
        order_number: `TSO-JIT-${Date.now().toString(36).toUpperCase()}`,
        customer_id: customer.id,
        project_id: project.id,
        unit_id: unit.id,
        booking_date: new Date(),
        status: "open_order",
        basic_sale_value: 500000.0,
      }
    });

    // 3. Create backdated Payment Schedule due on May 10, 2026.
    // Grace period is 0, so overdue starts May 11, 2026.
    // May month-end is May 31, 2026 (completed).
    // Today is June 29, 2026. June month-end is June 30 (incomplete, should be ignored).
    paymentSchedule = await prisma.payment_schedules.create({
      data: {
        sales_order_id: salesOrder.id,
        milestone_name: "Backdated JIT Milestone",
        due_amount: 500000.0,
        original_due_date: new Date("2026-05-10"),
        status: "pending"
      }
    });

    console.log(`Created test sales order: ${salesOrder.order_number}`);
    console.log(`Created backdated payment schedule: ${paymentSchedule.milestone_name} due ${paymentSchedule.original_due_date.toISOString().split('T')[0]}`);

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

    // 5. Send GET request to retrieve ledger and trigger sync
    console.log("Sending GET /api/pricing/ledger/:customerId request to trigger JIT sync...");
    const response = await fetch(`http://127.0.0.1:4005/api/pricing/ledger/${customer.id}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      }
    });

    assert.strictEqual(response.status, 200);
    const ledger = await response.json();
    console.log(`GET response status 200. Total customer ledger entries retrieved: ${ledger.length}`);

    // Verify JIT interest entry was created for May 31, 2026.
    // Principal: 500,000, 18% APR. Overdue from May 11 to May 31 (21 days).
    // Interest = (500000 * 0.18 * 21) / 365 = 5178.08
    // GST = 5178.08 * 0.18 = 932.05
    // Total = 5178.08 + 932.05 = 6110.13
    const jitEntries = ledger.filter(entry => entry.sales_order_id === salesOrder.id);
    assert.strictEqual(jitEntries.length, 1, "Should have exactly 1 ledger entry backfilled for May 2026");
    assert.strictEqual(Number(jitEntries[0].amount), 6110.13, "Interest + GST should be exactly 6110.13");
    
    const referenceDateStr = new Date(jitEntries[0].reference_date).toISOString().split('T')[0];
    assert.strictEqual(referenceDateStr, "2026-05-31", "The backfilled entry must date to the end of the completed month (May 31)");

    console.log("✅ Passed: JIT backfill successfully created May 31 month-end row.");

    // 6. Test Idempotency: call again, check that no duplicate ledger row is written
    console.log("Triggering consecutive GET to verify idempotency...");
    const response2 = await fetch(`http://127.0.0.1:4005/api/pricing/ledger/${customer.id}`);
    assert.strictEqual(response2.status, 200);
    const ledger2 = await response2.json();
    const jitEntries2 = ledger2.filter(entry => entry.sales_order_id === salesOrder.id);
    assert.strictEqual(jitEntries2.length, 1, "Idempotency check failed: duplicate entries created!");

    console.log("✅ Passed: JIT sync is idempotent.");

    // 7. Verify DB Customer Balance state
    const dbCustomer = await prisma.customers.findUnique({
      where: { id: customer.id }
    });
    const expectedBalance = Math.round((originalBalance + 6110.13) * 100) / 100;
    const actualBalance = Math.round(Number(dbCustomer.total_outstanding_balance) * 100) / 100;
    assert.strictEqual(actualBalance, expectedBalance, `Customer balance should be updated. Expected: ${expectedBalance}, Got: ${actualBalance}`);

    console.log("✅ Passed: Customer outstanding balance correctly updated in database.");
    console.log("🎉 All JIT interest synchronization integration tests passed successfully!");

  } catch (error) {
    console.error("❌ JIT sync integration tests failed:", error);
    // Wait for server process to dump any asynchronous stderr errors
    await new Promise((resolve) => setTimeout(resolve, 2000));
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
        console.error("Cleanup error (sales order/ledger):", err.message);
      }
    }
    if (customer) {
      try {
        await prisma.customers.delete({
          where: { id: customer.id }
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

runJitSyncTest();
