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
import { toast } from "sonner";

export default function AllCustomers() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const queryClient = useQueryClient();

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: () => apiClient.entities.Customer.list("-created_date", 200)
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      console.log("[AllCustomers] Initiating createMutation with data:", data);
      const startTime = Date.now();
      try {
        const response = await apiClient.entities.Customer.create(data);
        const duration = Date.now() - startTime;
        console.log(`[AllCustomers] createMutation SUCCESS (${duration}ms):`, response);
        return response;
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[AllCustomers] createMutation FAILED (${duration}ms):`, error);
        throw error;
      }
    },
    onSuccess: () => {
      console.log("[AllCustomers] createMutation onSuccess triggered. Invalidating queries...");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setShowForm(false);
      toast.success("Customer created successfully.");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create customer.");
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      console.log(`[AllCustomers] Initiating updateMutation for ID ${id} with data:`, data);
      const startTime = Date.now();
      try {
        const response = await apiClient.entities.Customer.update(id, data);
        const duration = Date.now() - startTime;
        console.log(`[AllCustomers] updateMutation SUCCESS (${duration}ms):`, response);
        return response;
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[AllCustomers] updateMutation FAILED (${duration}ms):`, error);
        throw error;
      }
    },
    onSuccess: () => {
      console.log("[AllCustomers] updateMutation onSuccess triggered. Invalidating queries...");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setShowForm(false);
      setEditing(null);
      toast.success("Customer updated successfully.");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update customer.");
    }
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