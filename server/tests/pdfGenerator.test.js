import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { generatePdfFromHtml } from "../utils/pdfGenerator.js";
import { demandLetterTemplate, receiptTemplate } from "../utils/pdfTemplates.js";

console.log("Starting PDF Generation integration tests...\n");

function renderTemplate(template, data) {
  let output = template;
  // Process conditionals first: {{#if field}}content{{/if}}
  output = output.replace(/{{\s*#if\s+([a-zA-Z0-9_]+)\s*}}([\s\S]*?){{\s*\/if\s*}}/g, (match, field, content) => {
    return data[field] ? content : "";
  });
  // Process variables: {{variableName}}
  for (const [key, value] of Object.entries(data)) {
    const placeholder = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    output = output.replace(placeholder, value !== undefined && value !== null ? String(value) : "");
  }
  return output;
}

async function runTests() {
  const prisma = new PrismaClient();

  try {
    // 1. Fetch a real demand letter from database
    const demand = await prisma.demand_letters.findFirst({
      include: {
        customers: true,
        sales_orders: {
          include: {
            projects: true,
            units: true
          }
        },
        payment_schedules: true
      }
    });

    if (demand) {
      console.log(`Found demand letter in database: ${demand.demand_number}`);
      const formatCurrency = (val) =>
        `INR ${Number(val || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      const templateData = {
        customerName: demand.customers.full_name || `${demand.customers.first_name} ${demand.customers.last_name || ""}`.trim(),
        unitNumber: demand.sales_orders.units.unit_number,
        orderNumber: demand.sales_orders.order_number,
        demandNumber: demand.demand_number,
        demandDate: new Date(demand.demand_date).toLocaleDateString("en-IN"),
        dueDate: demand.due_date ? new Date(demand.due_date).toLocaleDateString("en-IN") : "-",
        milestoneDescription: demand.payment_schedules?.milestone_name || demand.demand_type || "Overdue Instalment",
        baseAmount: formatCurrency(demand.principal_amount),
        gstAmount: formatCurrency(demand.gst_on_interest),
        otherCharges: Number(demand.other_charges) > 0 ? formatCurrency(demand.other_charges) : "",
        interestAmount: Number(demand.interest_amount) > 0 ? formatCurrency(demand.interest_amount) : "",
        totalDue: formatCurrency(demand.total_demand_amount),
        escrowAccountName: "PropFin Escrow A/C",
        escrowBankName: "HDFC Bank",
        escrowAccountNumber: "50200012345678",
        escrowIfsc: "HDFC0000123",
        escrowBranch: "MG Road, Bangalore"
      };

      console.log("Compiling Demand Letter HTML template...");
      const html = renderTemplate(demandLetterTemplate, templateData);

      console.log("Generating Demand Letter PDF buffer...");
      const pdfBuffer = await generatePdfFromHtml(html);

      const outputPath = path.join(process.cwd(), "server/tests/output_demand_letter.pdf");
      fs.writeFileSync(outputPath, pdfBuffer);
      console.log(`✅ Saved demand letter PDF to: ${outputPath}`);
    } else {
      console.log("⚠️ No demand letter records found in database to test.");
    }

    // 2. Fetch a real customer receipt from database
    const receipt = await prisma.customer_receipts.findFirst({
      include: {
        customers: true,
        sales_orders: {
          include: {
            demand_letters: true,
            customer_receipts: true,
            units: true
          }
        }
      }
    });

    if (receipt) {
      console.log(`Found customer receipt in database: ${receipt.receipt_number}`);
      const formatCurrency = (val) =>
        `INR ${Number(val || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      // Calculate Dynamic outstanding balance of the Sales Order
      const totalDemanded = (receipt.sales_orders.demand_letters || []).reduce((sum, d) => {
        return sum + Number(d.total_demand_amount || d.principal_amount || 0);
      }, 0);
      const totalReceipts = (receipt.sales_orders.customer_receipts || []).reduce((sum, r) => {
        return sum + Number(r.amount || 0);
      }, 0);
      const remainingBalance = totalDemanded - totalReceipts;

      const templateData = {
        customerName: receipt.customers.full_name || `${receipt.customers.first_name} ${receipt.customers.last_name || ""}`.trim(),
        unitNumber: receipt.sales_orders.units.unit_number,
        orderNumber: receipt.sales_orders.order_number,
        receiptNumber: receipt.receipt_number,
        receiptDate: new Date(receipt.receipt_date).toLocaleDateString("en-IN"),
        amountReceived: formatCurrency(receipt.amount),
        paymentMode: receipt.payment_mode || "NEFT",
        transactionReference: receipt.transaction_reference || receipt.cheque_dd_number || "",
        narration: receipt.narration || "",
        remainingBalance: formatCurrency(remainingBalance)
      };

      console.log("Compiling Payment Receipt HTML template...");
      const html = renderTemplate(receiptTemplate, templateData);

      console.log("Generating Payment Receipt PDF buffer...");
      const pdfBuffer = await generatePdfFromHtml(html);

      const outputPath = path.join(process.cwd(), "server/tests/output_receipt.pdf");
      fs.writeFileSync(outputPath, pdfBuffer);
      console.log(`✅ Saved payment receipt PDF to: ${outputPath}`);
    } else {
      console.log("⚠️ No customer receipt records found in database to test.");
    }

  } catch (error) {
    console.error("❌ PDF Generation integration tests failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests().then(() => {
  console.log("\n🎉 All PDF tests completed successfully!");
});
