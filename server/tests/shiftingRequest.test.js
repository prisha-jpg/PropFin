import assert from "node:assert";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "propfin-default-jwt-secret-key-32-chars-long";

function generateToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 24 * 60 * 60 * 1000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

async function runTests() {
  console.log("Starting Refactored Shifting Request Integration Tests...");
  let serverProcess;
  const port = 4012;

  let customer, project, sourceUnit, destUnit;
  let salesOrder = null;
  let shiftingRequest = null;
  let rejectedRequest = null;

  try {
    // 1. Resolve / Create baseline components
    customer = await prisma.customers.findFirst();
    project = await prisma.projects.findFirst();
    
    // Find/create two available units
    const units = await prisma.units.findMany({ where: { status: "available" }, take: 2 });
    if (units.length < 2) {
      // Create transient units if not enough exist
      sourceUnit = await prisma.units.create({
        data: {
          project_id: project.id,
          unit_number: `UT-${Date.now()}-A`,
          floor_number: 2,
          carpet_area: 1200,
          status: "available"
        }
      });
      destUnit = await prisma.units.create({
        data: {
          project_id: project.id,
          unit_number: `UT-${Date.now()}-B`,
          floor_number: 5,
          carpet_area: 1500,
          status: "available"
        }
      });
      // Add price info
      await prisma.unit_pricing.create({
        data: {
          unit_id: destUnit.id,
          basic_sale_value: 600000.0,
          total_sale_value: 600000.0
        }
      });
    } else {
      sourceUnit = units[0];
      destUnit = units[1];
      // Ensure unitPricing exists
      let pricing = await prisma.unit_pricing.findUnique({ where: { unit_id: destUnit.id } });
      if (!pricing) {
        await prisma.unit_pricing.create({
          data: {
            unit_id: destUnit.id,
            basic_sale_value: 600000.0,
            total_sale_value: 600000.0
          }
        });
      }
    }

    // 2. Start server
    serverProcess = spawn("node", ["server/index.js"], {
      stdio: "inherit",
      env: {
        ...process.env,
        API_PORT: String(port)
      }
    });

    // Wait for server to boot
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const token = generateToken({ id: "f079b403-2c62-4f1c-bff5-83266adb9160", email: "admin@propfin.com", role: "admin" });

    // 3. Create a transient Sales Order (old unit is sourceUnit, booked)
    console.log("Creating active Sales Order...");
    await prisma.units.update({ where: { id: sourceUnit.id }, data: { status: "booked" } });
    salesOrder = await prisma.sales_orders.create({
      data: {
        order_number: `TSO-SH-${Date.now().toString(36).toUpperCase()}`,
        customer_id: customer.id,
        project_id: project.id,
        unit_id: sourceUnit.id,
        booking_date: new Date(),
        status: "open_order",
        agreement_value: 500000.0,
        basic_sale_value: 500000.0
      }
    });

    const oldAgreement = Number(salesOrder.agreement_value);
    const destUnitPriceRecord = await prisma.unit_pricing.findUnique({ where: { unit_id: destUnit.id } });
    const newAgreement = Number(destUnitPriceRecord?.basic_sale_value || destUnit.base_price || 0);
    const expectedDiff = newAgreement - oldAgreement;

    // 4. Verify orders available for shifting
    console.log("Checking eligible orders API...");
    const ordersRes = await fetch(`http://127.0.0.1:${port}/api/shift/orders`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    assert.strictEqual(ordersRes.status, 200);
    const eligibleOrders = await ordersRes.json();
    const hasOrder = eligibleOrders.some(o => o.id === salesOrder.id);
    assert.ok(hasOrder, "Eligible orders should list our new sales order");
    console.log("✅ Eligible orders verified.");

    // 5. Submit shifting request (Upgrade / Downgrade check)
    console.log("Submitting shifting request...");
    const createRes = await fetch(`http://127.0.0.1:${port}/api/shift/request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        sales_order_id: salesOrder.id,
        to_unit_id: destUnit.id,
        reason: "Requesting higher floor"
      })
    });

    assert.strictEqual(createRes.status, 201);
    shiftingRequest = await createRes.json();
    assert.strictEqual(shiftingRequest.status, "pending");
    assert.strictEqual(Number(shiftingRequest.price_difference), expectedDiff);
    console.log("✅ Shifting request successfully created in pending status.");

    // 6. Test Validation: Duplicate pending request prevention
    console.log("Testing duplicate request validation...");
    const dupRes = await fetch(`http://127.0.0.1:${port}/api/shift/request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        sales_order_id: salesOrder.id,
        to_unit_id: destUnit.id,
        reason: "Duplicate"
      })
    });
    assert.strictEqual(dupRes.status, 409);
    console.log("✅ Duplicate prevention verified (409).");

    // 7. Test Validation: Shifting to same unit
    console.log("Testing same unit shifting validation...");
    const sameUnitRes = await fetch(`http://127.0.0.1:${port}/api/shift/request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        sales_order_id: salesOrder.id,
        to_unit_id: sourceUnit.id,
        reason: "Same unit"
      })
    });
    assert.strictEqual(sameUnitRes.status, 400);
    console.log("✅ Same unit prevention verified (400).");

    // 8. Execute / Approve Shift Request
    console.log("Approving shifting request...");
    const approveRes = await fetch(`http://127.0.0.1:${port}/api/shift/approve`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        requestId: shiftingRequest.id
      })
    });
    assert.strictEqual(approveRes.status, 200);
    const approvedResult = await approveRes.json();
    assert.strictEqual(approvedResult.status, "approved");
    console.log("✅ Request successfully approved.");

    // 9. Verify Database Side-Effects
    console.log("Verifying database side effects...");
    
    // Check Sales Order
    const updatedOrder = await prisma.sales_orders.findUnique({
      where: { id: salesOrder.id }
    });
    assert.strictEqual(updatedOrder.unit_id, destUnit.id);
    assert.strictEqual(Number(updatedOrder.agreement_value), newAgreement);
    console.log("✅ Sales Order unit and agreement value successfully updated.");

    // Check inventory toggles
    const updatedSourceUnit = await prisma.units.findUnique({ where: { id: sourceUnit.id } });
    const updatedDestUnit = await prisma.units.findUnique({ where: { id: destUnit.id } });
    assert.strictEqual(updatedSourceUnit.status, "available");
    assert.strictEqual(updatedDestUnit.status, "booked");
    console.log("✅ Inventory states successfully toggled (old: available, new: booked).");

    // Check Ledger adjustment entry
    const ledgerEntry = await prisma.ledger.findFirst({
      where: {
        sales_order_id: salesOrder.id,
        transaction_type: "ADJUSTMENT",
        reference_no: shiftingRequest.request_number
      }
    });
    if (expectedDiff !== 0) {
      assert.ok(ledgerEntry);
      assert.strictEqual(Number(ledgerEntry.amount), expectedDiff);
      if (expectedDiff > 0) {
        assert.strictEqual(Number(ledgerEntry.debit), expectedDiff);
        assert.strictEqual(Number(ledgerEntry.credit), 0.0);
      } else {
        assert.strictEqual(Number(ledgerEntry.credit), -expectedDiff);
        assert.strictEqual(Number(ledgerEntry.debit), 0.0);
      }
      console.log("✅ Adjustment ledger entry successfully posted.");
    } else {
      assert.ok(!ledgerEntry);
      console.log("✅ No adjustment posted since difference is zero.");
    }

    // 10. Verify Rejection workflow
    console.log("Testing rejection workflow...");
    // Create another unit & sales order
    const extraUnit = await prisma.units.create({
      data: {
        project_id: project.id,
        unit_number: `UT-${Date.now()}-C`,
        floor_number: 1,
        carpet_area: 1000,
        status: "available"
      }
    });
    // Temporary sales order
    const salesOrder2 = await prisma.sales_orders.create({
      data: {
        order_number: `TSO-SH2-${Date.now().toString(36).toUpperCase()}`,
        customer_id: customer.id,
        project_id: project.id,
        unit_id: extraUnit.id,
        booking_date: new Date(),
        status: "open_order",
        agreement_value: 400000.0,
        basic_sale_value: 400000.0
      }
    });
    // Create new shift request
    const createRejectRes = await fetch(`http://127.0.0.1:${port}/api/shift/request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        sales_order_id: salesOrder2.id,
        to_unit_id: sourceUnit.id, // sourceUnit is now available again!
        reason: "Test rejection"
      })
    });
    assert.strictEqual(createRejectRes.status, 201);
    rejectedRequest = await createRejectRes.json();

    // Reject it
    const rejectRes = await fetch(`http://127.0.0.1:${port}/api/shift/reject`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        requestId: rejectedRequest.id,
        rejection_reason: "Unit layout not matching client preference"
      })
    });
    assert.strictEqual(rejectRes.status, 200);
    const rejectedResult = await rejectRes.json();
    assert.strictEqual(rejectedResult.status, "rejected");
    assert.strictEqual(rejectedResult.rejection_reason, "Unit layout not matching client preference");
    console.log("✅ Rejection workflow verified successfully.");

    // Cleanup extra order
    if (rejectedRequest) {
      await prisma.shifting_requests.delete({ where: { id: rejectedRequest.id } }).catch(() => {});
      rejectedRequest = null;
    }
    await prisma.sales_orders.delete({ where: { id: salesOrder2.id } });
    await prisma.units.delete({ where: { id: extraUnit.id } });

    console.log("\n🎉 Refactored Unit Shifting integration tests passed successfully!");

  } catch (error) {
    console.error("❌ Integration test run failed:", error);
    process.exitCode = 1;
  } finally {
    console.log("\nCleaning up test records...");
    if (serverProcess) {
      serverProcess.kill();
    }
    // Delete created entries
    if (shiftingRequest) {
      await prisma.ledger.deleteMany({ where: { reference_no: shiftingRequest.request_number } }).catch(() => {});
      await prisma.shifting_requests.delete({ where: { id: shiftingRequest.id } }).catch(() => {});
    }
    if (rejectedRequest) {
      await prisma.shifting_requests.delete({ where: { id: rejectedRequest.id } }).catch(() => {});
    }
    if (salesOrder) {
      await prisma.sales_orders.delete({ where: { id: salesOrder.id } }).catch(() => {});
    }
    // Reset sourceUnit and destUnit
    if (sourceUnit) {
      await prisma.units.update({ where: { id: sourceUnit.id }, data: { status: "available" } }).catch(() => {});
    }
    if (destUnit) {
      await prisma.units.update({ where: { id: destUnit.id }, data: { status: "available" } }).catch(() => {});
    }
    await prisma.$disconnect();
    console.log("Cleanup finished.");
  }
}

runTests();
