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
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

export default function SalesReceiptReport() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: receipts = [], isLoading } = useQuery({
    queryKey: ["receipts"], queryFn: () => apiClient.entities.PaymentReceipt.list("-receipt_date", 500)
  });

  const filtered = receipts.filter(r => {
    if (dateFrom && r.receipt_date < dateFrom) return false;
    if (dateTo && r.receipt_date > dateTo) return false;
    return true;
  });

  const totalAmount = filtered.reduce((s, r) => s + (r.amount || 0), 0);
  const thisMonthAmount = filtered.filter((r) => {
    const d = new Date(r.receipt_date);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).reduce((s, r) => s + (r.amount || 0), 0);
  const thisWeekAmount = filtered.filter((r) => {
    const d = new Date(r.receipt_date);
    const now = new Date();
    return (now - d) / (1000 * 60 * 60 * 24) <= 7;
  }).reduce((s, r) => s + (r.amount || 0), 0);

  const monthlyVolumes = Object.values(filtered.reduce((acc, r) => {
    const key = r.receipt_date ? format(new Date(r.receipt_date), "MMM yy") : "Unknown";
    if (!acc[key]) acc[key] = { month: key, receipts: 0, amount: 0 };
    acc[key].receipts += 1;
    acc[key].amount += (r.amount || 0);
    return acc;
  }, {}));

  const columns = [
    { header: "Receipt #", accessor: "receipt_number", cell: r => <span className="font-mono text-xs font-semibold">{r.receipt_number || "—"}</span> },
    { header: "Customer", accessor: "customer_name" },
    { header: "Project", accessor: "project_name" },
    { header: "Date", accessor: "receipt_date", cell: r => r.receipt_date ? format(new Date(r.receipt_date), "dd MMM yyyy") : "—" },
    { header: "Amount", accessor: "amount", cell: r => <span className="font-semibold">₹{(r.amount || 0).toLocaleString()}</span> },
    { header: "Mode", accessor: "payment_mode", cell: r => (r.payment_mode || "—").toUpperCase() },
    { header: "Status", accessor: "status", cell: r => <StatusBadge status={r.status} /> }
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Sales Receipt Report" description="All receipts collected within a date range" />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total Receipts</p><p className="text-xl font-bold">{filtered.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total Amount</p><p className="text-xl font-bold text-indigo-700">INR {totalAmount.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">This Month</p><p className="text-xl font-bold text-emerald-700">INR {thisMonthAmount.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">This Week</p><p className="text-xl font-bold text-amber-700">INR {thisWeekAmount.toLocaleString()}</p></CardContent></Card>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label>From Date</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>To Date</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            <div className="px-4 py-2 bg-primary/10 rounded-lg">
              <p className="text-xs text-muted-foreground">Total Collection</p>
              <p className="text-lg font-bold text-primary">₹{totalAmount.toLocaleString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <p className="text-sm font-medium mb-3">Monthly Receipt Volumes</p>
          <ChartContainer config={{ receipts: { label: "Receipts", color: "#1f4d7a" } }} className="h-[240px] w-full">
            <BarChart data={monthlyVolumes}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="receipts" fill="var(--color-receipts)" radius={4} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <DataTable columns={columns} data={filtered} isLoading={isLoading} searchPlaceholder="Search receipts..." />
    </div>
  );
}