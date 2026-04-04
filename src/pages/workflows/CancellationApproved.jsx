import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import ApprovalWorkflow from "../../components/shared/ApprovalWorkflow";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ChevronDown, ChevronUp, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";

export default function CancellationApproved() {
  const [expanded, setExpanded] = useState("");
  const queryClient = useQueryClient();
  const { data: requests = [], isLoading } = useQuery({ queryKey: ["cancellationRequests"], queryFn: () => apiClient.entities.CancellationRequest.list("-created_date", 200) });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => apiClient.entities.CancellationRequest.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["cancellationRequests"] }); toast.success("Status updated"); }
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
                  {requests.map((r) => {
                    const isOpen = expanded === r.id;
                    return (
                      <React.Fragment key={r.id}>
                        <tr className="border-b">
                          <td className="py-3 font-mono text-xs">{r.request_number || "—"}</td>
                          <td className="py-3 font-medium">{r.customer_name || "—"}</td>
                          <td className="py-3">{r.unit_number || "—"}</td>
                          <td className="py-3">INR {(r.refund_amount || 0).toLocaleString()}</td>
                          <td className="py-3"><ApprovalWorkflow status={r.status} /></td>
                          <td className="py-3">
                            <Button size="sm" variant="ghost" onClick={() => setExpanded(isOpen ? "" : r.id)}>{isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</Button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="border-b bg-muted/20">
                            <td colSpan={6} className="py-4">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="rounded-md border bg-white p-3">
                                  <p className="text-xs text-muted-foreground">Reason</p>
                                  <p className="text-sm mt-1">{r.reason || "-"}</p>
                                </div>
                                <div className="rounded-md border bg-white p-3">
                                  <p className="text-xs text-muted-foreground">Deduction</p>
                                  <p className="text-sm font-semibold">INR {(r.deduction_amount || 0).toLocaleString()}</p>
                                  <p className="text-xs text-muted-foreground mt-2">Refund Eligibility</p>
                                  <p className="text-sm font-semibold text-emerald-700">INR {(r.refund_amount || 0).toLocaleString()}</p>
                                </div>
                                <div className="rounded-md border bg-white p-3">
                                  <p className="text-xs text-muted-foreground mb-2">Actions</p>
                                  <div className="flex flex-wrap gap-2">
                                    {r.status === "pending" && <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ id: r.id, data: { status: "under_review" } })}>Review</Button>}
                                    {(r.status === "pending" || r.status === "under_review") && (
                                      <>
                                        <Button size="sm" variant="outline" className="text-emerald-700" onClick={() => updateMutation.mutate({ id: r.id, data: { status: "approved", approval_date: new Date().toISOString().split("T")[0] } })}><CheckCircle2 className="w-3 h-3 mr-1" />Approve</Button>
                                        <Button size="sm" variant="outline" className="text-red-700" onClick={() => updateMutation.mutate({ id: r.id, data: { status: "rejected" } })}><XCircle className="w-3 h-3 mr-1" />Reject</Button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}