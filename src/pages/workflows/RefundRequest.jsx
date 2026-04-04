import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import DataTable from "../../components/shared/DataTable";
import ApprovalWorkflow from "../../components/shared/ApprovalWorkflow";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function RefundRequestPage() {
  const [form, setForm] = useState({
    sales_order_id: "",
    customer_id: "",
    customer_name: "",
    project_name: "",
    unit_number: "",
    request_date: new Date().toISOString().split("T")[0],
    refund_amount: "",
    reason: "cancellation",
    reason_details: "",
    bank_name: "",
    account_number: "",
    ifsc_code: "",
    account_holder_name: "",
    remarks: "",
  });
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({ queryKey: ["refundRequests"], queryFn: () => apiClient.entities.RefundRequest.list("-created_date", 200) });
  const { data: orders = [] } = useQuery({ queryKey: ["salesOrders"], queryFn: () => apiClient.entities.SalesOrder.list("-created_date", 300) });

  const mutation = useMutation({
    mutationFn: (data) => apiClient.entities.RefundRequest.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["refundRequests"] }); toast.success("Refund request submitted"); }
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
      refund_amount: String(order.amount_received || 0),
    }));
  };

  const submit = (e) => {
    e.preventDefault();
    mutation.mutate({
      ...form,
      request_number: "REF" + Date.now().toString(36).toUpperCase(),
      status: "pending",
      refund_amount: Number(form.refund_amount || 0),
    });
  };

  const columns = [
    { header: "Request #", accessor: "request_number", cell: r => <span className="font-mono text-xs font-semibold">{r.request_number || "—"}</span> },
    { header: "Customer", accessor: "customer_name" },
    { header: "Project", accessor: "project_name" },
    { header: "Amount", accessor: "refund_amount", cell: r => <span className="font-semibold">₹{(r.refund_amount || 0).toLocaleString()}</span> },
    { header: "Reason", accessor: "reason", cell: r => (r.reason || "—").replace(/_/g, " ") },
    { header: "Workflow", accessor: "status", cell: r => <ApprovalWorkflow status={r.status} /> }
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Refund Requests" description="Manage refund requests for cancelled/overpaid orders" />
      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_0.8fr] gap-6">
        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base">New Refund Request</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Sales Order</Label>
                  <Select value={form.sales_order_id} onValueChange={pickOrder}>
                    <SelectTrigger><SelectValue placeholder="Select order" /></SelectTrigger>
                    <SelectContent>{orders.map((o) => <SelectItem key={o.id} value={o.id}>{o.order_number} - {o.customer_name} ({o.unit_number})</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Request Date</Label><Input type="date" value={form.request_date} onChange={(e) => setForm((p) => ({ ...p, request_date: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Refund Amount (INR)</Label><Input type="number" value={form.refund_amount} onChange={(e) => setForm((p) => ({ ...p, refund_amount: e.target.value }))} required /></div>
                <div className="space-y-1.5"><Label>Reason</Label><Select value={form.reason} onValueChange={(v) => setForm((p) => ({ ...p, reason: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cancellation">Cancellation</SelectItem><SelectItem value="overpayment">Overpayment</SelectItem><SelectItem value="scheme_change">Scheme Change</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></div>
                <div className="space-y-1.5"><Label>Beneficiary Bank</Label><Input value={form.bank_name} onChange={(e) => setForm((p) => ({ ...p, bank_name: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Account Number</Label><Input value={form.account_number} onChange={(e) => setForm((p) => ({ ...p, account_number: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>IFSC</Label><Input value={form.ifsc_code} onChange={(e) => setForm((p) => ({ ...p, ifsc_code: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Account Holder</Label><Input value={form.account_holder_name} onChange={(e) => setForm((p) => ({ ...p, account_holder_name: e.target.value }))} /></div>
                <div className="space-y-1.5 md:col-span-2"><Label>Detailed Reason</Label><Textarea value={form.reason_details} onChange={(e) => setForm((p) => ({ ...p, reason_details: e.target.value }))} rows={2} /></div>
              </div>
              <div className="flex justify-end gap-3">
                <Button type="submit" disabled={mutation.isPending || !form.sales_order_id}>Submit Refund Request</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-teal-200">
          <CardHeader><CardTitle className="text-base">Refund Journey</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                "Requested",
                "Finance Review",
                "Management Approval",
                "Bank Processing",
                "Disbursed",
              ].map((stage, index) => (
                <div key={stage} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`h-3 w-3 rounded-full ${index === 0 ? "bg-teal-600" : "bg-slate-300"}`} />
                    {index < 4 && <div className="w-px h-8 bg-slate-300 mt-1" />}
                  </div>
                  <div className="pb-1">
                    <p className={`text-sm ${index === 0 ? "font-semibold text-teal-700" : "text-muted-foreground"}`}>{stage}</p>
                    <p className="text-xs text-muted-foreground">{index === 0 ? "Current active stage for new requests" : "Waiting"}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable columns={columns} data={requests} isLoading={isLoading} searchPlaceholder="Search refund requests..." />
    </div>
  );
}