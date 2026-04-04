import React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import DataTable from "../../components/shared/DataTable";
import StatusBadge from "../../components/shared/StatusBadge";
import StatsCard from "../../components/shared/StatsCard";
import { TrendingUp, DollarSign, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

export default function InterestSummary() {
  const { data: entries = [], isLoading } = useQuery({ queryKey: ["interestEntries"], queryFn: () => apiClient.entities.InterestEntry.list("-created_date", 500) });

  const totalInterest = entries.reduce((s, e) => s + (e.interest_amount || 0), 0);
  const settled = entries.filter(e => e.status === "settled").reduce((s, e) => s + (e.interest_amount || 0), 0);
  const pending = entries.filter(e => e.status === "pending").reduce((s, e) => s + (e.interest_amount || 0), 0);

  const columns = [
    { header: "Entry #", accessor: "entry_number", cell: r => <span className="font-mono text-xs font-semibold">{r.entry_number || "—"}</span> },
    { header: "Customer", accessor: "customer_name" },
    { header: "Project", accessor: "project_name" },
    { header: "Unit", accessor: "unit_number" },
    { header: "Period", accessor: "period_from", cell: r => r.period_from ? `${format(new Date(r.period_from), "dd/MM/yy")} – ${format(new Date(r.period_to), "dd/MM/yy")}` : "—" },
    { header: "Interest", accessor: "interest_amount", cell: r => <span className="font-semibold">₹{(r.interest_amount || 0).toLocaleString()}</span> },
    { header: "Type", accessor: "entry_type", cell: r => <StatusBadge status={r.entry_type} /> },
    { header: "Status", accessor: "status", cell: r => <StatusBadge status={r.status} /> }
  ];

  return (
    <div>
      <PageHeader title="Interest Generation Summary" description="Overview of all interest generated" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatsCard title="Total Interest" value={`₹${totalInterest.toLocaleString()}`} icon={TrendingUp} />
        <StatsCard title="Settled" value={`₹${settled.toLocaleString()}`} icon={CheckCircle2} />
        <StatsCard title="Pending" value={`₹${pending.toLocaleString()}`} icon={DollarSign} />
      </div>
      <DataTable columns={columns} data={entries} isLoading={isLoading} searchPlaceholder="Search entries..." />
    </div>
  );
}