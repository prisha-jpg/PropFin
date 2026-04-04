import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function HandoverApproved() {
  const queryClient = useQueryClient();
  const { data: requests = [], isLoading } = useQuery({ queryKey: ["handoverRequests"], queryFn: () => apiClient.entities.HandoverRequest.list("-created_date", 200) });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => apiClient.entities.HandoverRequest.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["handoverRequests"] }); toast.success("Status updated"); }
  });

  const lanes = [
    { key: "pending", label: "Pending", color: "border-amber-200 bg-amber-50" },
    { key: "under_review", label: "Under Review", color: "border-blue-200 bg-blue-50" },
    { key: "approved", label: "Approved", color: "border-emerald-200 bg-emerald-50" },
    { key: "rejected", label: "Rejected", color: "border-rose-200 bg-rose-50" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Approved Handover Process" description="Review and approve pending handover requests" />
      {isLoading && <p className="text-sm text-muted-foreground">Loading board...</p>}
      {!isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {lanes.map((lane) => {
            const laneCards = requests.filter((r) => (r.status || "pending") === lane.key);
            return (
              <Card key={lane.key} className={`${lane.color} border`}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    {lane.label}
                    <Badge variant="outline">{laneCards.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {laneCards.length === 0 && <p className="text-xs text-muted-foreground">No requests</p>}
                  {laneCards.map((r) => (
                    <div key={r.id} className="rounded-md border bg-white p-3 space-y-2">
                      <p className="font-medium text-sm">{r.customer_name || "—"}</p>
                      <p className="text-xs text-muted-foreground">Unit {r.unit_number || "-"} · {r.project_name || "-"}</p>
                      <p className="text-xs text-muted-foreground">Submitted {r.created_date ? format(new Date(r.created_date), "dd MMM yyyy") : "-"}</p>
                      <div className="flex flex-wrap gap-1">
                        {lane.key === "pending" && <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ id: r.id, data: { status: "under_review" } })}>Move to Review</Button>}
                        {(lane.key === "pending" || lane.key === "under_review") && (
                          <>
                            <Button size="sm" variant="outline" className="text-emerald-600" onClick={() => updateMutation.mutate({ id: r.id, data: { status: "approved", approval_date: new Date().toISOString().split("T")[0] } })}><CheckCircle2 className="w-3 h-3 mr-1" />Approve</Button>
                            <Button size="sm" variant="outline" className="text-red-600" onClick={() => updateMutation.mutate({ id: r.id, data: { status: "rejected" } })}><XCircle className="w-3 h-3 mr-1" />Reject</Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}