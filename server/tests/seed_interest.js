import { PrismaClient } from "@prisma/client";

async function main() {
  console.log("Seeding real interest and ledger records for customer 'testing'...");
  const prisma = new PrismaClient();

  try {
    const customer = await prisma.customers.findFirst({
      where: {
        full_name: {
          contains: "testing",
          mode: "insensitive"
        }
      }
    });

    if (!customer) {
      console.log("Customer 'testing' not found.");
      return;
    }

    const order = await prisma.sales_orders.findFirst({
      where: { customer_id: customer.id }
    });

    if (!order) {
      console.log("No sales order found for customer 'testing'.");
      return;
    }

    const outstanding = Number(customer.total_outstanding_balance || 0);

    // Create calculation run
    const run = await prisma.interest_calculation_runs.create({
      data: {
        run_date: new Date(),
        period_from: new Date("2026-06-01"),
        period_to: new Date("2026-06-28"),
        interest_rate: 18.0,
        calculation_method: "simple",
        status: "completed",
        processed_count: 1,
        total_interest_generated: 4931.51,
        remarks: "Generated to seed frontend verification"
      }
    });

    // Create interest entry
    await prisma.interest_entries.create({
      data: {
        run_id: run.id,
        sales_order_id: order.id,
        customer_id: customer.id,
        period_from: new Date("2026-06-01"),
        period_to: new Date("2026-06-28"),
        overdue_principal: 500000.0,
        interest_rate: 18.0,
        days_overdue: 20,
        interest_amount: 4931.51,
        gst_on_interest: 0,
        status: "active"
      }
    });

    // Create ledger entry
    await prisma.ledger.create({
      data: {
        sales_order_id: order.id,
        customer_id: customer.id,
        transaction_type: "LATE_FEE_INTEREST",
        amount: 4931.51,
        reference_date: new Date("2026-06-28"),
        description: "Delayed payment interest for the period of 01/06/2026 to 28/06/2026",
        status: "UNPAID"
      }
    });

    // Update customer outstanding balance
    const updatedCust = await prisma.customers.update({
      where: { id: customer.id },
      data: {
        total_outstanding_balance: {
          increment: 4931.51
        }
      }
    });

    console.log(`✅ Seeded successfully! New Customer Balance: INR ${updatedCust.total_outstanding_balance}`);

  } catch (error) {
    console.error("Error seeding interest:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
