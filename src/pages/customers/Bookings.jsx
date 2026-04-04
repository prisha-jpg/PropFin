import React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import DataTable from "../../components/shared/DataTable";
import StatusBadge from "../../components/shared/StatusBadge";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

export default function Bookings() {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["salesOrders"],
    queryFn: () => apiClient.entities.SalesOrder.list("-booking_date", 200)
  });

  const columns = [
    { header: "Customer", accessor: "customer_name", cell: r => <span className="font-medium">{r.customer_name || "—"}</span> },
    { header: "Project", accessor: "project_name" },
    { header: "Unit", accessor: "unit_number" },
    { header: "Type", accessor: "unit_type", cell: r => r.unit_type || "—" },
    { header: "Booking Date", accessor: "booking_date", cell: r => r.booking_date ? format(new Date(r.booking_date), "dd MMM yyyy") : "—" },
    { header: "Value", accessor: "total_value", cell: r => `₹${(r.total_value || 0).toLocaleString()}` },
    { header: "Status", accessor: "status", cell: r => <StatusBadge status={r.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Manage Bookings"
        description="View and manage property bookings linked to customers"
        actions={<Link to="/sales-orders"><Button variant="outline" className="gap-2"><ExternalLink className="w-4 h-4" /> Go to Sales Orders</Button></Link>}
      />
      <DataTable columns={columns} data={orders} isLoading={isLoading} searchPlaceholder="Search bookings..." />
    </div>
  );
}