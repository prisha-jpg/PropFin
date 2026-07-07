import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import ApprovalWorkflow from "../../components/shared/ApprovalWorkflow";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ChevronDown, ChevronUp, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";

function CancellationRequestRow({ r, isOpen, onToggle, updateMutation }) {
  const { data: summary, isLoading } = useQuery({
    queryKey: ["ledgerSummary", r.sales_order_id],
    queryFn: async () => {
      const res = await fetch(`/api/pricing/ledger-summary/${r.sales_order_id}`);
      if (!res.ok) throw new Error("Failed to fetch ledger summary");
      return res.json();
    },
    enabled: isOpen || r.status === "approved" || r.status === "completed"
  });

  const refund = summary ? summary.netPayable : Number(r.refundable_amount || r.refund_amount || 0);
  const deduction = summary ? summary.totalRecoveries : Number(r.deduction_amount || 0);

  return (
    <>
      <tr className="border-b">
        <td className="py-3 font-mono text-xs">{r.request_number || "—"}</td>
        <td className="py-3 font-medium">{r.customer_name || "—"}</td>
        <td className="py-3">{r.unit_number || "—"}</td>
        <td className="py-3">
          {isLoading ? "..." : (
            <span className={refund >= 0 ? "text-emerald-700 font-semibold" : "text-rose-700 font-semibold"}>
              INR {Math.abs(refund).toLocaleString()} {refund >= 0 ? "(Refund)" : "(Owed)"}
            </span>
          )}
        </td>
        <td className="py-3"><ApprovalWorkflow status={r.status} /></td>
        <td className="py-3">
          <Button size="sm" variant="ghost" onClick={onToggle}>
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </td>
      </tr>
      {isOpen && (
        <tr className="border-b bg-muted/20">
          <td colSpan={6} className="py-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-md border bg-white p-3">
                <p className="text-xs text-muted-foreground">Reason</p>
                <p className="text-sm mt-1">{r.reason || "-"}</p>
                {r.reason_description && (
                  <>
                    <p className="text-xs text-muted-foreground mt-2">Remarks</p>
                    <p className="text-xs text-slate-600 mt-1">{r.reason_description}</p>
                  </>
                )}
              </div>
              <div className="rounded-md border bg-white p-3">
                <p className="text-xs text-muted-foreground font-semibold">Settlement Summary</p>
                <div className="text-xs space-y-1.5 mt-2 font-mono border-b pb-2">
                  <p className="flex justify-between"><span>Amount Received:</span> <span className="font-semibold text-emerald-700">INR {Number(r.total_amount_paid || 0).toLocaleString()}</span></p>
                  <p className="flex justify-between"><span>Cancellation Fee (0.5%):</span> <span className="font-semibold">INR {Number(r.cancellation_charges || 0).toLocaleString()}</span></p>
                  <p className="flex justify-between"><span>Other Recoverable Charges:</span> <span className="font-semibold text-red-700">INR {Number(r.forfeiture_amount || 0).toLocaleString()}</span></p>
                  <p className="flex justify-between border-t pt-1 font-bold text-slate-700"><span>Total Recoveries:</span> <span>INR {deduction.toLocaleString()}</span></p>
                </div>
                <p className="text-xs text-muted-foreground mt-2 font-semibold">
                  {refund > 0 ? "Net Payable to Customer (Refund)" : refund < 0 ? "Net Payable by Customer (Owed)" : "No Amount Payable"}
                </p>
                <p className={`text-sm font-black ${refund >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  INR {Math.abs(refund).toLocaleString()}
                </p>
              </div>
              <div className="rounded-md border bg-white p-3">
                <p className="text-xs text-muted-foreground mb-2">Actions</p>
                <div className="flex flex-wrap gap-2">
                  {r.status === "pending" && (
                    <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ id: r.id, data: { status: "under_review" } })}>
                      Review
                    </Button>
                  )}
                  {(r.status === "pending" || r.status === "under_review") && (
                    <>
                      <Button size="sm" variant="outline" className="text-emerald-700" onClick={() => updateMutation.mutate({ id: r.id, data: { status: "approved", approval_date: new Date().toISOString().split("T")[0] } })}>
                        <CheckCircle2 className="w-3 h-3 mr-1" />Approve
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-700" onClick={() => updateMutation.mutate({ id: r.id, data: { status: "rejected" } })}>
                        <XCircle className="w-3 h-3 mr-1" />Reject
                      </Button>
                    </>
                  )}
                  {r.status === "approved" && (
                    <Button size="sm" variant="outline" className="text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100 hover:text-amber-800" onClick={() => {
                      if (window.confirm("Are you sure you want to cancel this approved cancellation and restore the booking/original accounting?")) {
                        updateMutation.mutate({ id: r.id, data: { status: "revoked" } });
                      }
                    }}>
                      <XCircle className="w-3 h-3 mr-1" />Cancel Cancellation
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function CancellationApproved() {
  const [expanded, setExpanded] = useState("");
  const queryClient = useQueryClient();
  const { data: requests = [], isLoading } = useQuery({ queryKey: ["cancellationRequests"], queryFn: () => apiClient.entities.CancellationRequest.list("-created_date", 200) });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => apiClient.entities.CancellationRequest.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cancellationRequests"] });
      queryClient.invalidateQueries({ queryKey: ["ledgerSummary"] });
      toast.success("Status updated");
    }
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Approved Unit Cancellations" description="Review and authorize cancellation requests" />
      <Card>
        <CardContent className="pt-0">
          {isLoading && <p className="text-sm text-muted-foreground py-8">Loading cancellations...</p>}
          {!isLoading && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-muted-foreground">
                    <th className="text-left py-3">Request #</th>
                    <th className="text-left py-3">Customer</th>
                    <th className="text-left py-3">Unit</th>
                    <th className="text-left py-3">Refund</th>
                    <th className="text-left py-3">Workflow</th>
                    <th className="text-left py-3">Expand</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <CancellationRequestRow
                      key={r.id}
                      r={r}
                      isOpen={expanded === r.id}
                      onToggle={() => setExpanded(expanded === r.id ? "" : r.id)}
                      updateMutation={updateMutation}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}