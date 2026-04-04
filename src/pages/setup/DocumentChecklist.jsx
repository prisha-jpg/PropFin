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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function DocumentChecklistPage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ document_name: "", stage: "", is_mandatory: true, description: "", is_active: true });
  const queryClient = useQueryClient();

  const { data: docs = [], isLoading } = useQuery({ queryKey: ["documentChecklist"], queryFn: () => apiClient.entities.DocumentChecklist.list("-created_date", 100) });

  const mutation = useMutation({
    mutationFn: (data) => apiClient.entities.DocumentChecklist.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["documentChecklist"] }); setShowForm(false); toast.success("Document added"); }
  });

  const h = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const columns = [
    { header: "Document", accessor: "document_name", cell: r => <span className="font-medium">{r.document_name}</span> },
    { header: "Stage", accessor: "stage", cell: r => (r.stage || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) },
    { header: "Mandatory", accessor: "is_mandatory", cell: r => r.is_mandatory ? <Badge className="bg-red-50 text-red-700 border-red-200">Mandatory</Badge> : <Badge variant="outline">Optional</Badge> },
    { header: "Active", accessor: "is_active", cell: r => r.is_active !== false ? <Badge className="bg-emerald-50 text-emerald-700">Active</Badge> : <Badge variant="outline">Inactive</Badge> }
  ];

  return (
    <div>
      <PageHeader title="Document Checklist Master" description="Configure required documents per stage" actions={<Button onClick={() => setShowForm(true)} className="gap-2"><Plus className="w-4 h-4" /> Add Document</Button>} />
      <DataTable columns={columns} data={docs} isLoading={isLoading} searchPlaceholder="Search documents..." />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Document to Checklist</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
            <div className="space-y-1.5"><Label>Document Name *</Label><Input value={form.document_name} onChange={e => h("document_name", e.target.value)} required /></div>
            <div className="space-y-1.5">
              <Label>Stage *</Label>
              <Select value={form.stage} onValueChange={v => h("stage", v)}>
                <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
                <SelectContent>
                  {["booking","agreement","construction","handover","post_possession"].map(s => <SelectItem key={s} value={s}>{s.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea value={form.description} onChange={e => h("description", e.target.value)} rows={2} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.is_mandatory} onCheckedChange={v => h("is_mandatory", v)} /><Label>Mandatory</Label></div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>Add</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}