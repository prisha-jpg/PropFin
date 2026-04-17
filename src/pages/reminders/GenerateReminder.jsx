import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export default function GenerateReminder() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [confirmation, setConfirmation] = useState({ createdReminder: null, builderNocId: null });
  const [form, setForm] = useState({
    sales_order_id: "",
    customer_id: "",
    customer_name: "",
    customer_code: "",
    project_name: "",
    unit_number: "",
    outstanding_amount: "",
    reminder_date: new Date().toISOString().split("T")[0],
    due_date: "",
    reminder_type: "first_reminder",
    dispatch_mode: "email",
    remarks: "",
  });

  const { data: salesOrders = [] } = useQuery({ queryKey: ["salesOrders"], queryFn: () => apiClient.entities.SalesOrder.list("-created_date", 300) });
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: () => apiClient.entities.Customer.list("-created_date", 300) });

  const selectedCustomer = customers.find((c) => c.id === form.customer_id);
  const hasActiveLoan = !!selectedCustomer?.has_active_loan;

  const steps = [
    "Customer Selection",
    "Loan Detection",
    "Reminder Preview",
    "Confirm",
  ];

  const mutation = useMutation({
    mutationFn: async (data) => {
      const reminder = await apiClient.entities.PaymentReminder.create(data);

      let builderNoc = null;
      let bankRequestLetter = null;
      if (data.has_active_loan_snapshot) {
        const timestamp = Date.now().toString(36).toUpperCase();
        builderNoc = await apiClient.entities.BankDocument.create({
          document_number: "BD" + timestamp,
          customer_id: data.customer_id,
          customer_name: data.customer_name,
          customer_code: data.customer_code,
          sales_order_id: data.sales_order_id,
          project_name: data.project_name,
          unit_number: data.unit_number,
          document_type: "builder_noc",
          bank_name: selectedCustomer?.loan_bank_name || "",
          loan_account_number: selectedCustomer?.loan_account_number || "",
          agreement_value: Number(data.agreement_value || 0),
          amount_received_to_date: Number(data.amount_received_to_date || 0),
          outstanding_amount: Number(data.outstanding_amount || 0),
          noc_purpose: "loan",
          authorized_signatory: "Authorized Signatory",
          generation_date: data.reminder_date,
          status: "draft",
          triggered_by: "auto_payment_reminder",
          generated_by: "System",
          transaction_reference: data.transaction_reference,
          remarks: `Auto-generated with Reminder ${data.reminder_number}`,
        });

        bankRequestLetter = await apiClient.entities.BankDocument.create({
          document_number: "BRL" + timestamp,
          customer_id: data.customer_id,
          customer_name: data.customer_name,
          customer_code: data.customer_code,
          sales_order_id: data.sales_order_id,
          project_name: data.project_name,
          unit_number: data.unit_number,
          document_type: "bank_request_letter",
          bank_name: selectedCustomer?.loan_bank_name || "",
          loan_account_number: selectedCustomer?.loan_account_number || "",
          agreement_value: Number(data.agreement_value || 0),
          amount_received_to_date: Number(data.amount_received_to_date || 0),
          outstanding_amount: Number(data.outstanding_amount || 0),
          noc_purpose: "loan",
          authorized_signatory: "Authorized Signatory",
          generation_date: data.reminder_date,
          status: "draft",
          triggered_by: "auto_payment_reminder",
          generated_by: "System",
          transaction_reference: data.transaction_reference,
          remarks: `Auto-generated Bank Request Letter with Reminder ${data.reminder_number}`,
        });

        await apiClient.entities.PaymentReminder.update(reminder.id, {
          linked_builder_noc_id: builderNoc.id,
          linked_documents: "Builder NOC, Bank Request Letter",
        });
      }

      return { reminder, builderNoc, bankRequestLetter };
    },
    onSuccess: ({ reminder, builderNoc, bankRequestLetter }) => {
      queryClient.invalidateQueries({ queryKey: ["paymentReminders"] });
      queryClient.invalidateQueries({ queryKey: ["bankDocuments"] });
      setConfirmation({ createdReminder: reminder, builderNocId: builderNoc?.id || null, bankRequestLetterId: bankRequestLetter?.id || null });
      setStep(4);
      toast.success("Reminder and required documents generated successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to generate payment reminder.");
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
      outstanding_amount: String(order.outstanding_amount || ""),
      agreement_value: String(order.total_value || 0),
      amount_received_to_date: String(order.amount_received || 0),
    }));
  };

  const canContinue = useMemo(() => {
    if (step === 1) return !!form.sales_order_id && !!form.due_date;
    if (step === 2) return !!form.customer_id;
    if (step === 3) return true;
    return false;
  }, [step, form]);

  const generateReminder = () => {
    const reminderNumber = "REM" + Date.now().toString(36).toUpperCase();
    mutation.mutate({
      ...form,
      reminder_number: reminderNumber,
      status: "generated",
      outstanding_amount: Number(form.outstanding_amount || 0),
      has_active_loan_snapshot: hasActiveLoan,
      transaction_reference: reminderNumber,
      linked_documents: hasActiveLoan ? "Builder NOC" : "",
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Generate Payment Reminder Letter" description="Wizard flow with loan detection and Builder NOC auto-generation" />
      <Card className="border-indigo-200">
        <CardHeader className="border-b bg-indigo-50/60">
          <div className="flex flex-wrap gap-2">
            {steps.map((label, index) => (
              <Badge key={label} variant={step === index + 1 ? "default" : "outline"} className="rounded-full">
                Step {index + 1}: {label}
              </Badge>
            ))}
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          {step === 1 && (
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
                <Label>Customer</Label>
                <Input value={form.customer_name} readOnly className="bg-muted" />
              </div>
              <div className="space-y-1.5">
                <Label>Reminder Date</Label>
                <Input type="date" value={form.reminder_date} onChange={(e) => setField("reminder_date", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Payment Due Date *</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setField("due_date", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Outstanding Amount (INR)</Label>
                <Input type="number" value={form.outstanding_amount} onChange={(e) => setField("outstanding_amount", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Reminder Type</Label>
                <Select value={form.reminder_type} onValueChange={(v) => setField("reminder_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first_reminder">First Reminder</SelectItem>
                    <SelectItem value="second_reminder">Second Reminder</SelectItem>
                    <SelectItem value="final_notice">Final Notice</SelectItem>
                    <SelectItem value="legal_notice">Legal Notice</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Dispatch Mode</Label>
                <Select value={form.dispatch_mode} onValueChange={(v) => setField("dispatch_mode", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="post">Post</SelectItem>
                    <SelectItem value="courier">Courier</SelectItem>
                    <SelectItem value="hand_delivery">Hand Delivery</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Remarks</Label>
                <Textarea value={form.remarks} onChange={(e) => setField("remarks", e.target.value)} rows={2} />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <Card className="border-dashed">
                <CardContent className="pt-5">
                  <p className="text-sm text-muted-foreground">System Loan Check</p>
                  <p className="text-lg font-semibold mt-1">Customer: {form.customer_name || "-"}</p>
                  <p className="text-sm mt-1">Loan Status: <span className={hasActiveLoan ? "text-emerald-600 font-semibold" : "text-slate-600 font-semibold"}>{hasActiveLoan ? "Active Home Loan Detected" : "No Active Home Loan"}</span></p>
                </CardContent>
              </Card>
              {hasActiveLoan && (
                <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5" />
                  <p>This customer has an active home loan. A Builder NOC will be auto-generated and attached.</p>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <Card>
                <CardHeader><CardTitle className="text-sm">Reminder Preview</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-1">
                  <p><span className="text-muted-foreground">Customer:</span> {form.customer_name}</p>
                  <p><span className="text-muted-foreground">Project/Unit:</span> {form.project_name} / {form.unit_number}</p>
                  <p><span className="text-muted-foreground">Outstanding:</span> INR {Number(form.outstanding_amount || 0).toLocaleString()}</p>
                  <p><span className="text-muted-foreground">Due Date:</span> {form.due_date || "-"}</p>
                  <p><span className="text-muted-foreground">Reminder Type:</span> {form.reminder_type.replace(/_/g, " ")}</p>
                  {hasActiveLoan && <p className="text-blue-700 font-medium">Builder NOC will be auto-attached.</p>}
                </CardContent>
              </Card>
            </div>
          )}

          {step === 4 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 space-y-2">
              <p className="font-semibold flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-600" /> Reminder Generated</p>
              <p className="text-sm">Transaction Reference: {confirmation.createdReminder?.transaction_reference || "-"}</p>
              {confirmation.builderNocId && <p className="text-sm text-emerald-700 font-medium">Builder NOC Auto-Generated</p>}
              <div className="flex gap-2 pt-2">
                <Button onClick={() => navigate("/reminders/inquiry")}>Go to Inquiry</Button>
                <Button variant="outline" onClick={() => { setStep(1); setConfirmation({ createdReminder: null, builderNocId: null }); }}>Generate Another</Button>
              </div>
            </div>
          )}

          {step < 4 && (
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => step === 1 ? navigate(-1) : setStep((s) => s - 1)}>Back</Button>
              {step < 3 && <Button onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>Continue</Button>}
              {step === 3 && <Button onClick={generateReminder} disabled={mutation.isPending}>Confirm & Generate</Button>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}