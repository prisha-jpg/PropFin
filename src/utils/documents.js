import jsPDF from "jspdf";
import { documentTemplates, companyBranding, formatInrCurrency, formatDateString } from "./documentTemplates";

export function formatDocumentType(type) {
  if (type === "bank_noc") return "Bank NOC";
  if (type === "builder_noc") return "Builder NOC";
  return (type || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function createNocPdfBlob(data) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 50;
  const contentWidth = pageWidth - 2 * margin;

  const template = documentTemplates[data.document_type] || documentTemplates.bank_noc;

  // Helper to replace variable tokens in template strings
  const compile = (str) => {
    if (!str) return "";
    return str
      .replace(/{{bank_name}}/g, data.bank_name || "—")
      .replace(/{{branch_name}}/g, data.branch_name || "—")
      .replace(/{{agreement_value}}/g, formatInrCurrency(data.agreement_value))
      .replace(/{{amount_received}}/g, formatInrCurrency(data.amount_received_to_date))
      .replace(/{{unit_number}}/g, data.unit_number || "—");
  };

  let y = 130;
  const lineGap = 16;

  // 1. Draw branding header (Company Info)
  // Vector Logo
  doc.setFillColor(13, 148, 136); // Deep teal
  doc.circle(margin + 12, 50, 12, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("P", margin + 7, 54);

  // Logo Text
  doc.setTextColor(15, 23, 42); // slate-900
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(companyBranding.name, margin + 32, 48);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(`Regd: ${companyBranding.registeredOffice}`, margin + 32, 60);

  // Header Divider
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.line(margin, 72, pageWidth - margin, 72);

  // Document Title
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(template.name.toUpperCase(), pageWidth / 2, 105, { align: "center" });

  // 2. Reference & Date
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Document No: ${data.document_number || "Draft"}`, margin, y);
  doc.text(`Date: ${formatDateString(data.noc_issue_date || data.generation_date)}`, pageWidth - margin, y, { align: "right" });
  y += 24;

  // 3. Recipient
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  const salutationText = compile(template.salutation);
  const lines = salutationText.split("\n");
  lines.forEach((line) => {
    doc.text(line, margin, y);
    y += lineGap;
  });
  y += 10;

  // 4. Subject
  doc.setFont("helvetica", "bold");
  const subjectText = `Subject: ${compile(template.subject(data))}`;
  doc.text(subjectText, margin, y);
  y += 20;

  // 5. Intro Paragraph
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  const introLines = doc.splitTextToSize(compile(template.bodyIntro), contentWidth);
  doc.text(introLines, margin, y);
  y += introLines.length * 13 + 12;

  // 6. Property Details Table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Property Details:", margin, y);
  y += 14;

  const propHeaders = ["Flat No", "Project Name", "Survey No", "Locality", "City"];
  const propRows = [
    [
      data.unit_number || "—",
      data.project_name || "—",
      data.survey_number || "Survey No. 44",
      data.project_location || data.locality || "Balewadi",
      data.project_city || data.city || "Pune"
    ]
  ];
  const propColWidths = [60, 140, 100, 100, 95];
  y = drawTable(doc, margin, y, propHeaders, propRows, propColWidths);
  y += 16;

  // 7. Purchaser Details Table
  doc.setFont("helvetica", "bold");
  doc.text("Purchaser Details:", margin, y);
  y += 14;

  const purHeaders = ["Purchaser Name", "Co-applicant", "Agreement Date", "Agreement Value"];
  const purRows = [
    [
      data.customer_name || "—",
      data.co_applicant || "N/A",
      formatDateString(data.agreement_date) || "—",
      formatInrCurrency(data.agreement_value)
    ]
  ];
  const purColWidths = [150, 120, 100, 125];
  y = drawTable(doc, margin, y, purHeaders, purRows, purColWidths);
  y += 16;

  // Page break check before starting clauses
  if (y > pageHeight - 160) {
    doc.addPage();
    y = 60; // reset y on page 2
  }

  // 8. Loan Details Table (rendered if bank name or loan amount is defined)
  if (data.bank_name || data.loan_amount) {
    doc.setFont("helvetica", "bold");
    doc.text("Financing & Loan Details:", margin, y);
    y += 14;

    const loanHeaders = ["Sanctioned Loan Amount", "Financing Bank", "Loan Account Number"];
    const loanRows = [
      [
        data.loan_amount ? formatInrCurrency(data.loan_amount) : "—",
        data.bank_name || "—",
        data.loan_account_number || "—"
      ]
    ];
    const loanColWidths = [160, 170, 165];
    y = drawTable(doc, margin, y, loanHeaders, loanRows, loanColWidths);
    y += 16;
  }

  // 9. Dynamic Clauses
  doc.setFont("helvetica", "bold");
  doc.text("Terms and Conditions (Clauses):", margin, y);
  y += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  
  template.clauses.forEach((clause, index) => {
    const compiledClause = compile(clause);
    const clauseText = `${index + 1}. ${compiledClause}`;
    const clauseLines = doc.splitTextToSize(clauseText, contentWidth);
    
    // Page break check inside loop
    if (y + clauseLines.length * 13 > pageHeight - 80) {
      doc.addPage();
      y = 60;
    }

    doc.text(clauseLines, margin, y);
    y += clauseLines.length * 13 + 6;
  });

  y += 20;

  // 10. Signature block
  if (y > pageHeight - 100) {
    doc.addPage();
    y = 60;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text(`For ${companyBranding.name}`, margin, y);
  y += 40;
  doc.text(data.authorized_signatory || "Authorized Signatory", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(data.bank_officer_designation || "Signatory Designation", margin, y + 12);

  // 11. Pagination & Footer stamping on all pages
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.line(margin, pageHeight - 50, pageWidth - margin, pageHeight - 50);
    
    doc.text(`${companyBranding.name} | CIN: ${companyBranding.cin} | Web: ${companyBranding.website}`, margin, pageHeight - 38);
    doc.text(`Corporate Office: ${companyBranding.corporateOffice}`, margin, pageHeight - 28);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 38, { align: "right" });
  }

  return doc.output("blob");
}

// Table helper
function drawTable(doc, startX, startY, headers, rows, colWidths) {
  let y = startY;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setFillColor(248, 250, 252); // slate-50 background
  doc.setDrawColor(226, 232, 240); // slate-200 borders
  doc.setTextColor(51, 65, 85); // slate-700
  
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  doc.rect(startX, y, totalWidth, 18, "F");
  doc.rect(startX, y, totalWidth, 18, "S");
  
  let currentX = startX;
  headers.forEach((h, idx) => {
    doc.text(h, currentX + 6, y + 12);
    currentX += colWidths[idx];
  });
  
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(15, 23, 42); // slate-900
  
  rows.forEach((row) => {
    doc.rect(startX, y, totalWidth, 18, "S");
    let cx = startX;
    row.forEach((cell, idx) => {
      doc.text(String(cell || "—"), cx + 6, y + 12);
      cx += colWidths[idx];
    });
    y += 18;
  });
  return y;
}

export function downloadDocumentPdf(data) {
  const docData = data.document_content 
    ? (typeof data.document_content === "string" ? JSON.parse(data.document_content) : data.document_content)
    : data;
  const blob = createNocPdfBlob(docData);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `NOC_${docData.customer_name || "customer"}_${docData.unit_number || "unit"}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function previewDocumentPdf(data) {
  const docData = data.document_content 
    ? (typeof data.document_content === "string" ? JSON.parse(data.document_content) : data.document_content)
    : data;
  const blob = createNocPdfBlob(docData);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
}
