import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
  const customer = await prisma.customers.findFirst({
    where: { customer_code: "CIFMQYUZUJT" }
  });
  if (!customer) {
    console.log("Customer testing2 not found");
    return;
  }

  // 1. Delete previous interest ledger entries for this customer to start clean
  const deleted = await prisma.ledger.deleteMany({
    where: {
      customer_id: customer.id,
      transaction_type: "LATE_FEE_INTEREST"
    }
  });
  console.log(`Deleted ${deleted.count} existing late fee interest entries.`);

  // 2. Reset outstanding balance to 0
  await prisma.customers.update({
    where: { id: customer.id },
    data: { total_outstanding_balance: 0 }
  });
  console.log("Reset customer outstanding balance to 0.");

  // 3. Find the schedule and update due date to April 15, 2026
  const schedule = await prisma.payment_schedules.findFirst({
    where: {
      sales_orders: { customer_id: customer.id },
      status: "pending",
      milestone_name: { contains: "15 Days" }
    }
  });

  if (!schedule) {
    console.log("Pending schedule not found");
    return;
  }

  const updated = await prisma.payment_schedules.update({
    where: { id: schedule.id },
    data: {
      original_due_date: new Date("2026-04-15")
    }
  });

  console.log(`Successfully updated due date of "${updated.milestone_name}" to April 15, 2026.`);
  await prisma.$disconnect();
}
run();
