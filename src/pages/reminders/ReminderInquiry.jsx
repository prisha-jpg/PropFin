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
import { Badge } from "@/components/ui/badge";

export default function ReminderInquiry() {
  const { data: reminders = [], isLoading } = useQuery({ queryKey: ["paymentReminders"], queryFn: () => apiClient.entities.PaymentReminder.list("-created_date", 200) });

  const columns = [
    { header: "Reminder #", accessor: "reminder_number", cell: r => <span className="font-mono text-xs font-semibold">{r.reminder_number || "—"}</span> },
    { header: "Customer", accessor: "customer_name" },
    { header: "Project", accessor: "project_name" },
    { header: "Outstanding", accessor: "outstanding_amount", cell: r => <span className="text-red-600 font-medium">₹{(r.outstanding_amount || 0).toLocaleString()}</span> },
    { header: "Type", accessor: "reminder_type", cell: r => (r.reminder_type || "—").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) },
    { header: "Due Date", accessor: "due_date", cell: r => r.due_date ? format(new Date(r.due_date), "dd MMM yyyy") : "—" },
    {
      header: "Linked Documents",
      accessor: "linked_documents",
      cell: r => r.linked_builder_noc_id
        ? <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50">Builder NOC Attached</Badge>
        : <span className="text-muted-foreground">—</span>
    },
    { header: "Dispatch", accessor: "dispatch_mode", cell: r => (r.dispatch_mode || "—").replace(/_/g, " ") },
    { header: "Status", accessor: "status", cell: r => <StatusBadge status={r.status} /> }
  ];

  return (
    <div>
      <PageHeader title="Payment Reminder Inquiry" description="Track all payment reminders sent" actions={<Link to="/reminders/generate"><Button className="gap-2"><Plus className="w-4 h-4" /> Generate Reminder</Button></Link>} />
      <DataTable columns={columns} data={reminders} isLoading={isLoading} searchPlaceholder="Search reminders..." />
    </div>
  );
}