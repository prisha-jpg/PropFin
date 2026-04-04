import React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import StatsCard from "../components/shared/StatsCard";
import StatusBadge from "../components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, FileText, CreditCard, TrendingUp, AlertTriangle, ArrowRightLeft } from "lucide-react";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Link } from "react-router-dom";

const COLORS = ["hsl(221,83%,53%)", "hsl(142,71%,45%)", "hsl(38,92%,50%)", "hsl(0,84%,60%)", "hsl(262,83%,58%)"];

export default function Dashboard() {
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: () => apiClient.entities.Customer.list("-created_date", 100) });
  const { data: salesOrders = [] } = useQuery({ queryKey: ["salesOrders"], queryFn: () => apiClient.entities.SalesOrder.list("-created_date", 100) });
  const { data: receipts = [] } = useQuery({ queryKey: ["receipts"], queryFn: () => apiClient.entities.PaymentReceipt.list("-created_date", 100) });
  const { data: demands = [] } = useQuery({ queryKey: ["demands"], queryFn: () => apiClient.entities.DemandLetter.list("-created_date", 100) });

  const totalCollection = receipts.reduce((s, r) => s + (r.amount || 0), 0);
  const totalOutstanding = salesOrders.reduce((s, o) => s + (o.outstanding_amount || 0), 0);
  const overdueDemands = demands.filter(d => d.status === "overdue").length;

  const statusBreakdown = salesOrders.reduce((acc, o) => {
    const s = o.status || "booked";
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  const pieData = Object.entries(statusBreakdown).map(([name, value]) => ({
    name: name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()), value
  }));

  const recentReceipts = receipts.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Total Customers" value={customers.length} icon={Users} trendLabel="All time" trend={1} />
        <StatsCard title="Sales Orders" value={salesOrders.length} icon={FileText} trendLabel="Active orders" trend={1} />
        <StatsCard title="Collections" value={`₹${(totalCollection / 100000).toFixed(1)}L`} icon={CreditCard} trendLabel="Total received" trend={1} />
        <StatsCard title="Outstanding" value={`₹${(totalOutstanding / 100000).toFixed(1)}L`} icon={AlertTriangle} trendLabel={`${overdueDemands} overdue`} trend={-1} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Recent Collections (₹)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={recentReceipts.map(r => ({ name: r.receipt_number || "—", amt: r.amount || 0 }))}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="amt" fill="hsl(221,83%,53%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Order Status</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground py-10">No data yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Recent Sales Orders</CardTitle>
              <Link to="/sales-orders" className="text-xs text-primary font-medium hover:underline">View All</Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {salesOrders.slice(0, 5).map(o => (
              <div key={o.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <div>
                  <p className="text-sm font-medium">{o.customer_name || "—"}</p>
                  <p className="text-xs text-muted-foreground">{o.project_name} · {o.unit_number}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">₹{(o.total_value || 0).toLocaleString()}</p>
                  <StatusBadge status={o.status} />
                </div>
              </div>
            ))}
            {salesOrders.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No orders yet</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Recent Receipts</CardTitle>
              <Link to="/receipts" className="text-xs text-primary font-medium hover:underline">View All</Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentReceipts.map(r => (
              <div key={r.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <div>
                  <p className="text-sm font-medium">{r.customer_name || "—"}</p>
                  <p className="text-xs text-muted-foreground">{r.receipt_date ? format(new Date(r.receipt_date), "dd MMM yyyy") : "—"}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">₹{(r.amount || 0).toLocaleString()}</p>
                  <StatusBadge status={r.status} />
                </div>
              </div>
            ))}
            {recentReceipts.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No receipts yet</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}