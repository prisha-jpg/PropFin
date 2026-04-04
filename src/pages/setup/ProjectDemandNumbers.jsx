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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function ProjectDemandNumbers() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ project_name: "", prefix: "", current_sequence: 0, format_pattern: "", is_active: true });
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({ queryKey: ["projectDemandNumbers"], queryFn: () => apiClient.entities.ProjectDemandNumber.list("-created_date", 100) });

  const mutation = useMutation({
    mutationFn: (data) => apiClient.entities.ProjectDemandNumber.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["projectDemandNumbers"] }); setShowForm(false); toast.success("Created"); }
  });

  const h = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const columns = [
    { header: "Project", accessor: "project_name", cell: r => <span className="font-medium">{r.project_name}</span> },
    { header: "Prefix", accessor: "prefix", cell: r => <span className="font-mono text-xs">{r.prefix}</span> },
    { header: "Current Seq", accessor: "current_sequence" },
    { header: "Format", accessor: "format_pattern", cell: r => <span className="font-mono text-xs">{r.format_pattern || "—"}</span> },
    { header: "Active", accessor: "is_active", cell: r => r.is_active !== false ? <Badge className="bg-emerald-50 text-emerald-700">Active</Badge> : <Badge variant="outline">Inactive</Badge> }
  ];

  return (
    <div>
      <PageHeader title="Project Wise Demand Number" description="Configure demand letter numbering per project" actions={<Button onClick={() => setShowForm(true)} className="gap-2"><Plus className="w-4 h-4" /> Add</Button>} />
      <DataTable columns={columns} data={items} isLoading={isLoading} searchPlaceholder="Search..." />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Project Demand Number</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); mutation.mutate({ ...form, current_sequence: Number(form.current_sequence) }); }} className="space-y-4">
            <div className="space-y-1.5"><Label>Project Name *</Label><Input value={form.project_name} onChange={e => h("project_name", e.target.value)} required /></div>
            <div className="space-y-1.5"><Label>Prefix *</Label><Input value={form.prefix} onChange={e => h("prefix", e.target.value)} required placeholder="e.g. PRJ-DM" /></div>
            <div className="space-y-1.5"><Label>Starting Sequence</Label><Input type="number" value={form.current_sequence} onChange={e => h("current_sequence", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Format Pattern</Label><Input value={form.format_pattern} onChange={e => h("format_pattern", e.target.value)} placeholder="e.g. PRJ-DM-{SEQ}" /></div>
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