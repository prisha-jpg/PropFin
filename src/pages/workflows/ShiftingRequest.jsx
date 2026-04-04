import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import DataTable from "../../components/shared/DataTable";
import StatusBadge from "../../components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function ShiftingRequestPage() {
  const [form, setForm] = useState({
    sales_order_id: "",
    customer_id: "",
    customer_name: "",
    request_date: new Date().toISOString().split("T")[0],
    current_project: "",
    current_unit: "",
    current_unit_value: "",
    current_floor: "",
    current_area: "",
    new_project: "",
    new_unit: "",
    new_unit_value: "",
    new_floor: "",
    new_area: "",
    reason: "",
  });
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({ queryKey: ["shiftingRequests"], queryFn: () => apiClient.entities.ShiftingRequest.list("-created_date", 200) });
  const { data: orders = [] } = useQuery({ queryKey: ["salesOrders"], queryFn: () => apiClient.entities.SalesOrder.list("-created_date", 300) });

  const mutation = useMutation({
    mutationFn: (data) => apiClient.entities.ShiftingRequest.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["shiftingRequests"] }); toast.success("Shifting request submitted"); }
  });

  const pickCurrent = (orderId) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    setForm((prev) => ({
      ...prev,
      sales_order_id: order.id,
      customer_id: order.customer_id,
      customer_name: order.customer_name,
      current_project: order.project_name,
      current_unit: order.unit_number,
      current_unit_value: String(order.total_value || 0),
      current_floor: String(order.floor || ""),
      current_area: String(order.area || ""),
    }));
  };

  const priceDelta = Number(form.new_unit_value || 0) - Number(form.current_unit_value || 0);
  const floorDelta = (Number(form.new_floor || 0) - Number(form.current_floor || 0));
  const areaDelta = (Number(form.new_area || 0) - Number(form.current_area || 0));

  const submit = () => {
    mutation.mutate({
      ...form,
      request_number: "SH" + Date.now().toString(36).toUpperCase(),
      status: "pending",
      new_unit_value: Number(form.new_unit_value || 0),
      difference_amount: priceDelta,
    });
  };

  const columns = [
    { header: "Request #", accessor: "request_number", cell: r => <span className="font-mono text-xs font-semibold">{r.request_number || "—"}</span> },
    { header: "Customer", accessor: "customer_name" },
    { header: "From", cell: r => `${r.current_project || ""} / ${r.current_unit || ""}` },
    { header: "To", cell: r => `${r.new_project || ""} / ${r.new_unit || ""}` },
    { header: "Difference", accessor: "difference_amount", cell: r => `₹${(r.difference_amount || 0).toLocaleString()}` },
    { header: "Status", accessor: "status", cell: r => <StatusBadge status={r.status} /> }
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Shifting Requests" description="Request unit transfer between projects" />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base">Current Unit (Read-Only)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Select Existing Sales Order</Label>
              <Select value={form.sales_order_id} onValueChange={pickCurrent}>
                <SelectTrigger><SelectValue placeholder="Select current unit" /></SelectTrigger>
                <SelectContent>{orders.map((o) => <SelectItem key={o.id} value={o.id}>{o.order_number} - {o.customer_name} ({o.unit_number})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Customer</p><p className="font-medium">{form.customer_name || "-"}</p></div>
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Unit</p><p className="font-medium">{form.current_unit || "-"}</p></div>
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Current Price</p><p className="font-medium">INR {Number(form.current_unit_value || 0).toLocaleString()}</p></div>
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Current Floor / Area</p><p className="font-medium">{form.current_floor || "-"} / {form.current_area || "-"}</p></div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-indigo-200">
          <CardHeader><CardTitle className="text-base">Requested Unit (Editable)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>New Project</Label><Input value={form.new_project} onChange={(e) => setForm((p) => ({ ...p, new_project: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>New Unit</Label><Input value={form.new_unit} onChange={(e) => setForm((p) => ({ ...p, new_unit: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>New Unit Value (INR)</Label><Input type="number" value={form.new_unit_value} onChange={(e) => setForm((p) => ({ ...p, new_unit_value: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>New Floor</Label><Input type="number" value={form.new_floor} onChange={(e) => setForm((p) => ({ ...p, new_floor: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>New Area (sq.ft.)</Label><Input type="number" value={form.new_area} onChange={(e) => setForm((p) => ({ ...p, new_area: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label>Reason for Shifting</Label><Textarea value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} rows={2} /></div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm flex flex-wrap gap-4">
        <p>Price Delta: <span className={`font-semibold ${priceDelta >= 0 ? "text-amber-700" : "text-emerald-700"}`}>INR {priceDelta.toLocaleString()}</span></p>
        <p>Floor Change: <span className="font-semibold">{floorDelta >= 0 ? "+" : ""}{floorDelta}</span></p>
        <p>Area Difference: <span className="font-semibold">{areaDelta >= 0 ? "+" : ""}{areaDelta} sq.ft.</span></p>
        <div className="ml-auto">
          <Button onClick={submit} disabled={mutation.isPending || !form.sales_order_id || !form.new_unit}>Submit Shifting Request</Button>
        </div>
      </div>

      <DataTable columns={columns} data={requests} isLoading={isLoading} searchPlaceholder="Search..." />
    </div>
  );
}