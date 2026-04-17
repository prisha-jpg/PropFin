import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function SalesOrderForm({ order, onSubmit, onCancel, isLoading }) {
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => apiClient.entities.Customer.list("-created_date", 200)
  });

  const [form, setForm] = useState({
    customer_id: order?.customer_id || "",
    customer_name: order?.customer_name || "",
    project_name: order?.project_name || "",
    unit_number: order?.unit_number || "",
    unit_type: order?.unit_type || "",
    total_value: order?.total_value || "",
    booking_date: order?.booking_date || "",
    agreement_date: order?.agreement_date || "",
    possession_date: order?.possession_date || "",
    amount_received: order?.amount_received || 0,
    outstanding_amount: order?.outstanding_amount || "",
    status: order?.status || "booked",
    payment_plan: order?.payment_plan || "",
    stamp_duty: order?.stamp_duty || "",
    registration_charges: order?.registration_charges || "",
    gst_amount: order?.gst_amount || ""
  });

  const h = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleCustomerChange = (id) => {
    const c = customers.find(c => c.id === id);
    h("customer_id", id);
    h("customer_name", c?.full_name || "");
  };

  return (
    <form onSubmit={e => {
      e.preventDefault();
      if (!form.customer_id) {
        toast.error("Please select a customer.");
        return;
      }
      if (!form.project_name || !form.unit_number || !form.total_value) {
        toast.error("Please fill all required sales order fields.");
        return;
      }
      onSubmit({ ...form, total_value: Number(form.total_value), outstanding_amount: Number(form.outstanding_amount || form.total_value) });
    }} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Customer *</Label>
          <Select value={form.customer_id} onValueChange={handleCustomerChange}>
            <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
            <SelectContent>
              {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name} ({c.customer_code})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Project Name *</Label>
          <Input value={form.project_name} onChange={e => h("project_name", e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Unit Number *</Label>
          <Input value={form.unit_number} onChange={e => h("unit_number", e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Unit Type</Label>
          <Select value={form.unit_type} onValueChange={v => h("unit_type", v)}>
            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
            <SelectContent>
              {["1BHK","2BHK","3BHK","4BHK","villa","plot","commercial","office"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Total Value (₹) *</Label>
          <Input type="number" value={form.total_value} onChange={e => h("total_value", e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Payment Plan</Label>
          <Select value={form.payment_plan} onValueChange={v => h("payment_plan", v)}>
            <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
            <SelectContent>
              {["construction_linked","time_linked","down_payment","flexi"].map(p => <SelectItem key={p} value={p}>{p.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Booking Date</Label>
          <Input type="date" value={form.booking_date} onChange={e => h("booking_date", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Agreement Date</Label>
          <Input type="date" value={form.agreement_date} onChange={e => h("agreement_date", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Possession Date</Label>
          <Input type="date" value={form.possession_date} onChange={e => h("possession_date", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={v => h("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["booked","agreement_signed","under_construction","ready_for_possession","handed_over","cancelled"].map(s => <SelectItem key={s} value={s}>{s.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Stamp Duty (₹)</Label>
          <Input type="number" value={form.stamp_duty} onChange={e => h("stamp_duty", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>GST (₹)</Label>
          <Input type="number" value={form.gst_amount} onChange={e => h("gst_amount", e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isLoading || !form.customer_id || !form.project_name || !form.unit_number || !form.total_value}>{order ? "Update" : "Create"} Order</Button>
      </div>
    </form>
  );
}