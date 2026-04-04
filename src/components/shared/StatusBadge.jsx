import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusStyles = {
  // Greens
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cleared: "bg-emerald-50 text-emerald-700 border-emerald-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  settled: "bg-emerald-50 text-emerald-700 border-emerald-200",
  executed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  registered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  certificate_issued: "bg-emerald-50 text-emerald-700 border-emerald-200",
  payment_received: "bg-emerald-50 text-emerald-700 border-emerald-200",
  handed_over: "bg-emerald-50 text-emerald-700 border-emerald-200",

  // Ambers
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  under_review: "bg-amber-50 text-amber-700 border-amber-200",
  generated: "bg-amber-50 text-amber-700 border-amber-200",
  draft: "bg-amber-50 text-amber-700 border-amber-200",
  booked: "bg-blue-50 text-blue-700 border-blue-200",
  received: "bg-blue-50 text-blue-700 border-blue-200",
  dispatched: "bg-blue-50 text-blue-700 border-blue-200",
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  acknowledged: "bg-blue-50 text-blue-700 border-blue-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  under_construction: "bg-blue-50 text-blue-700 border-blue-200",
  ready_for_possession: "bg-blue-50 text-blue-700 border-blue-200",
  agreement_signed: "bg-blue-50 text-blue-700 border-blue-200",
  received_by_bank: "bg-blue-50 text-blue-700 border-blue-200",
  filed: "bg-blue-50 text-blue-700 border-blue-200",
  partially_paid: "bg-orange-50 text-orange-700 border-orange-200",
  partially_settled: "bg-orange-50 text-orange-700 border-orange-200",
  calculated: "bg-slate-50 text-slate-700 border-slate-200",

  // Reds
  cancelled: "bg-red-50 text-red-700 border-red-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  bounced: "bg-red-50 text-red-700 border-red-200",
  overdue: "bg-red-50 text-red-700 border-red-200",
  blocked: "bg-red-50 text-red-700 border-red-200",
  inactive: "bg-slate-50 text-slate-500 border-slate-200",
  waived: "bg-purple-50 text-purple-700 border-purple-200",
  processed: "bg-teal-50 text-teal-700 border-teal-200"
};

export default function StatusBadge({ status }) {
  if (!status) return null;
  const style = statusStyles[status] || "bg-slate-50 text-slate-600 border-slate-200";
  const label = status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  return (
    <Badge variant="outline" className={cn("text-[11px] font-medium border px-2 py-0.5", style)}>
      {label}
    </Badge>
  );
}