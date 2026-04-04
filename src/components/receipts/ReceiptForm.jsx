import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export default function ReceiptForm({ onSubmit, onCancel, isLoading }) {
  const { data: orders = [] } = useQuery({ queryKey: ["salesOrders"], queryFn: () => apiClient.entities.SalesOrder.list("-created_date", 200) });

  const [form, setForm] = useState({
    sales_order_id: "", customer_id: "", customer_name: "", project_name: "", unit_number: "",
    receipt_date: new Date().toISOString().split("T")[0], amount: "", payment_mode: "",
    reference_number: "", bank_name: "", towards: "", remarks: ""
  });

  const h = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleOrderChange = (id) => {
    const o = orders.find(o => o.id === id);
    if (o) setForm(p => ({ ...p, sales_order_id: id, customer_id: o.customer_id, customer_name: o.customer_name, project_name: o.project_name, unit_number: o.unit_number }));
  };

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit({ ...form, amount: Number(form.amount), status: "received" }); }} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Sales Order *</Label>
          <Select value={form.sales_order_id} onValueChange={handleOrderChange}>
            <SelectTrigger><SelectValue placeholder="Select order" /></SelectTrigger>
            <SelectContent>{orders.map(o => <SelectItem key={o.id} value={o.id}>{o.order_number} - {o.customer_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Receipt Date</Label>
          <Input type="date" value={form.receipt_date} onChange={e => h("receipt_date", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Amount (₹) *</Label>
          <Input type="number" value={form.amount} onChange={e => h("amount", e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Payment Mode *</Label>
          <Select value={form.payment_mode} onValueChange={v => h("payment_mode", v)}>
            <SelectTrigger><SelectValue placeholder="Select mode" /></SelectTrigger>
            <SelectContent>
              {["cheque","neft","rtgs","upi","cash","demand_draft","online"].map(m => <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Reference Number</Label>
          <Input value={form.reference_number} onChange={e => h("reference_number", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Bank Name</Label>
          <Input value={form.bank_name} onChange={e => h("bank_name", e.target.value)} />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>Payment Towards</Label>
          <Select value={form.towards} onValueChange={v => h("towards", v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {["booking_amount","installment","stamp_duty","registration","gst","interest","other"].map(t => <SelectItem key={t} value={t}>{t.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Remarks</Label>
        <Textarea value={form.remarks} onChange={e => h("remarks", e.target.value)} rows={2} />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isLoading}>Record Payment</Button>
      </div>
    </form>
  );
}