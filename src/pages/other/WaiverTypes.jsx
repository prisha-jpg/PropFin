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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function WaiverTypes() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", description: "", max_percentage: "", requires_approval: true, approval_authority: "", is_active: true });
  const queryClient = useQueryClient();

  const { data: types = [], isLoading } = useQuery({ queryKey: ["waiverTypes"], queryFn: () => apiClient.entities.WaiverType.list("-created_date", 100) });

  const mutation = useMutation({
    mutationFn: (data) => apiClient.entities.WaiverType.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["waiverTypes"] }); setShowForm(false); toast.success("Waiver type created"); }
  });

  const h = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const columns = [
    { header: "Name", accessor: "name", cell: r => <span className="font-medium">{r.name}</span> },
    { header: "Code", accessor: "code", cell: r => <span className="font-mono text-xs">{r.code}</span> },
    { header: "Max %", accessor: "max_percentage", cell: r => r.max_percentage ? `${r.max_percentage}%` : "—" },
    { header: "Approval", accessor: "requires_approval", cell: r => r.requires_approval ? <Badge variant="outline" className="text-amber-600 border-amber-200">Required</Badge> : <Badge variant="outline" className="text-emerald-600 border-emerald-200">Not Required</Badge> },
    { header: "Authority", accessor: "approval_authority" },
    { header: "Active", accessor: "is_active", cell: r => r.is_active !== false ? <Badge className="bg-emerald-50 text-emerald-700">Active</Badge> : <Badge variant="outline">Inactive</Badge> }
  ];

  return (
    <div>
      <PageHeader title="Waiver Types" description="Configure interest waiver types" actions={<Button onClick={() => setShowForm(true)} className="gap-2"><Plus className="w-4 h-4" /> Add Type</Button>} />
      <DataTable columns={columns} data={types} isLoading={isLoading} searchPlaceholder="Search types..." />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Waiver Type</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); mutation.mutate({ ...form, max_percentage: Number(form.max_percentage || 0) }); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={e => h("name", e.target.value)} required /></div>
              <div className="space-y-1.5"><Label>Code *</Label><Input value={form.code} onChange={e => h("code", e.target.value)} required /></div>
              <div className="space-y-1.5"><Label>Max Waiver %</Label><Input type="number" value={form.max_percentage} onChange={e => h("max_percentage", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Approval Authority</Label><Input value={form.approval_authority} onChange={e => h("approval_authority", e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea value={form.description} onChange={e => h("description", e.target.value)} rows={2} /></div>
            <div className="flex items-center gap-2">
              <Switch checked={form.requires_approval} onCheckedChange={v => h("requires_approval", v)} />
              <Label>Requires Approval</Label>
            </div>
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