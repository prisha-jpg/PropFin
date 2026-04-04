import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import DataTable from "../../components/shared/DataTable";
import StatusBadge from "../../components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CustomerForm from "../../components/customers/CustomerForm";

export default function AllCustomers() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const queryClient = useQueryClient();

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: () => apiClient.entities.Customer.list("-created_date", 200)
  });

  const createMutation = useMutation({
    mutationFn: (data) => apiClient.entities.Customer.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["customers"] }); setShowForm(false); }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => apiClient.entities.Customer.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["customers"] }); setShowForm(false); setEditing(null); }
  });

  const columns = [
    { header: "CIF Code", accessor: "customer_code", cell: row => <span className="font-mono text-xs font-semibold text-primary">{row.customer_code || "—"}</span> },
    { header: "Name", accessor: "full_name", cell: row => <span className="font-medium">{row.full_name}</span> },
    { header: "Phone", accessor: "phone" },
    { header: "Email", accessor: "email", cell: row => <span className="text-muted-foreground">{row.email || "—"}</span> },
    { header: "City", accessor: "city", cell: row => row.city || "—" },
    { header: "PAN", accessor: "pan_number", cell: row => <span className="font-mono text-xs">{row.pan_number || "—"}</span> },
    { header: "Status", accessor: "status", cell: row => <StatusBadge status={row.status} /> },
  ];

  const handleSubmit = (data) => {
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      const code = "CIF" + Date.now().toString(36).toUpperCase();
      createMutation.mutate({ ...data, customer_code: code });
    }
  };

  return (
    <div>
      <PageHeader
        title="All Customers"
        description="Manage all registered customers"
        actions={
          <Button onClick={() => { setEditing(null); setShowForm(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> Add Customer
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={customers}
        isLoading={isLoading}
        searchPlaceholder="Search by name, phone, email..."
        onRowClick={(row) => { setEditing(row); setShowForm(true); }}
      />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Customer" : "Add New Customer"}</DialogTitle>
          </DialogHeader>
          <CustomerForm
            customer={editing}
            onSubmit={handleSubmit}
            onCancel={() => { setShowForm(false); setEditing(null); }}
            isLoading={createMutation.isPending || updateMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}