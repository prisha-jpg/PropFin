import React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import DataTable from "../../components/shared/DataTable";
import StatusBadge from "../../components/shared/StatusBadge";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Link } from "react-router-dom";

export default function ViewTDS() {
  const { data: entries = [], isLoading } = useQuery({ queryKey: ["clientTDS"], queryFn: () => apiClient.entities.ClientTDS.list("-created_date", 200) });

  const columns = [
    { header: "TDS #", accessor: "tds_number", cell: r => <span className="font-mono text-xs font-semibold">{r.tds_number || "—"}</span> },
    { header: "Customer", accessor: "customer_name" },
    { header: "Project", accessor: "project_name" },
    { header: "Transaction", accessor: "transaction_amount", cell: r => `₹${(r.transaction_amount || 0).toLocaleString()}` },
    { header: "Rate", accessor: "tds_rate", cell: r => `${r.tds_rate || 0}%` },
    { header: "TDS Amount", accessor: "tds_amount", cell: r => <span className="font-semibold">₹{(r.tds_amount || 0).toLocaleString()}</span> },
    { header: "Date", accessor: "deduction_date", cell: r => r.deduction_date ? format(new Date(r.deduction_date), "dd MMM yyyy") : "—" },
    { header: "FY", accessor: "financial_year" },
    { header: "Status", accessor: "status", cell: r => <StatusBadge status={r.status} /> }
  ];

  return (
    <div>
      <PageHeader title="View Client TDS" description="All TDS records for customers" actions={<Link to="/tds/generate"><Button className="gap-2"><Plus className="w-4 h-4" /> Generate TDS</Button></Link>} />
      <DataTable columns={columns} data={entries} isLoading={isLoading} searchPlaceholder="Search TDS records..." />
    </div>
  );
}