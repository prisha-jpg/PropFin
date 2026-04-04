import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import DataTable from "../../components/shared/DataTable";
import StatusBadge from "../../components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import WorkflowRequestForm from "../../components/shared/WorkflowRequestForm";
import { format } from "date-fns";
import { toast } from "sonner";

export default function Agreements() {
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();
  const { data: agreements = [], isLoading } = useQuery({ queryKey: ["agreements"], queryFn: () => apiClient.entities.Agreement.list("-created_date", 200) });

  const mutation = useMutation({
    mutationFn: (data) => apiClient.entities.Agreement.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["agreements"] }); setShowForm(false); toast.success("Agreement created"); }
  });

  const fields = [
    { key: "agreement_date", label: "Agreement Date", type: "date", required: true },
    { key: "agreement_value", label: "Agreement Value (₹)", type: "number", required: true },
    { key: "stamp_duty", label: "Stamp Duty (₹)", type: "number" },
    { key: "registration_fee", label: "Registration Fee (₹)", type: "number" },
    { key: "carpet_area", label: "Carpet Area (sq ft)", type: "number" },
    { key: "rate_per_sqft", label: "Rate per sq ft (₹)", type: "number" },
    { key: "registration_number", label: "Registration Number", type: "text" },
    { key: "status", label: "Status", type: "select", defaultValue: "draft", options: [
      { value: "draft", label: "Draft" }, { value: "executed", label: "Executed" },
      { value: "registered", label: "Registered" }, { value: "cancelled", label: "Cancelled" }
    ]},
    { key: "clauses", label: "Key Clauses", type: "textarea", fullWidth: true }
  ];

  const columns = [
    { header: "Agreement #", accessor: "agreement_number", cell: r => <span className="font-mono text-xs font-semibold">{r.agreement_number || "—"}</span> },
    { header: "Customer", accessor: "customer_name" },
    { header: "Project", accessor: "project_name" },
    { header: "Unit", accessor: "unit_number" },
    { header: "Value", accessor: "agreement_value", cell: r => `₹${(r.agreement_value || 0).toLocaleString()}` },
    { header: "Date", accessor: "agreement_date", cell: r => r.agreement_date ? format(new Date(r.agreement_date), "dd MMM yyyy") : "—" },
    { header: "Status", accessor: "status", cell: r => <StatusBadge status={r.status} /> }
  ];

  return (
    <div>
      <PageHeader title="Agreement Details" description="Legal agreement details linked to bookings" actions={<Button onClick={() => setShowForm(true)} className="gap-2"><Plus className="w-4 h-4" /> New Agreement</Button>} />
      <DataTable columns={columns} data={agreements} isLoading={isLoading} searchPlaceholder="Search agreements..." />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Agreement</DialogTitle></DialogHeader>
          <WorkflowRequestForm fields={fields} onSubmit={(data) => mutation.mutate({ ...data, agreement_number: "AGR" + Date.now().toString(36).toUpperCase(), agreement_value: Number(data.agreement_value), stamp_duty: Number(data.stamp_duty || 0), registration_fee: Number(data.registration_fee || 0), carpet_area: Number(data.carpet_area || 0), rate_per_sqft: Number(data.rate_per_sqft || 0) })} onCancel={() => setShowForm(false)} isLoading={mutation.isPending} submitLabel="Create Agreement" />
        </DialogContent>
      </Dialog>
    </div>
  );
}