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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function TDSAccountPage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ account_name: "", account_code: "", section: "", rate: "", threshold_amount: "", description: "", is_active: true });
  const queryClient = useQueryClient();

  const { data: accounts = [], isLoading } = useQuery({ queryKey: ["tdsAccounts"], queryFn: () => apiClient.entities.TDSAccount.list("-created_date", 100) });

  const mutation = useMutation({
    mutationFn: (data) => apiClient.entities.TDSAccount.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["tdsAccounts"] }); setShowForm(false); toast.success("TDS account created"); }
  });

  const h = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const columns = [
    { header: "Account", accessor: "account_name", cell: r => <span className="font-medium">{r.account_name}</span> },
    { header: "Code", accessor: "account_code", cell: r => <span className="font-mono text-xs">{r.account_code || "—"}</span> },
    { header: "Section", accessor: "section", cell: r => <span className="font-mono text-xs">{r.section}</span> },
    { header: "Rate", accessor: "rate", cell: r => `${r.rate || 0}%` },
    { header: "Threshold", accessor: "threshold_amount", cell: r => r.threshold_amount ? `₹${r.threshold_amount.toLocaleString()}` : "—" },
    { header: "Active", accessor: "is_active", cell: r => r.is_active !== false ? <Badge className="bg-emerald-50 text-emerald-700">Active</Badge> : <Badge variant="outline">Inactive</Badge> }
  ];

  return (
    <div>
      <PageHeader title="TDS Account Setup" description="Configure TDS ledger accounts for tax compliance" actions={<Button onClick={() => setShowForm(true)} className="gap-2"><Plus className="w-4 h-4" /> Add Account</Button>} />
      <DataTable columns={columns} data={accounts} isLoading={isLoading} searchPlaceholder="Search accounts..." />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add TDS Account</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); mutation.mutate({ ...form, rate: Number(form.rate), threshold_amount: Number(form.threshold_amount || 0) }); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Account Name *</Label><Input value={form.account_name} onChange={e => h("account_name", e.target.value)} required /></div>
              <div className="space-y-1.5"><Label>Account Code</Label><Input value={form.account_code} onChange={e => h("account_code", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Section *</Label><Input value={form.section} onChange={e => h("section", e.target.value)} required placeholder="e.g. 194IA" /></div>
              <div className="space-y-1.5"><Label>Rate (%) *</Label><Input type="number" value={form.rate} onChange={e => h("rate", e.target.value)} required /></div>
              <div className="space-y-1.5 col-span-2"><Label>Threshold Amount (₹)</Label><Input type="number" value={form.threshold_amount} onChange={e => h("threshold_amount", e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea value={form.description} onChange={e => h("description", e.target.value)} rows={2} /></div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>Create</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}