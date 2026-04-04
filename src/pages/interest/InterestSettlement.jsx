import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import DataTable from "../../components/shared/DataTable";
import StatusBadge from "../../components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function InterestSettlement() {
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [settlementMode, setSettlementMode] = useState("");
  const queryClient = useQueryClient();

  const { data: entries = [], isLoading } = useQuery({ queryKey: ["interestEntries"], queryFn: () => apiClient.entities.InterestEntry.list("-created_date", 200) });

  const mutation = useMutation({
    mutationFn: ({ id, data }) => apiClient.entities.InterestEntry.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["interestEntries"] }); setSelectedEntry(null); toast.success("Interest settled"); }
  });

  const pendingEntries = entries.filter(e => e.status === "pending" || e.status === "partially_settled");

  const columns = [
    { header: "Entry #", accessor: "entry_number", cell: r => <span className="font-mono text-xs font-semibold">{r.entry_number || "—"}</span> },
    { header: "Customer", accessor: "customer_name" },
    { header: "Project", accessor: "project_name" },
    { header: "Principal", accessor: "principal_amount", cell: r => `₹${(r.principal_amount || 0).toLocaleString()}` },
    { header: "Interest", accessor: "interest_amount", cell: r => <span className="font-semibold text-red-600">₹{(r.interest_amount || 0).toLocaleString()}</span> },
    { header: "Rate", accessor: "interest_rate", cell: r => `${r.interest_rate || 0}%` },
    { header: "Status", accessor: "status", cell: r => <StatusBadge status={r.status} /> },
    { header: "Action", cell: r => r.status === "pending" ? <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setSelectedEntry(r); }}>Settle</Button> : null }
  ];

  return (
    <div>
      <PageHeader title="Interest Settlement" description="Settle accumulated interest through payment, waiver, or adjustment" />
      <DataTable columns={columns} data={pendingEntries} isLoading={isLoading} searchPlaceholder="Search entries..." />

      <Dialog open={!!selectedEntry} onOpenChange={() => setSelectedEntry(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Settle Interest - {selectedEntry?.entry_number}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><p className="text-sm text-muted-foreground">Interest Amount</p><p className="text-xl font-bold">₹{(selectedEntry?.interest_amount || 0).toLocaleString()}</p></div>
            <div className="space-y-1.5">
              <Label>Settlement Mode</Label>
              <Select value={settlementMode} onValueChange={setSettlementMode}>
                <SelectTrigger><SelectValue placeholder="Select mode" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="payment">Payment</SelectItem>
                  <SelectItem value="waiver">Waiver</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setSelectedEntry(null)}>Cancel</Button>
              <Button onClick={() => mutation.mutate({ id: selectedEntry.id, data: { status: "settled", settlement_mode: settlementMode, entry_type: settlementMode === "waiver" ? "waived" : "settled" } })} disabled={!settlementMode}>Confirm Settlement</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}