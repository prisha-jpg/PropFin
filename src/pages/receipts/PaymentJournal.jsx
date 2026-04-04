import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import DataTable from "../../components/shared/DataTable";
import StatusBadge from "../../components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ReceiptForm from "../../components/receipts/ReceiptForm";
import { format } from "date-fns";

export default function PaymentJournal() {
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: receipts = [], isLoading } = useQuery({
    queryKey: ["receipts"],
    queryFn: () => apiClient.entities.PaymentReceipt.list("-receipt_date", 200)
  });

  const mutation = useMutation({
    mutationFn: (data) => apiClient.entities.PaymentReceipt.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["receipts"] }); setShowForm(false); }
  });

  const columns = [
    { header: "Receipt #", accessor: "receipt_number", cell: r => <span className="font-mono text-xs font-semibold">{r.receipt_number || "—"}</span> },
    { header: "Customer", accessor: "customer_name", cell: r => <span className="font-medium">{r.customer_name || "—"}</span> },
    { header: "Project", accessor: "project_name" },
    { header: "Date", accessor: "receipt_date", cell: r => r.receipt_date ? format(new Date(r.receipt_date), "dd MMM yyyy") : "—" },
    { header: "Amount", accessor: "amount", cell: r => <span className="font-semibold text-emerald-700">₹{(r.amount || 0).toLocaleString()}</span> },
    { header: "Mode", accessor: "payment_mode", cell: r => <span className="uppercase text-xs">{r.payment_mode || "—"}</span> },
    { header: "Reference", accessor: "reference_number", cell: r => <span className="font-mono text-xs">{r.reference_number || "—"}</span> },
    { header: "Towards", accessor: "towards", cell: r => (r.towards || "—").replace(/_/g, " ") },
    { header: "Status", accessor: "status", cell: r => <StatusBadge status={r.status} /> }
  ];

  return (
    <div>
      <PageHeader
        title="Customer Payment Journal"
        description="Ledger of all payments received from customers"
        actions={<Button onClick={() => setShowForm(true)} className="gap-2"><Plus className="w-4 h-4" /> Record Payment</Button>}
      />
      <DataTable columns={columns} data={receipts} isLoading={isLoading} searchPlaceholder="Search receipts..." />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Record Payment Receipt</DialogTitle></DialogHeader>
          <ReceiptForm onSubmit={(data) => mutation.mutate({ ...data, receipt_number: "RCT" + Date.now().toString(36).toUpperCase() })} onCancel={() => setShowForm(false)} isLoading={mutation.isPending} />
        </DialogContent>
      </Dialog>
    </div>
  );
}