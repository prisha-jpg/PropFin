import express from "express";
import { PrismaClient } from "@prisma/client";
import { generatePdfFromHtml } from "../utils/pdfGenerator.js";
import { demandLetterTemplate, receiptTemplate } from "../utils/pdfTemplates.js";

const router = express.Router();
const prisma = new PrismaClient();

/**
 * Simple replacement template parser supporting basic conditionals and placeholder interpolation.
 */
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

// GET /api/documents/demand-letter/:id/download
router.get("/demand-letter/:id/download", async (req, res) => {
  try {
    const { id } = req.params;

    const demand = await prisma.demand_letters.findUnique({
      where: { id },
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

    if (!demand) {
      return res.status(404).json({ message: "Demand letter not found." });
    }

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

    const html = renderTemplate(demandLetterTemplate, templateData);
    const pdfBuffer = await generatePdfFromHtml(html);

    res.contentType("application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=DemandLetter_${demand.demand_number}.pdf`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Demand letter PDF generation error:", error);
    return res.status(500).json({ message: error.message });
  }
});

// GET /api/documents/receipt/:id/download
router.get("/receipt/:id/download", async (req, res) => {
  try {
    const { id } = req.params;

    const receipt = await prisma.customer_receipts.findUnique({
      where: { id },
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

    if (!receipt) {
      return res.status(404).json({ message: "Payment receipt not found." });
    }

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

    const html = renderTemplate(receiptTemplate, templateData);
    const pdfBuffer = await generatePdfFromHtml(html);

    res.contentType("application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Receipt_${receipt.receipt_number}.pdf`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Receipt PDF generation error:", error);
    return res.status(500).json({ message: error.message });
  }
});

export default router;
