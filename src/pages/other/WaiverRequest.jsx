import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import DataTable from "../../components/shared/DataTable";
import ApprovalWorkflow from "../../components/shared/ApprovalWorkflow";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import WorkflowRequestForm from "../../components/shared/WorkflowRequestForm";
import { toast } from "sonner";

export default function WaiverRequestPage() {
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();
  const { data: requests = [], isLoading } = useQuery({ queryKey: ["waiverRequests"], queryFn: () => apiClient.entities.WaiverRequest.list("-created_date", 200) });
  const { data: waiverTypes = [] } = useQuery({ queryKey: ["waiverTypes"], queryFn: () => apiClient.entities.WaiverType.list("-created_date", 50) });

  const mutation = useMutation({
    mutationFn: (data) => apiClient.entities.WaiverRequest.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["waiverRequests"] }); setShowForm(false); toast.success("Waiver request submitted"); }
  });

  const fields = [
    { key: "waiver_type", label: "Waiver Type", type: "select", options: waiverTypes.map(w => ({ value: w.name, label: w.name })) },
    { key: "interest_amount", label: "Interest Amount (₹)", type: "number" },
    { key: "waiver_amount", label: "Waiver Amount (₹)", type: "number", required: true },
    { key: "request_date", label: "Request Date", type: "date", defaultValue: new Date().toISOString().split("T")[0] },
    { key: "reason", label: "Reason", type: "textarea", fullWidth: true, required: true },
    { key: "remarks", label: "Remarks", type: "textarea", fullWidth: true }
  ];

  const columns = [
    { header: "Request #", accessor: "request_number", cell: r => <span className="font-mono text-xs font-semibold">{r.request_number || "—"}</span> },
    { header: "Customer", accessor: "customer_name" },
    { header: "Type", accessor: "waiver_type" },
    { header: "Interest", accessor: "interest_amount", cell: r => `₹${(r.interest_amount || 0).toLocaleString()}` },
    { header: "Waiver", accessor: "waiver_amount", cell: r => <span className="font-semibold">₹{(r.waiver_amount || 0).toLocaleString()}</span> },
    { header: "Workflow", accessor: "status", cell: r => <ApprovalWorkflow status={r.status} /> }
  ];

  return (
    <div>
      <PageHeader title="Interest Waiver Requests" description="Apply for waiver of interest charges" actions={<Button onClick={() => setShowForm(true)} className="gap-2"><Plus className="w-4 h-4" /> New Waiver Request</Button>} />
      <DataTable columns={columns} data={requests} isLoading={isLoading} searchPlaceholder="Search..." />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Interest Waiver Request</DialogTitle></DialogHeader>
          <WorkflowRequestForm fields={fields} onSubmit={(data) => mutation.mutate({ ...data, request_number: "WVR" + Date.now().toString(36).toUpperCase(), status: "pending", interest_amount: Number(data.interest_amount || 0), waiver_amount: Number(data.waiver_amount) })} onCancel={() => setShowForm(false)} isLoading={mutation.isPending} submitLabel="Submit Waiver Request" />
        </DialogContent>
      </Dialog>
    </div>
  );
}