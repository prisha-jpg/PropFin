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

  // Find a pending schedule for their sales order
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
      original_due_date: new Date("2026-05-10")
    }
  });

  console.log(`Successfully backdated schedule ${updated.milestone_name} to 2026-05-10`);
  await prisma.$disconnect();
}
run();
