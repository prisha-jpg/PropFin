import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import DataTable from "../../components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function BankMasterPage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ bank_name: "", branch_name: "", ifsc_code: "", account_number: "", account_type: "current", address: "", contact_person: "", contact_phone: "", is_active: true });
  const queryClient = useQueryClient();

  const { data: banks = [], isLoading } = useQuery({ queryKey: ["bankMaster"], queryFn: () => apiClient.entities.BankMaster.list("-created_date", 100) });

  const mutation = useMutation({
    mutationFn: (data) => apiClient.entities.BankMaster.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bankMaster"] }); setShowForm(false); toast.success("Bank added"); }
  });

  const h = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const columns = [
    { header: "Bank", accessor: "bank_name", cell: r => <span className="font-medium">{r.bank_name}</span> },
    { header: "Branch", accessor: "branch_name" },
    { header: "IFSC", accessor: "ifsc_code", cell: r => <span className="font-mono text-xs">{r.ifsc_code}</span> },
    { header: "Account", accessor: "account_number", cell: r => <span className="font-mono text-xs">{r.account_number || "—"}</span> },
    { header: "Type", accessor: "account_type", cell: r => (r.account_type || "").replace(/_/g, " ") },
    { header: "Contact", accessor: "contact_person" },
    { header: "Active", accessor: "is_active", cell: r => r.is_active !== false ? <Badge className="bg-emerald-50 text-emerald-700">Active</Badge> : <Badge variant="outline">Inactive</Badge> }
  ];

  return (
    <div>
      <PageHeader title="Bank Master" description="Manage registered banks for transactions" actions={<Button onClick={() => setShowForm(true)} className="gap-2"><Plus className="w-4 h-4" /> Add Bank</Button>} />
      <DataTable columns={columns} data={banks} isLoading={isLoading} searchPlaceholder="Search banks..." />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Bank</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Bank Name *</Label><Input value={form.bank_name} onChange={e => h("bank_name", e.target.value)} required /></div>
              <div className="space-y-1.5"><Label>Branch</Label><Input value={form.branch_name} onChange={e => h("branch_name", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>IFSC Code *</Label><Input value={form.ifsc_code} onChange={e => h("ifsc_code", e.target.value)} required /></div>
              <div className="space-y-1.5"><Label>Account Number</Label><Input value={form.account_number} onChange={e => h("account_number", e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Account Type</Label>
                <Select value={form.account_type} onValueChange={v => h("account_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Current</SelectItem>
                    <SelectItem value="savings">Savings</SelectItem>
                    <SelectItem value="fixed_deposit">Fixed Deposit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Contact Person</Label><Input value={form.contact_person} onChange={e => h("contact_person", e.target.value)} /></div>
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>Add Bank</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}