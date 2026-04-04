import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import DataTable from "../../components/shared/DataTable";
import StatusBadge from "../../components/shared/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";

export default function OutstandingReport() {
  const [asOfDate, setAsOfDate] = useState("");

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["salesOrders"], queryFn: () => apiClient.entities.SalesOrder.list("-created_date", 500)
  });

  const outstanding = orders.filter(o => (o.outstanding_amount || 0) > 0 && o.status !== "cancelled");

  const totalOutstanding = outstanding.reduce((s, o) => s + (o.outstanding_amount || 0), 0);

  const withAging = outstanding.map((o) => {
    const baseDate = o.booking_date ? new Date(o.booking_date) : new Date();
    const asOf = asOfDate ? new Date(asOfDate) : new Date();
    const ageDays = Math.max(0, Math.ceil((asOf - baseDate) / (1000 * 60 * 60 * 24)));
    const amt = Number(o.outstanding_amount || 0);
    return {
      ...o,
      ageDays,
      bucket_0_30: ageDays <= 30 ? amt : 0,
      bucket_31_60: ageDays > 30 && ageDays <= 60 ? amt : 0,
      bucket_61_90: ageDays > 60 && ageDays <= 90 ? amt : 0,
      bucket_90_plus: ageDays > 90 ? amt : 0,
    };
  });

  const bucketTotals = {
    bucket_0_30: withAging.reduce((s, r) => s + r.bucket_0_30, 0),
    bucket_31_60: withAging.reduce((s, r) => s + r.bucket_31_60, 0),
    bucket_61_90: withAging.reduce((s, r) => s + r.bucket_61_90, 0),
    bucket_90_plus: withAging.reduce((s, r) => s + r.bucket_90_plus, 0),
  };

  const heatClass = (value, max = 1) => {
    if (!value) return "bg-slate-50";
    const ratio = value / max;
    if (ratio > 0.7) return "bg-red-500 text-white";
    if (ratio > 0.4) return "bg-orange-300";
    if (ratio > 0.15) return "bg-amber-200";
    return "bg-yellow-100";
  };

  const maxBucketValue = Math.max(1, ...withAging.flatMap((r) => [r.bucket_0_30, r.bucket_31_60, r.bucket_61_90, r.bucket_90_plus]));

  const columns = [
    { header: "Customer", accessor: "customer_name", cell: r => <span className="font-medium">{r.customer_name || "—"}</span> },
    { header: "Project", accessor: "project_name" },
    { header: "Unit", accessor: "unit_number" },
    { header: "Total Value", accessor: "total_value", cell: r => `₹${(r.total_value || 0).toLocaleString()}` },
    { header: "Received", accessor: "amount_received", cell: r => <span className="text-emerald-600">₹{(r.amount_received || 0).toLocaleString()}</span> },
    { header: "Outstanding", accessor: "outstanding_amount", cell: r => <span className="text-red-600 font-bold">₹{(r.outstanding_amount || 0).toLocaleString()}</span> },
    { header: "Status", accessor: "status", cell: r => <StatusBadge status={r.status} /> }
  ];

  return (
    <div>
      <PageHeader title="Outstanding Report" description="All customers with outstanding balances" />
      <Card className="mb-6">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label>As of Date (optional)</Label>
              <Input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} />
            </div>
            <div className="px-4 py-2 bg-red-50 rounded-lg border border-red-100">
              <p className="text-xs text-muted-foreground">Total Outstanding</p>
              <p className="text-lg font-bold text-red-600">₹{totalOutstanding.toLocaleString()}</p>
            </div>
            <div className="px-4 py-2 bg-primary/10 rounded-lg">
              <p className="text-xs text-muted-foreground">Customers with Dues</p>
              <p className="text-lg font-bold text-primary">{outstanding.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm font-medium mb-3">Aging Heatmap by Customer/Unit {asOfDate ? `(as of ${format(new Date(asOfDate), "dd MMM yyyy")})` : ""}</p>
          {isLoading && <p className="text-sm text-muted-foreground">Loading heatmap...</p>}
          {!isLoading && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b text-xs uppercase text-muted-foreground">
                    <th className="py-2 text-left">Customer / Unit</th>
                    <th className="py-2 text-left">0-30</th>
                    <th className="py-2 text-left">31-60</th>
                    <th className="py-2 text-left">61-90</th>
                    <th className="py-2 text-left">90+</th>
                  </tr>
                </thead>
                <tbody>
                  {withAging.map((row) => (
                    <tr key={row.id} className="border-b">
                      <td className="py-2">
                        <p className="font-medium">{row.customer_name || "-"}</p>
                        <p className="text-xs text-muted-foreground">{row.project_name} · {row.unit_number}</p>
                      </td>
                      <td className={`py-2 px-2 rounded ${heatClass(row.bucket_0_30, maxBucketValue)}`}>{row.bucket_0_30 ? `INR ${row.bucket_0_30.toLocaleString()}` : "-"}</td>
                      <td className={`py-2 px-2 rounded ${heatClass(row.bucket_31_60, maxBucketValue)}`}>{row.bucket_31_60 ? `INR ${row.bucket_31_60.toLocaleString()}` : "-"}</td>
                      <td className={`py-2 px-2 rounded ${heatClass(row.bucket_61_90, maxBucketValue)}`}>{row.bucket_61_90 ? `INR ${row.bucket_61_90.toLocaleString()}` : "-"}</td>
                      <td className={`py-2 px-2 rounded ${heatClass(row.bucket_90_plus, maxBucketValue)}`}>{row.bucket_90_plus ? `INR ${row.bucket_90_plus.toLocaleString()}` : "-"}</td>
                    </tr>
                  ))}
                  <tr className="bg-muted/40 font-semibold">
                    <td className="py-2">Totals</td>
                    <td className="py-2">INR {bucketTotals.bucket_0_30.toLocaleString()}</td>
                    <td className="py-2">INR {bucketTotals.bucket_31_60.toLocaleString()}</td>
                    <td className="py-2">INR {bucketTotals.bucket_61_90.toLocaleString()}</td>
                    <td className="py-2">INR {bucketTotals.bucket_90_plus.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <DataTable columns={columns} data={withAging} isLoading={isLoading} searchPlaceholder="Search customers..." />
    </div>
  );
}