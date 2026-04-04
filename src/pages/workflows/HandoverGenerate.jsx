import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function HandoverGenerate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    sales_order_id: "",
    customer_id: "",
    customer_name: "",
    project_name: "",
    unit_number: "",
    total_value: "",
    amount_received: "",
    outstanding_amount: "",
    handover_date: "",
    remarks: "",
  });

  const { data: orders = [] } = useQuery({ queryKey: ["salesOrders"], queryFn: () => apiClient.entities.SalesOrder.list("-created_date", 300) });

  const steps = ["Customer Selection", "Unit Verification", "Payment Check", "Confirm & Submit"];

  const mutation = useMutation({
    mutationFn: (data) => apiClient.entities.HandoverRequest.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["handoverRequests"] }); toast.success("Handover request created"); navigate("/handover/approved"); }
  });

  const selectOrder = (orderId) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    setForm((prev) => ({
      ...prev,
      sales_order_id: order.id,
      customer_id: order.customer_id,
      customer_name: order.customer_name,
      project_name: order.project_name,
      unit_number: order.unit_number,
      total_value: String(order.total_value || 0),
      amount_received: String(order.amount_received || 0),
      outstanding_amount: String(order.outstanding_amount || 0),
    }));
  };

  const paymentPct = useMemo(() => {
    const total = Number(form.total_value || 0);
    const received = Number(form.amount_received || 0);
    if (!total) return 0;
    return Number(((received / total) * 100).toFixed(1));
  }, [form.total_value, form.amount_received]);

  const submit = () => {
    mutation.mutate({
      ...form,
      request_date: new Date().toISOString().split("T")[0],
      request_number: "HO" + Date.now().toString(36).toUpperCase(),
      status: "pending",
      total_value: Number(form.total_value || 0),
      amount_received: Number(form.amount_received || 0),
      outstanding_amount: Number(form.outstanding_amount || 0),
      payment_percentage: paymentPct,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Generate Handover Request" description="Initiate a unit handover once payment milestones are met" />
      <Card>
        <CardHeader className="border-b">
          <div className="space-y-3">
            <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
              <div className="h-full bg-teal-600 transition-all" style={{ width: `${(step / 4) * 100}%` }} />
            </div>
            <div className="flex flex-wrap gap-2">
              {steps.map((s, i) => <Badge key={s} variant={step === i + 1 ? "default" : "outline"}>Step {i + 1}: {s}</Badge>)}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {step === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Sales Order *</Label>
                <Select value={form.sales_order_id} onValueChange={selectOrder}>
                  <SelectTrigger><SelectValue placeholder="Select order" /></SelectTrigger>
                  <SelectContent>{orders.map((o) => <SelectItem key={o.id} value={o.id}>{o.order_number} - {o.customer_name} ({o.unit_number})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Customer</Label><Input value={form.customer_name} readOnly className="bg-muted" /></div>
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-md border p-4"><p className="text-xs text-muted-foreground">Project</p><p className="font-medium">{form.project_name || "-"}</p></div>
              <div className="rounded-md border p-4"><p className="text-xs text-muted-foreground">Unit</p><p className="font-medium">{form.unit_number || "-"}</p></div>
              <div className="space-y-1.5"><Label>Proposed Handover Date *</Label><Input type="date" value={form.handover_date} onChange={(e) => setForm((p) => ({ ...p, handover_date: e.target.value }))} /></div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-md border p-4"><p className="text-xs text-muted-foreground">Total Value</p><p className="font-semibold">INR {Number(form.total_value || 0).toLocaleString()}</p></div>
                <div className="rounded-md border p-4"><p className="text-xs text-muted-foreground">Amount Received</p><p className="font-semibold text-emerald-600">INR {Number(form.amount_received || 0).toLocaleString()}</p></div>
                <div className="rounded-md border p-4"><p className="text-xs text-muted-foreground">Outstanding</p><p className="font-semibold text-red-600">INR {Number(form.outstanding_amount || 0).toLocaleString()}</p></div>
              </div>
              <div className="rounded-md border p-4">
                <p className="text-sm font-medium mb-2">Payment Completion</p>
                <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div className={`h-full ${paymentPct >= 90 ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${Math.min(paymentPct, 100)}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-2">{paymentPct}% collected</p>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <Card>
                <CardHeader><CardTitle className="text-sm">Confirm Request</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p>Customer: {form.customer_name}</p>
                  <p>Unit: {form.unit_number}</p>
                  <p>Handover Date: {form.handover_date || "-"}</p>
                  <p>Payment %: {paymentPct}%</p>
                  <div className="space-y-1.5 pt-2"><Label>Remarks</Label><Textarea value={form.remarks} onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))} rows={2} /></div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="flex justify-between pt-6">
            <Button variant="outline" onClick={() => step === 1 ? navigate(-1) : setStep((s) => s - 1)}>Back</Button>
            {step < 4 && <Button onClick={() => setStep((s) => s + 1)} disabled={(step === 1 && !form.sales_order_id) || (step === 2 && !form.handover_date)}>Continue</Button>}
            {step === 4 && <Button onClick={submit} disabled={mutation.isPending}>Confirm & Submit</Button>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}