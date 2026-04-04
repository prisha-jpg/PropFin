import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { downloadDocumentPdf, formatDocumentType } from "@/utils/documents";
import { Badge } from "@/components/ui/badge";
import { FileText, Landmark } from "lucide-react";

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
    noc_purpose: "loan",
    authorized_signatory: "",
    remarks: "",
  });

  const { data: salesOrders = [] } = useQuery({
    queryKey: ["salesOrders"],
    queryFn: () => apiClient.entities.SalesOrder.list("-created_date", 200),
  });

  const mutation = useMutation({
    mutationFn: (data) => apiClient.entities.BankDocument.create(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["bankDocuments"] });
      downloadDocumentPdf(created);
      toast.success(`${formatDocumentType(created.document_type)} generated and downloaded`);
      navigate("/bank-documents/inquiry");
    }
  });

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const selectOrder = (orderId) => {
    const order = salesOrders.find((o) => o.id === orderId);
    if (!order) return;
    setForm((prev) => ({
      ...prev,
      sales_order_id: order.id,
      customer_id: order.customer_id,
      customer_name: order.customer_name,
      customer_code: order.customer_code || "",
      project_name: order.project_name,
      unit_number: order.unit_number,
      agreement_value: String(order.total_value || ""),
      amount_received_to_date: String(order.amount_received || ""),
      outstanding_amount: String(order.outstanding_amount || ""),
    }));
  };

  const submit = (e) => {
    e.preventDefault();
    mutation.mutate({
      ...form,
      document_number: "BD" + Date.now().toString(36).toUpperCase(),
      generation_date: new Date().toISOString().split("T")[0],
      status: "draft",
      triggered_by: "manual",
      generated_by: "Current User",
      loan_amount: Number(form.loan_amount || 0),
      agreement_value: Number(form.agreement_value || 0),
      amount_received_to_date: Number(form.amount_received_to_date || 0),
      outstanding_amount: Number(form.outstanding_amount || 0),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Generate Bank Documents" description="Create Bank NOC or Builder NOC and download as PDF" />
      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-6">
        <Card className="border-slate-200">
          <CardHeader className="border-b bg-slate-50/70">
            <CardTitle className="text-base">Document Input</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Sales Order *</Label>
                  <Select value={form.sales_order_id} onValueChange={selectOrder}>
                    <SelectTrigger><SelectValue placeholder="Select order" /></SelectTrigger>
                    <SelectContent>
                      {salesOrders.map((o) => (
                        <SelectItem key={o.id} value={o.id}>{o.order_number} - {o.customer_name} ({o.unit_number})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Document Type *</Label>
                  <Select value={form.document_type} onValueChange={(v) => setField("document_type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_noc">Bank NOC</SelectItem>
                      <SelectItem value="builder_noc">Builder NOC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Customer Name</Label>
                  <Input value={form.customer_name} onChange={(e) => setField("customer_name", e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Customer Code</Label>
                  <Input value={form.customer_code} onChange={(e) => setField("customer_code", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Project Name</Label>
                  <Input value={form.project_name} onChange={(e) => setField("project_name", e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Unit No.</Label>
                  <Input value={form.unit_number} onChange={(e) => setField("unit_number", e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Bank Name</Label>
                  <Input value={form.bank_name} onChange={(e) => setField("bank_name", e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Branch</Label>
                  <Input value={form.branch_name} onChange={(e) => setField("branch_name", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Loan Account Number</Label>
                  <Input value={form.loan_account_number} onChange={(e) => setField("loan_account_number", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Loan Sanctioned Amount (INR)</Label>
                  <Input type="number" value={form.loan_amount} onChange={(e) => setField("loan_amount", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>NOC Issue Date</Label>
                  <Input type="date" value={form.noc_issue_date} onChange={(e) => setField("noc_issue_date", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>NOC Purpose</Label>
                  <Select value={form.noc_purpose} onValueChange={(v) => setField("noc_purpose", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="loan">Loan</SelectItem>
                      <SelectItem value="resale">Resale</SelectItem>
                      <SelectItem value="handover">Handover</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Bank Officer Name</Label>
                  <Input value={form.bank_officer_name} onChange={(e) => setField("bank_officer_name", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Designation</Label>
                  <Input value={form.bank_officer_designation} onChange={(e) => setField("bank_officer_designation", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Agreement Value (INR)</Label>
                  <Input type="number" value={form.agreement_value} onChange={(e) => setField("agreement_value", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Amount Received To Date (INR)</Label>
                  <Input type="number" value={form.amount_received_to_date} onChange={(e) => setField("amount_received_to_date", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Outstanding Amount (INR)</Label>
                  <Input type="number" value={form.outstanding_amount} onChange={(e) => setField("outstanding_amount", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Authorized Signatory</Label>
                  <Input value={form.authorized_signatory} onChange={(e) => setField("authorized_signatory", e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Remarks</Label>
                <Textarea value={form.remarks} onChange={(e) => setField("remarks", e.target.value)} rows={2} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
                <Button type="submit" disabled={mutation.isPending || !form.customer_id}>Generate & Download PDF</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-gradient-to-b from-slate-50 to-white">
          <CardHeader>
            <CardTitle className="text-sm">Current Document Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Badge variant="outline" className="text-slate-700 border-slate-300">{formatDocumentType(form.document_type)}</Badge>
            <div className="rounded-md border bg-white p-3 space-y-2">
              <p className="font-medium flex items-center gap-2"><Landmark className="w-4 h-4 text-slate-500" /> {form.bank_name || "Bank Name"}</p>
              <p className="text-muted-foreground">{form.customer_name || "Customer"} · {form.unit_number || "Unit"}</p>
              <p className="text-muted-foreground">{form.project_name || "Project"}</p>
              <p className="text-xs">Loan A/C: {form.loan_account_number || "-"}</p>
              <p className="text-xs">Issue Date: {form.noc_issue_date || "-"}</p>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-2"><FileText className="w-3 h-3" /> A printable PDF is downloaded immediately after generation.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}