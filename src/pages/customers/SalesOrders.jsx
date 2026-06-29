import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import DataTable from "../../components/shared/DataTable";
import StatusBadge from "../../components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SalesOrderForm from "../../components/customers/SalesOrderForm";
import { format } from "date-fns";
import { toast } from "sonner";

export default function SalesOrders() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["salesOrders"],
    queryFn: () => apiClient.entities.SalesOrder.list("-created_date", 200)
  });

  const createMutation = useMutation({
    mutationFn: (data) => apiClient.entities.SalesOrder.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["salesOrders"] }); setShowForm(false); toast.success("Sales order created."); },
    onError: (error) => { toast.error(error.message || "Failed to create sales order."); }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => apiClient.entities.SalesOrder.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["salesOrders"] }); setShowForm(false); setEditing(null); toast.success("Sales order updated."); },
    onError: (error) => { toast.error(error.message || "Failed to update sales order."); }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => apiClient.entities.SalesOrder.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salesOrders"] });
      toast.success("Sales order deleted successfully.");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete sales order.");
    }
  });

  const handleDeleteOrder = (id) => {
    if (window.confirm("Are you sure you want to delete this sales order? This will also delete all associated schedules, receipts, demand letters, and other records.")) {
      deleteMutation.mutate(id);
    }
  };

  const columns = [
    { header: "Order #", accessor: "order_number", cell: r => <span className="font-mono text-xs font-semibold">{r.order_number || "—"}</span> },
    { header: "Customer", accessor: "customer_name", cell: r => <span className="font-medium">{r.customer_name || "—"}</span> },
    { header: "Project", accessor: "project_name" },
    { header: "Unit", accessor: "unit_number" },
    { header: "Value", accessor: "total_value", cell: r => <span className="font-semibold">₹{(r.total_value || 0).toLocaleString()}</span> },
    { header: "Booking Date", accessor: "booking_date", cell: r => r.booking_date ? format(new Date(r.booking_date), "dd MMM yyyy") : "—" },
    { header: "Outstanding", accessor: "outstanding_amount", cell: r => <span className="text-red-600 font-medium">₹{(r.outstanding_amount || 0).toLocaleString()}</span> },
    { header: "Status", accessor: "status", cell: r => <StatusBadge status={r.status} /> },
    {
      header: "Actions",
      accessor: "id",
      cell: r => (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteOrder(r.id);
          }}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )
    }
  ];

  const handleSubmit = (data) => {
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      const num = "SO" + Date.now().toString(36).toUpperCase();
      createMutation.mutate({ ...data, order_number: num });
    }
  };

  return (
    <div>
      <PageHeader
        title="All Sales Orders"
        description="View and manage all property sales orders"
        actions={
          <Button onClick={() => { setEditing(null); setShowForm(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> New Sales Order
          </Button>
        }
      />
      <DataTable columns={columns} data={orders} isLoading={isLoading} searchPlaceholder="Search orders..." onRowClick={r => { setEditing(r); setShowForm(true); }} />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Sales Order" : "New Sales Order"}</DialogTitle></DialogHeader>
          <SalesOrderForm
            order={editing}
            onSubmit={handleSubmit}
            onCancel={() => { setShowForm(false); setEditing(null); }}
            onSuccess={() => {
              setShowForm(false);
              setEditing(null);
              queryClient.invalidateQueries({ queryKey: ["salesOrders"] });
            }}
            isLoading={createMutation.isPending || updateMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}