import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { postDelayedInterestToLedger } from "../utils/interestCalculator.js";

const prisma = new PrismaClient();

// Helper to check if a date is the last day of the calendar month in local timezone
export function isLastDayOfMonth(date = new Date()) {
  const tomorrow = new Date(date);
  tomorrow.setDate(date.getDate() + 1);
  return tomorrow.getDate() === 1;
}

export function startInterestJob() {
  // Cron schedule: runs at 23:50 every day
  // "50 23 * * *"
  const job = cron.schedule("50 23 * * *", async () => {
    try {
      const today = new Date();
      if (!isLastDayOfMonth(today)) {
        console.log(`[Interest Cron Job] Daily check: ${today.toDateString()} is not the last day of the month. Skipping calculation.`);
        return;
      }

      console.log(`[Interest Cron Job] Starting automated month-end interest posting at ${today.toISOString()}`);

      // Fetch all customers with an outstanding balance > 0
      const customers = await prisma.customers.findMany({
        where: {
          total_outstanding_balance: {
            gt: 0
          }
        },
        select: {
          id: true,
          full_name: true,
          total_outstanding_balance: true
        }
      });

      console.log(`[Interest Cron Job] Found ${customers.length} customers with outstanding balance > 0.`);

      for (const customer of customers) {
        try {
          console.log(`[Interest Cron Job] Processing interest calculation for customer: ${customer.full_name || customer.id}`);
          
          // Fetch active sales orders for this customer
          const salesOrders = await prisma.sales_orders.findMany({
            where: {
              customer_id: customer.id,
              status: { notIn: ["cancelled", "resale"] }
            }
          });

          for (const order of salesOrders) {
            // Fetch schedules, receipts and PRL Demands
            const schedules = await prisma.payment_schedules.findMany({
              where: { sales_order_id: order.id },
              orderBy: { original_due_date: "asc" }
            });

            const receipts = await prisma.customer_receipts.findMany({
              where: { sales_order_id: order.id, status: "cleared" },
              orderBy: { consideration_date: "asc" }
            });

            const prlDemands = await prisma.demand_letters.findMany({
              where: {
                sales_order_id: order.id,
                demand_type: "subsequent_prl",
                status: { notIn: ["paid", "cancelled"] }
              },
              orderBy: { due_date: "asc" }
            });

            // Calculate and post interest for standard schedules
            for (const schedule of schedules) {
              if (!schedule.original_due_date || schedule.status === "paid") continue;
              const dueDate = new Date(schedule.original_due_date);
              if (dueDate >= today) continue;

              const matchedReceipt = receipts.find(r => r.payment_schedule_id === schedule.id);
              const endDate = matchedReceipt && matchedReceipt.consideration_date
                ? new Date(matchedReceipt.consideration_date)
                : today;

              if (endDate <= dueDate) continue;

              await postDelayedInterestToLedger(prisma, {
                salesOrderId: order.id,
                customerId: customer.id,
                milestoneDemand: Number(schedule.due_amount),
                amountPaid: 0,
                dueDate: dueDate,
                calculationEndDate: endDate,
                annual_interest_rate: 18,
                milestoneName: schedule.milestone_name,
                isFinalSettlement: false
              });
            }

            // Calculate and post interest for PRL demands
            for (const demand of prlDemands) {
              if (!demand.due_date) continue;
              const dueDate = new Date(demand.due_date);
              if (dueDate >= today) continue;

              const matchedReceipt = demand.payment_schedule_id
                ? receipts.find(r => r.payment_schedule_id === demand.payment_schedule_id)
                : null;
              const endDate = matchedReceipt && matchedReceipt.consideration_date
                ? new Date(matchedReceipt.consideration_date)
                : today;

              if (endDate <= dueDate) continue;

              await postDelayedInterestToLedger(prisma, {
                salesOrderId: order.id,
                customerId: customer.id,
                milestoneDemand: Number(demand.principal_amount),
                amountPaid: 0,
                dueDate: dueDate,
                calculationEndDate: endDate,
                annual_interest_rate: 18,
                milestoneName: `PRL Demand - ${demand.demand_number}`,
                isFinalSettlement: false
              });
            }
          }
          console.log(`[Interest Cron Job] Successfully processed customer: ${customer.full_name || customer.id}`);
        } catch (customerError) {
          console.error(`[Interest Cron Job] Failed to process customer ${customer.full_name || customer.id}:`, customerError);
        }
      }

      console.log(`[Interest Cron Job] Finished batch interest posting.`);
    } catch (jobError) {
      console.error("[Interest Cron Job] Critical error in background job loop:", jobError);
    }
  });

  console.log("[Interest Cron Job] Registered node-cron task running daily at 23:50 (active on month-end).");
  return job;
}
