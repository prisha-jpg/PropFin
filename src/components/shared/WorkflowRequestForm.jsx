import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export default function WorkflowRequestForm({ fields = [], onSubmit, onCancel, isLoading, submitLabel = "Submit Request" }) {
  const { data: orders = [] } = useQuery({ queryKey: ["salesOrders"], queryFn: () => apiClient.entities.SalesOrder.list("-created_date", 200) });

  const initForm = {};
  fields.forEach(f => { initForm[f.key] = f.defaultValue || ""; });
  const [form, setForm] = useState(initForm);

  const h = (f, v) => setForm(p => ({ ...p, [f]: v }));
  const requiredFields = fields.filter((f) => f.required).map((f) => f.key);

  const handleOrderChange = (id) => {
    const o = orders.find(o => o.id === id);
    if (o) {
      h("sales_order_id", id);
      h("customer_id", o.customer_id);
      h("customer_name", o.customer_name);
      h("project_name", o.project_name);
      h("unit_number", o.unit_number);
      h("total_value", o.total_value);
      h("amount_received", o.amount_received);
      h("outstanding_amount", o.outstanding_amount);
    }
  };

  return (
    <form onSubmit={e => {
      e.preventDefault();
      if (!form.sales_order_id) {
        toast.error(
          orders.length === 0
            ? "No sales orders found. Create a sales order first, then try again."
            : "Please select a sales order before submitting."
        );
        return;
      }
      const missingRequired = requiredFields.find((key) => !String(form[key] ?? "").trim());
      if (missingRequired) {
        const field = fields.find((item) => item.key === missingRequired);
        toast.error(`Please fill in ${field?.label || missingRequired} — it is required.`);
        return;
      }
      onSubmit(form);
    }} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Always show order selector */}
        <div className="space-y-1.5">
          <Label>Sales Order *</Label>
          <Select value={form.sales_order_id || ""} onValueChange={handleOrderChange} disabled={orders.length === 0}>
            <SelectTrigger><SelectValue placeholder={orders.length === 0 ? "No orders available" : "Select order"} /></SelectTrigger>
            <SelectContent>{orders.map(o => <SelectItem key={o.id} value={o.id}>{o.order_number} - {o.customer_name} ({o.unit_number})</SelectItem>)}</SelectContent>
          </Select>
          {orders.length === 0 && (
            <p className="text-xs text-muted-foreground">Add at least one sales order to enable this workflow.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Customer</Label>
          <Input value={form.customer_name || ""} readOnly className="bg-muted" />
        </div>

        {fields.filter(f => !["sales_order_id","customer_id","customer_name","project_name","unit_number"].includes(f.key)).map(f => (
          <div key={f.key} className={`space-y-1.5 ${f.fullWidth ? "md:col-span-2" : ""}`}>
            <Label>{f.label}{f.required ? " *" : ""}</Label>
            {f.type === "select" ? (
              <Select value={form[f.key]} onValueChange={v => h(f.key, v)}>
                <SelectTrigger><SelectValue placeholder={`Select ${f.label.toLowerCase()}`} /></SelectTrigger>
                <SelectContent>{f.options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            ) : f.type === "textarea" ? (
              <Textarea value={form[f.key]} onChange={e => h(f.key, e.target.value)} rows={2} required={f.required} />
            ) : (
              <Input type={f.type || "text"} value={form[f.key]} onChange={e => h(f.key, e.target.value)} required={f.required} readOnly={f.readOnly} className={f.readOnly ? "bg-muted" : ""} />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isLoading}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}