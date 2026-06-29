import { PrismaClient } from "@prisma/client";
import { syncHistoricalInterest } from "../utils/interestCalculator.js";

const prisma = new PrismaClient();

async function run() {
  const customer = await prisma.customers.findFirst({
    where: { customer_code: "CIFMQYUZUJT" }
  });
  if (!customer) {
    console.log("Customer testing2 not found");
    return;
  }

  console.log("Running JIT Sync inside a transaction...");
  try {
    await prisma.$transaction(async (tx) => {
      // Run select for update row lock
      const [lockedCustomer] = await tx.$queryRaw`
        SELECT * FROM customers WHERE id = ${customer.id}::uuid FOR UPDATE
      `;
      console.log("Locked customer:", lockedCustomer.full_name);

      await syncHistoricalInterest(customer.id, tx);
    });
    console.log("Transaction committed successfully.");
  } catch (error) {
    console.error("Transaction failed:", error);
  }

  // Query ledger entries written
  const ledger = await prisma.ledger.findMany({
    where: { customer_id: customer.id }
  });
  console.log("Ledger entries written:", ledger.length);
  for (const l of ledger) {
    console.log(`  - Date: ${l.reference_date.toISOString().split('T')[0]}, Amount: ${l.amount}, Desc: ${l.description}`);
  }

  await prisma.$disconnect();
}
run();
