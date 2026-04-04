import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function CancellationRequestPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    sales_order_id: "",
    customer_id: "",
    customer_name: "",
    project_name: "",
    unit_number: "",
    request_date: new Date().toISOString().split("T")[0],
    reason: "",
    total_value: "",
    amount_received: "",
    penalty_rate: "8",
    admin_charges: "25000",
    remarks: "",
  });

  const { data: orders = [] } = useQuery({ queryKey: ["salesOrders"], queryFn: () => apiClient.entities.SalesOrder.list("-created_date", 300) });

  const mutation = useMutation({
    mutationFn: (data) => apiClient.entities.CancellationRequest.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["cancellationRequests"] }); toast.success("Cancellation request submitted"); navigate("/cancellation/approved"); }
  });

  const pickOrder = (orderId) => {
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
    }));
  };

  const penaltyAmount = Math.round((Number(form.amount_received || 0) * Number(form.penalty_rate || 0)) / 100 + Number(form.admin_charges || 0));
  const refundAmount = Math.max(0, Number(form.amount_received || 0) - penaltyAmount);

  const submit = () => {
    mutation.mutate({
      ...form,
      request_number: "CAN" + Date.now().toString(36).toUpperCase(),
      status: "pending",
      total_value: Number(form.total_value || 0),
      amount_received: Number(form.amount_received || 0),
      deduction_amount: penaltyAmount,
      refund_amount: refundAmount,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Unit Cancellation" description="Request cancellation of a booked/allotted unit" />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="border-amber-200">
          <CardHeader><CardTitle className="text-base">Customer & Unit Snapshot</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Sales Order</Label>
              <Select value={form.sales_order_id} onValueChange={pickOrder}>
                <SelectTrigger><SelectValue placeholder="Search customer/unit" /></SelectTrigger>
                <SelectContent>{orders.map((o) => <SelectItem key={o.id} value={o.id}>{o.order_number} - {o.customer_name} ({o.unit_number})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Customer</p><p className="font-medium">{form.customer_name || "-"}</p></div>
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Unit</p><p className="font-medium">{form.unit_number || "-"}</p></div>
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Total Value</p><p className="font-medium">INR {Number(form.total_value || 0).toLocaleString()}</p></div>
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Amount Paid</p><p className="font-medium text-emerald-600">INR {Number(form.amount_received || 0).toLocaleString()}</p></div>
            </div>
            <div className="rounded-md bg-red-50 border border-red-200 p-3">
              <p className="text-xs text-red-700">Outstanding</p>
              <p className="font-semibold text-red-700">INR {Math.max(0, Number(form.total_value || 0) - Number(form.amount_received || 0)).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base">Cancellation Form & Penalty Preview</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Request Date</Label><Input type="date" value={form.request_date} onChange={(e) => setForm((p) => ({ ...p, request_date: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Penalty Rate (%)</Label><Input type="number" value={form.penalty_rate} onChange={(e) => setForm((p) => ({ ...p, penalty_rate: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Admin Charges (INR)</Label><Input type="number" value={form.admin_charges} onChange={(e) => setForm((p) => ({ ...p, admin_charges: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label>Cancellation Reason</Label><Textarea value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} rows={3} /></div>
            <div className="space-y-1.5"><Label>Remarks</Label><Textarea value={form.remarks} onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))} rows={2} /></div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">Live Penalty Preview</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-sm">
                <p>Penalty Amount: <span className="font-semibold">INR {penaltyAmount.toLocaleString()}</span></p>
                <p>Estimated Refund: <span className="font-semibold text-emerald-700">INR {refundAmount.toLocaleString()}</span></p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
              <Button onClick={submit} disabled={mutation.isPending || !form.sales_order_id || !form.reason}>Submit Cancellation</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}