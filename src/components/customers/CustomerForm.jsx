import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function CustomerForm({ customer, onSubmit, onCancel, isLoading }) {
  const [form, setForm] = useState({
    full_name: customer?.full_name || "",
    email: customer?.email || "",
    phone: customer?.phone || "",
    pan_number: customer?.pan_number || "",
    aadhaar_number: customer?.aadhaar_number || "",
    address: customer?.address || "",
    city: customer?.city || "",
    state: customer?.state || "",
    pincode: customer?.pincode || "",
    date_of_birth: customer?.date_of_birth || "",
    occupation: customer?.occupation || "",
    company_name: customer?.company_name || "",
    has_active_loan: customer?.has_active_loan || false,
    loan_bank_name: customer?.loan_bank_name || "",
    loan_account_number: customer?.loan_account_number || "",
    status: customer?.status || "active",
    notes: customer?.notes || ""
  });

  const handleChange = (field, value) => {
    setForm(p => ({ ...p, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!form.full_name || !form.phone) {
      toast.error("Customer name and phone are required.");
      return;
    }

    try {
      onSubmit(form);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message || "Something went wrong while saving the customer.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Full Name *</Label>
          <Input value={form.full_name} onChange={e => handleChange("full_name", e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Phone *</Label>
          <Input value={form.phone} onChange={e => handleChange("phone", e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input type="email" value={form.email} onChange={e => handleChange("email", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Date of Birth</Label>
          <Input type="date" value={form.date_of_birth} onChange={e => handleChange("date_of_birth", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>PAN Number</Label>
          <Input 
            value={form.pan_number} 
            onChange={e => handleChange("pan_number", e.target.value)} 
            placeholder="ABCDE1234F"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Aadhaar Number</Label>
          <Input value={form.aadhaar_number} onChange={e => handleChange("aadhaar_number", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Occupation</Label>
          <Input value={form.occupation} onChange={e => handleChange("occupation", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Company</Label>
          <Input value={form.company_name} onChange={e => handleChange("company_name", e.target.value)} />
        </div>
      </div>

      <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Active Home Loan</p>
            <p className="text-xs text-muted-foreground">Used by payment reminders to auto-generate Builder NOC.</p>
          </div>
          <Switch checked={!!form.has_active_loan} onCheckedChange={v => handleChange("has_active_loan", v)} />
        </div>
        {form.has_active_loan && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Loan Bank Name</Label>
              <Input value={form.loan_bank_name} onChange={e => handleChange("loan_bank_name", e.target.value)} placeholder="e.g. HDFC Bank" />
            </div>
            <div className="space-y-1.5">
              <Label>Loan Account Number</Label>
              <Input value={form.loan_account_number} onChange={e => handleChange("loan_account_number", e.target.value)} placeholder="Loan account" />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Address</Label>
        <Textarea value={form.address} onChange={e => handleChange("address", e.target.value)} rows={2} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>City</Label>
          <Input value={form.city} onChange={e => handleChange("city", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>State</Label>
          <Input value={form.state} onChange={e => handleChange("state", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>PIN Code</Label>
          <Input value={form.pincode} onChange={e => handleChange("pincode", e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Status</Label>
        <Select value={form.status} onValueChange={v => handleChange("status", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea value={form.notes} onChange={e => handleChange("notes", e.target.value)} rows={2} />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button 
          type="submit" 
          disabled={isLoading || !form.full_name || !form.phone}
        >
          {customer ? "Update" : "Create"} Customer
        </Button>
      </div>
    </form>
  );
}