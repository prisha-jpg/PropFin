import jsPDF from "jspdf";

export function formatDocumentType(type) {
  if (type === "bank_noc") return "Bank NOC";
  if (type === "builder_noc") return "Builder NOC";
  return (type || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function createNocPdfBlob(data) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const now = new Date();
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(formatDocumentType(data.document_type), pageWidth / 2, 56, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Reference: ${data.document_number || "-"}`, 50, 84);
  doc.text(`Generated: ${data.generation_date || now.toISOString().split("T")[0]}`, 50, 100);

  let y = 136;
  const lineGap = 20;

  const fields = [
    ["Customer Name", data.customer_name],
    ["Customer Code", data.customer_code],
    ["Project", data.project_name],
    ["Unit", data.unit_number],
    ["Bank Name", data.bank_name],
    ["Branch", data.branch_name],
    ["Loan Account Number", data.loan_account_number],
    ["Loan Sanctioned Amount", data.loan_amount ? `INR ${Number(data.loan_amount).toLocaleString()}` : ""],
    ["NOC Issue Date", data.noc_issue_date],
    ["Bank Officer", data.bank_officer_name],
    ["Officer Designation", data.bank_officer_designation],
    ["Agreement Value", data.agreement_value ? `INR ${Number(data.agreement_value).toLocaleString()}` : ""],
    ["Amount Received To Date", data.amount_received_to_date ? `INR ${Number(data.amount_received_to_date).toLocaleString()}` : ""],
    ["Outstanding Amount", data.outstanding_amount ? `INR ${Number(data.outstanding_amount).toLocaleString()}` : ""],
    ["NOC Purpose", data.noc_purpose],
    ["Authorized Signatory", data.authorized_signatory],
    ["Triggered By", data.triggered_by === "auto_payment_reminder" ? "Auto - Payment Reminder" : "Manual"],
    ["Remarks", data.remarks],
  ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "");

  fields.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, 50, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(value), 210, y);
    y += lineGap;
  });

  y += 24;
  doc.text("Authorized Signature", 50, y);
  doc.line(50, y + 4, 200, y + 4);

  return doc.output("blob");
}

export function downloadDocumentPdf(data) {
  const blob = createNocPdfBlob(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${data.document_number || "document"}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function previewDocumentPdf(data) {
  const blob = createNocPdfBlob(data);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
}
