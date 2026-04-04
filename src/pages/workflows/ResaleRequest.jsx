import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import DataTable from "../../components/shared/DataTable";
import StatusBadge from "../../components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function ResaleRequestPage() {
  const [activeTab, setActiveTab] = useState("owner");
  const [form, setForm] = useState({
    sales_order_id: "",
    seller_customer_id: "",
    seller_name: "",
    unit_number: "",
    buyer_name: "",
    buyer_phone: "",
    buyer_email: "",
    resale_value: "",
    transfer_charges: "",
    outstanding_dues: "",
    remarks: "",
  });
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({ queryKey: ["resaleRequests"], queryFn: () => apiClient.entities.ResaleRequest.list("-created_date", 200) });
  const { data: orders = [] } = useQuery({ queryKey: ["salesOrders"], queryFn: () => apiClient.entities.SalesOrder.list("-created_date", 300) });

  const mutation = useMutation({
    mutationFn: (data) => apiClient.entities.ResaleRequest.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["resaleRequests"] }); toast.success("Resale request submitted"); }
  });

  const pickOrder = (orderId) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    setForm((prev) => ({
      ...prev,
      sales_order_id: order.id,
      seller_customer_id: order.customer_id,
      seller_name: order.customer_name,
      unit_number: order.unit_number,
      resale_value: String(order.total_value || 0),
      outstanding_dues: String(order.outstanding_amount || 0),
    }));
  };

  const canMoveToBuyer = !!form.sales_order_id;
  const canMoveToSettlement = !!form.buyer_name;

  const submit = () => {
    mutation.mutate({
      ...form,
      request_date: new Date().toISOString().split("T")[0],
      request_number: "RS" + Date.now().toString(36).toUpperCase(),
      status: "pending",
      resale_value: Number(form.resale_value || 0),
      transfer_charges: Number(form.transfer_charges || 0),
      outstanding_dues: Number(form.outstanding_dues || 0),
    });
  };

  const columns = [
    { header: "Request #", accessor: "request_number", cell: r => <span className="font-mono text-xs font-semibold">{r.request_number || "—"}</span> },
    { header: "Seller", accessor: "seller_name" },
    { header: "Buyer", accessor: "buyer_name" },
    { header: "Unit", accessor: "unit_number" },
    { header: "Resale Value", accessor: "resale_value", cell: r => `₹${(r.resale_value || 0).toLocaleString()}` },
    { header: "Status", accessor: "status", cell: r => <StatusBadge status={r.status} /> }
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Resale Requests" description="Manage unit resale and ownership transfers" />
      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-base">New Resale Request</CardTitle></CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-3 w-full max-w-2xl">
              <TabsTrigger value="owner">1. Current Owner Details</TabsTrigger>
              <TabsTrigger value="buyer" disabled={!canMoveToBuyer}>2. New Buyer Details</TabsTrigger>
              <TabsTrigger value="settlement" disabled={!canMoveToSettlement}>3. Due Settlement & Documents</TabsTrigger>
            </TabsList>
            <TabsContent value="owner" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Select Existing Sales Order</Label>
                  <Select value={form.sales_order_id} onValueChange={pickOrder}>
                    <SelectTrigger><SelectValue placeholder="Select order" /></SelectTrigger>
                    <SelectContent>{orders.map((o) => <SelectItem key={o.id} value={o.id}>{o.order_number} - {o.customer_name} ({o.unit_number})</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Current Owner</Label><Input value={form.seller_name} readOnly className="bg-muted" /></div>
                <div className="space-y-1.5"><Label>Unit</Label><Input value={form.unit_number} readOnly className="bg-muted" /></div>
              </div>
              <div className="pt-4"><Button onClick={() => setActiveTab("buyer")} disabled={!canMoveToBuyer}>Next</Button></div>
            </TabsContent>

            <TabsContent value="buyer" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label>New Buyer Name *</Label><Input value={form.buyer_name} onChange={(e) => setForm((p) => ({ ...p, buyer_name: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Buyer Phone</Label><Input value={form.buyer_phone} onChange={(e) => setForm((p) => ({ ...p, buyer_phone: e.target.value }))} /></div>
                <div className="space-y-1.5 md:col-span-2"><Label>Buyer Email</Label><Input type="email" value={form.buyer_email} onChange={(e) => setForm((p) => ({ ...p, buyer_email: e.target.value }))} /></div>
              </div>
              <div className="pt-4 flex gap-2"><Button variant="outline" onClick={() => setActiveTab("owner")}>Back</Button><Button onClick={() => setActiveTab("settlement")} disabled={!canMoveToSettlement}>Next</Button></div>
            </TabsContent>

            <TabsContent value="settlement" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5"><Label>Resale Value (INR)</Label><Input type="number" value={form.resale_value} onChange={(e) => setForm((p) => ({ ...p, resale_value: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Transfer Charges (INR)</Label><Input type="number" value={form.transfer_charges} onChange={(e) => setForm((p) => ({ ...p, transfer_charges: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Outstanding Dues (INR)</Label><Input type="number" value={form.outstanding_dues} onChange={(e) => setForm((p) => ({ ...p, outstanding_dues: e.target.value }))} /></div>
                <div className="space-y-1.5 md:col-span-3"><Label>Remarks</Label><Textarea value={form.remarks} onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))} rows={2} /></div>
              </div>
              <div className="pt-4 flex gap-2"><Button variant="outline" onClick={() => setActiveTab("buyer")}>Back</Button><Button onClick={submit} disabled={mutation.isPending || !form.sales_order_id || !form.buyer_name}>Submit Resale Request</Button></div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <DataTable columns={columns} data={requests} isLoading={isLoading} searchPlaceholder="Search..." />
    </div>
  );
}