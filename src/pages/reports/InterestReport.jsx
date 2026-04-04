import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import DataTable from "../../components/shared/DataTable";
import StatusBadge from "../../components/shared/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

export default function InterestReport() {
  const [customerId, setCustomerId] = useState("");
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: () => apiClient.entities.Customer.list("-created_date", 200) });
  const { data: entries = [] } = useQuery({ queryKey: ["interestEntries"], queryFn: () => apiClient.entities.InterestEntry.list("-created_date", 500) });

  const filtered = customerId ? entries.filter(e => e.customer_id === customerId) : entries;

  const columns = [
    { header: "Entry #", accessor: "entry_number", cell: r => <span className="font-mono text-xs">{r.entry_number || "—"}</span> },
    { header: "Customer", accessor: "customer_name" },
    { header: "Project", accessor: "project_name" },
    { header: "Period", accessor: "period_from", cell: r => r.period_from && r.period_to ? `${format(new Date(r.period_from), "dd/MM/yy")} – ${format(new Date(r.period_to), "dd/MM/yy")}` : "—" },
    { header: "Days", accessor: "days" },
    { header: "Principal", accessor: "principal_amount", cell: r => `₹${(r.principal_amount || 0).toLocaleString()}` },
    { header: "Rate", accessor: "interest_rate", cell: r => `${r.interest_rate || 0}%` },
    { header: "Interest", accessor: "interest_amount", cell: r => <span className="font-semibold">₹{(r.interest_amount || 0).toLocaleString()}</span> },
    { header: "Status", accessor: "status", cell: r => <StatusBadge status={r.status} /> }
  ];

  return (
    <div>
      <PageHeader title="CRM Ledger Interest Report" description="Interest-related entries per customer" />
      <Card className="mb-6">
        <CardContent className="pt-4">
          <div className="flex items-end gap-4">
            <div className="space-y-1.5 flex-1 max-w-sm">
              <Label>Filter by Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="All customers" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>All Customers</SelectItem>
                  {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
      <DataTable columns={columns} data={filtered} searchPlaceholder="Search interest entries..." />
    </div>
  );
}