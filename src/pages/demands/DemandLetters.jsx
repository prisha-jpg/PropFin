import React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import DataTable from "../../components/shared/DataTable";
import StatusBadge from "../../components/shared/StatusBadge";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function DemandLetters() {
  const { data: demands = [], isLoading } = useQuery({
    queryKey: ["demandLetters"],
    queryFn: () => apiClient.entities.DemandLetter.list("-created_date", 200)
  });

  const columns = [
    { header: "Demand #", accessor: "demand_number", cell: r => <span className="font-mono text-xs font-semibold">{r.demand_number || "—"}</span> },
    { header: "Customer", accessor: "customer_name", cell: r => <span className="font-medium">{r.customer_name || "—"}</span> },
    { header: "Project", accessor: "project_name" },
    { header: "Unit", accessor: "unit_number" },
    { header: "Type", accessor: "demand_type", cell: r => <StatusBadge status={r.demand_type === "first" ? "booked" : "in_progress"} /> },
    { header: "Installment", accessor: "installment_number", cell: r => r.installment_number || "—" },
    { header: "Demand Amt", accessor: "total_demand", cell: r => `₹${(r.total_demand || r.demand_amount || 0).toLocaleString()}` },
    { header: "Due Date", accessor: "due_date", cell: r => r.due_date ? format(new Date(r.due_date), "dd MMM yyyy") : "—" },
    { header: "Balance", accessor: "balance", cell: r => <span className="text-red-600 font-medium">₹{(r.balance || 0).toLocaleString()}</span> },
    { header: "Status", accessor: "status", cell: r => <StatusBadge status={r.status} /> }
  ];

  return (
    <div>
      <PageHeader
        title="View Demand Letters"
        description="All first and subsequent PRL demand letters"
        actions={<Link to="/demand-letters/generate"><Button className="gap-2"><Plus className="w-4 h-4" /> Generate PRL</Button></Link>}
      />
      <DataTable columns={columns} data={demands} isLoading={isLoading} searchPlaceholder="Search demands..." />
    </div>
  );
}