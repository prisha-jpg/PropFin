import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { downloadDocumentPdf, formatDocumentType } from "@/utils/documents";
import { formatInrCurrency, formatDateString, companyBranding, documentTemplates } from "@/utils/documentTemplates";
import { FileCheck, RefreshCw, Eye } from "lucide-react";

export default function GenerateBankDoc() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    sales_order_id: "",
    customer_id: "",
    customer_name: "",
    customer_code: "",
    project_name: "",
    unit_number: "",
    document_type: "bank_noc",
    bank_name: "",
    branch_name: "",
    loan_account_number: "",
    loan_amount: "",
    noc_issue_date: new Date().toISOString().split("T")[0],
    bank_officer_name: "",
    bank_officer_designation: "",
    agreement_value: "",
    amount_received_to_date: "",
    outstanding_amount: "",
    noc_purpose: "home_loan",
    authorized_signatory: "Authorized Signatory",
    remarks: "",
  });

  const [ledgerLoading, setLedgerLoading] = useState(false);

  const { data: salesOrders = [] } = useQuery({
    queryKey: ["salesOrders"],
    queryFn: () => apiClient.entities.SalesOrder.list("-created_date", 200),
  });

  const mutation = useMutation({
    mutationFn: (data) => apiClient.entities.BankDocument.create(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["bankDocuments"] });
      
      // Trigger browser download using compiling utility
      downloadDocumentPdf(created.document_content);
      
      toast.success(`${formatDocumentType(created.document_type)} generated and downloaded successfully!`);
      navigate("/bank-documents/inquiry");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to generate bank document.");
    }
  });

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const selectOrder = async (orderId) => {
    const order = salesOrders.find((o) => o.id === orderId);
    if (!order) return;
    
    setLedgerLoading(true);
    try {
      // 1. Fetch full customer details to auto-populate loan details if available
      const customerRes = await fetch(`/api/entities/Customer/${order.customer_id}`);
      let customerData = {};
      if (customerRes.ok) {
        customerData = await customerRes.json();
      }

      // 2. Fetch ledger summary to auto-populate actual received credits minus reversals
      const ledgerRes = await fetch(`/api/pricing/ledger-summary/${order.id}`);
      let ledgerSummary = {};
      if (ledgerRes.ok) {
        ledgerSummary = await ledgerRes.json();
      }

      setForm((prev) => ({
        ...prev,
        sales_order_id: order.id,
        customer_id: order.customer_id,
        customer_name: order.customer_name || customerData.full_name || "",
        customer_code: order.customer_code || customerData.customer_code || "",
        project_name: order.project_name || "",
        unit_number: order.unit_number || "",
        agreement_value: String(order.agreement_value || order.total_value || "0"),
        amount_received_to_date: String(ledgerSummary.amountReceivedToDate || "0"),
        outstanding_amount: String(ledgerSummary.outstandingBalance || "0"),
        bank_name: customerData.loan_bank_id || customerData.loan_bank_name || "",
        branch_name: customerData.loan_branch || "",
        loan_account_number: customerData.loan_account_number || "",
        loan_amount: customerData.loan_sanctioned_amount ? String(customerData.loan_sanctioned_amount) : "",
      }));
    } catch (err) {
      console.error("Failed to load details for selected order:", err);
      toast.error("Error auto-populating CRM details.");
    } finally {
      setLedgerLoading(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (!form.sales_order_id) {
      toast.error("Please select a Sales Order first.");
      return;
    }
    if (!form.bank_name || !form.branch_name) {
      toast.error("Bank Name and Branch Name are required.");
      return;
    }
    if (!form.agreement_value || Number(form.agreement_value) <= 0) {
      toast.error("Agreement Value is required and must be greater than zero.");
      return;
    }
    if (!form.noc_issue_date) {
      toast.error("Issue Date is required.");
      return;
    }

    mutation.mutate({
      sales_order_id: form.sales_order_id,
      customer_id: form.customer_id,
      document_type: form.document_type,
      bank_name: form.bank_name,
      branch_name: form.branch_name,
      loan_account_number: form.loan_account_number,
      loan_amount: null,
      bank_officer_name: form.bank_officer_name,
      bank_officer_designation: form.bank_officer_designation,
      noc_purpose: form.noc_purpose,
      agreement_value: Number(form.agreement_value || 0),
      amount_received_to_date: Number(form.amount_received_to_date || 0),
      authorized_signatory: form.authorized_signatory,
      remarks: form.remarks,
      noc_issue_date: form.noc_issue_date
    });
  };

  // Compile helper for visual preview
  const compileText = (str) => {
    if (!str) return "";
    return str
      .replace(/{{bank_name}}/g, form.bank_name || "—")
      .replace(/{{branch_name}}/g, form.branch_name || "—")
      .replace(/{{agreement_value}}/g, formatInrCurrency(form.agreement_value))
      .replace(/{{amount_received}}/g, formatInrCurrency(form.amount_received_to_date))
      .replace(/{{unit_number}}/g, form.unit_number || "—");
  };

  const currentTemplate = documentTemplates[form.document_type] || documentTemplates.bank_noc;

  return (
    <div className="space-y-6">
      <PageHeader title="Generate Bank Documents" description="Generate professional Bank NOC or Builder NOC PDFs using real-time CRM ledger data" />
      
      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1.1fr] gap-6">
        
        {/* Input Form Column */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b bg-slate-50/70 py-4">
            <CardTitle className="text-base font-bold text-slate-800">Document Parameters</CardTitle>
            <CardDescription>Configure variable details for PDF rendering</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-slate-700 font-semibold">Sales Order *</Label>
                  <Select value={form.sales_order_id} onValueChange={selectOrder}>
                    <SelectTrigger className="border-slate-200"><SelectValue placeholder="Select order" /></SelectTrigger>
                    <SelectContent>
                      {salesOrders.map((o) => (
                        <SelectItem key={o.id} value={o.id}>{o.order_number} - {o.customer_name} ({o.unit_number})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-1.5">
                  <Label className="text-slate-700 font-semibold">Document Type *</Label>
                  <Select value={form.document_type} onValueChange={(v) => setField("document_type", v)}>
                    <SelectTrigger className="border-slate-200"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_noc">Bank NOC</SelectItem>
                      <SelectItem value="builder_noc">Builder NOC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-slate-700 font-semibold">Customer Name</Label>
                  <Input value={form.customer_name} onChange={(e) => setField("customer_name", e.target.value)} className="border-slate-200" required />
                </div>
                
                <div className="space-y-1.5">
                  <Label className="text-slate-700 font-semibold">Customer Code</Label>
                  <Input value={form.customer_code} onChange={(e) => setField("customer_code", e.target.value)} className="border-slate-200 bg-slate-50" readOnly />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-slate-700 font-semibold">Project Name</Label>
                  <Input value={form.project_name} onChange={(e) => setField("project_name", e.target.value)} className="border-slate-200 bg-slate-50" readOnly required />
                </div>
                
                <div className="space-y-1.5">
                  <Label className="text-slate-700 font-semibold">Unit No.</Label>
                  <Input value={form.unit_number} onChange={(e) => setField("unit_number", e.target.value)} className="border-slate-200 bg-slate-50" readOnly required />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-slate-700 font-semibold">Bank Name *</Label>
                  <Input value={form.bank_name} onChange={(e) => setField("bank_name", e.target.value)} placeholder="e.g. HDFC Bank Ltd." className="border-slate-200" required />
                </div>
                
                <div className="space-y-1.5">
                  <Label className="text-slate-700 font-semibold">Branch *</Label>
                  <Input value={form.branch_name} onChange={(e) => setField("branch_name", e.target.value)} placeholder="e.g. MG Road Branch" className="border-slate-200" required />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-slate-700 font-semibold">Loan Account Number</Label>
                  <Input value={form.loan_account_number} onChange={(e) => setField("loan_account_number", e.target.value)} placeholder="Enter loan account no." className="border-slate-200" />
                </div>
                
                <div className="space-y-1.5">
                  <Label className="text-slate-700 font-semibold">Agreement Value *</Label>
                  <Input type="number" value={form.agreement_value} onChange={(e) => setField("agreement_value", e.target.value)} placeholder="e.g. 5000000" className="border-slate-200 font-semibold text-slate-800" required />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-slate-700 font-semibold">NOC Issue Date *</Label>
                  <Input type="date" value={form.noc_issue_date} onChange={(e) => setField("noc_issue_date", e.target.value)} className="border-slate-200" required />
                </div>
                
                <div className="space-y-1.5">
                  <Label className="text-slate-700 font-semibold">NOC Purpose</Label>
                  <Select value={form.noc_purpose} onValueChange={(v) => setField("noc_purpose", v)}>
                    <SelectTrigger className="border-slate-200"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="home_loan">Home Loan</SelectItem>
                      <SelectItem value="mortgage">Mortgage</SelectItem>
                      <SelectItem value="resale">Resale</SelectItem>
                      <SelectItem value="handover">Handover</SelectItem>
                      <SelectItem value="general">General / Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-slate-700 font-semibold">Bank Officer Name</Label>
                  <Input value={form.bank_officer_name} onChange={(e) => setField("bank_officer_name", e.target.value)} placeholder="e.g. Anil Kumar" className="border-slate-200" />
                </div>
                
                <div className="space-y-1.5">
                  <Label className="text-slate-700 font-semibold">Officer Designation</Label>
                  <Input value={form.bank_officer_designation} onChange={(e) => setField("bank_officer_designation", e.target.value)} placeholder="e.g. Relationship Manager" className="border-slate-200" />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-slate-700 font-semibold">Amount Received To Date</Label>
                  <Input type="number" value={form.amount_received_to_date} onChange={(e) => setField("amount_received_to_date", e.target.value)} className="border-slate-200 bg-slate-50 font-semibold text-emerald-800" readOnly />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-slate-700 font-semibold">Authorized Signatory</Label>
                  <Input value={form.authorized_signatory} onChange={(e) => setField("authorized_signatory", e.target.value)} className="border-slate-200" />
                </div>
              </div>
              
              <div className="space-y-1.5">
                <Label className="text-slate-700 font-semibold">Remarks</Label>
                <Textarea value={form.remarks} onChange={(e) => setField("remarks", e.target.value)} placeholder="Add any details or internal narration notes..." rows={2} className="border-slate-200" />
              </div>
              
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
                <Button type="submit" disabled={mutation.isPending || ledgerLoading || !form.customer_id} className="bg-teal-700 hover:bg-teal-800">
                  {mutation.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Generating...
                    </>
                  ) : (
                    <>
                      <FileCheck className="mr-2 h-4 w-4" /> Generate Document
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Live A4 Document Preview Panel */}
        <Card className="border-slate-300 shadow-lg flex flex-col h-[750px] overflow-hidden bg-slate-100">
          <CardHeader className="bg-white border-b py-3 px-4 flex-shrink-0 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-800">
                <Eye className="w-4 h-4 text-teal-600" /> Print Preview
              </CardTitle>
              <CardDescription className="text-[11px]">Dynamic A4 letterhead simulation</CardDescription>
            </div>
            <span className="text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded uppercase">
              {formatDocumentType(form.document_type)}
            </span>
          </CardHeader>
          
          <CardContent className="p-6 overflow-y-auto flex-grow flex justify-center">
            {/* Scrollable A4 Page Layout */}
            <div className="w-[500px] min-h-[700px] bg-white border border-slate-300 shadow-sm p-8 text-[9px] text-slate-800 flex flex-col justify-between font-serif relative leading-relaxed">
              
              <div>
                {/* Header Letterhead */}
                <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center font-sans font-bold text-xs">P</div>
                    <div>
                      <p className="font-sans font-extrabold text-[10px] tracking-wide text-slate-900">{companyBranding.name}</p>
                      <p className="font-sans text-[6.5px] text-slate-500">CIN: {companyBranding.cin}</p>
                    </div>
                  </div>
                  <div className="text-right text-[6.5px] text-slate-500 leading-tight">
                    <p>{companyBranding.website} · {companyBranding.phone}</p>
                    <p>{companyBranding.email}</p>
                  </div>
                </div>

                {/* Reference No & Date */}
                <div className="flex justify-between font-sans text-[7.5px] text-slate-600 mb-4">
                  <p>Ref: <span className="font-mono text-slate-900 font-semibold">BNOC-2026-XXXXXX</span></p>
                  <p>Date: <span className="text-slate-900 font-semibold">{formatDateString(form.noc_issue_date)}</span></p>
                </div>

                {/* Salutation Recipient */}
                <div className="mb-4 leading-normal font-sans text-slate-900 font-semibold">
                  <p>To,</p>
                  <p>The Branch Manager,</p>
                  <p className="text-teal-900 font-bold">{form.bank_name || "[Bank Name]"}</p>
                  <p>{form.branch_name || "[Branch Name]"}</p>
                </div>

                {/* Subject Block */}
                <div className="mb-4 text-center border-t border-b border-dashed border-slate-200 py-1.5">
                  <p className="font-sans font-extrabold uppercase text-[8.5px] text-slate-900">
                    Subject: {compileText(currentTemplate.subject(form))}
                  </p>
                </div>

                {/* Intro Paragraph */}
                <p className="mb-4 leading-relaxed font-serif">
                  {compileText(currentTemplate.bodyIntro)}
                </p>

                {/* Property Details Title & Table */}
                <p className="font-sans font-extrabold uppercase text-[7.5px] tracking-wider text-slate-700 mb-1">I. Property Specification</p>
                <table className="w-full border-collapse border border-slate-200 mb-4 text-[7px] font-sans">
                  <thead>
                    <tr className="bg-slate-50 text-slate-700 font-bold">
                      <th className="border border-slate-200 p-1 text-left">Flat No</th>
                      <th className="border border-slate-200 p-1 text-left">Building Name</th>
                      <th className="border border-slate-200 p-1 text-left">Survey Number</th>
                      <th className="border border-slate-200 p-1 text-left">Locality</th>
                      <th className="border border-slate-200 p-1 text-left">City</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="text-slate-900 font-medium">
                      <td className="border border-slate-200 p-1">{form.unit_number || "—"}</td>
                      <td className="border border-slate-200 p-1">{form.project_name || "—"}</td>
                      <td className="border border-slate-200 p-1">Survey No. 44</td>
                      <td className="border border-slate-200 p-1">{form.branch_name ? "Balewadi" : "—"}</td>
                      <td className="border border-slate-200 p-1">Pune</td>
                    </tr>
                  </tbody>
                </table>

                {/* Purchaser Details Title & Table */}
                <p className="font-sans font-extrabold uppercase text-[7.5px] tracking-wider text-slate-700 mb-1">II. Purchaser Ledger</p>
                <table className="w-full border-collapse border border-slate-200 mb-4 text-[7px] font-sans">
                  <thead>
                    <tr className="bg-slate-50 text-slate-700 font-bold">
                      <th className="border border-slate-200 p-1 text-left">Purchaser Name</th>
                      <th className="border border-slate-200 p-1 text-left">Co-applicant</th>
                      <th className="border border-slate-200 p-1 text-left">Agreement Date</th>
                      <th className="border border-slate-200 p-1 text-left">Agreement Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="text-slate-900 font-medium">
                      <td className="border border-slate-200 p-1">{form.customer_name || "—"}</td>
                      <td className="border border-slate-200 p-1">N/A</td>
                      <td className="border border-slate-200 p-1">14-Apr-2026</td>
                      <td className="border border-slate-200 p-1">{formatInrCurrency(form.agreement_value)}</td>
                    </tr>
                  </tbody>
                </table>

                {/* Financing details table */}
                <p className="font-sans font-extrabold uppercase text-[7.5px] tracking-wider text-slate-700 mb-1">III. Sanction Details</p>
                <table className="w-full border-collapse border border-slate-200 mb-4 text-[7px] font-sans">
                  <thead>
                    <tr className="bg-slate-50 text-slate-700 font-bold">
                      <th className="border border-slate-200 p-1 text-left">Sanction Amount</th>
                      <th className="border border-slate-200 p-1 text-left">Financing Bank</th>
                      <th className="border border-slate-200 p-1 text-left">Loan Account Number</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="text-slate-900 font-medium">
                      <td className="border border-slate-200 p-1">{form.loan_amount ? formatInrCurrency(form.loan_amount) : "—"}</td>
                      <td className="border border-slate-200 p-1">{form.bank_name || "—"}</td>
                      <td className="border border-slate-200 p-1">{form.loan_account_number || "—"}</td>
                    </tr>
                  </tbody>
                </table>

                {/* Clauses Lists */}
                <p className="font-sans font-extrabold uppercase text-[7.5px] tracking-wider text-slate-700 mb-1.5">IV. Covenants & Clauses</p>
                <div className="space-y-1 font-serif text-[7.5px] leading-relaxed">
                  {currentTemplate.clauses.map((clause, idx) => (
                    <div key={idx} className="flex gap-1.5 items-start">
                      <span className="font-bold">{idx + 1}.</span>
                      <p>{compileText(clause)}</p>
                    </div>
                  ))}
                </div>

                {/* Signature Panel */}
                <div className="mt-8 pt-4 border-t border-slate-100 flex flex-col font-sans">
                  <p className="font-bold text-[8px] text-slate-800">For {companyBranding.name}</p>
                  <div className="h-8"></div>
                  <p className="font-extrabold text-[8px] text-slate-900">{form.authorized_signatory || "Authorized Signatory"}</p>
                  <p className="text-[6.5px] text-slate-500">Signatory Designation</p>
                </div>
              </div>

              {/* A4 Letterhead Footer */}
              <div className="border-t border-slate-200 pt-2 mt-4 text-[6px] text-slate-500 flex justify-between font-sans flex-shrink-0">
                <div>
                  <p>Regd Office: {companyBranding.registeredOffice}</p>
                  <p>Corporate Office: {companyBranding.corporateOffice}</p>
                </div>
                <p className="text-right self-end font-semibold">Page 1 of 1</p>
              </div>

            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}