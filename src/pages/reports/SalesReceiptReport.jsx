import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import DataTable from "../../components/shared/DataTable";
import StatusBadge from "../../components/shared/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Download, CreditCard, DollarSign, Calendar, Landmark, Percent, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Line, LineChart, PieChart, Pie, Cell } from "recharts";
import { jsPDF } from "jspdf";

export default function SalesReceiptReport() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [customerId, setCustomerId] = useState("all");
  const [projectId, setProjectId] = useState("all");
  const [paymentMode, setPaymentMode] = useState("all");
  const [status, setStatus] = useState("all");

  // Data queries
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: () => apiClient.entities.Customer.list("-created_date", 200) });
  const { data: orders = [] } = useQuery({ queryKey: ["salesOrders"], queryFn: () => apiClient.entities.SalesOrder.list("-created_date", 500) });
  const { data: receipts = [], isLoading } = useQuery({
    queryKey: ["receipts"], queryFn: () => apiClient.entities.PaymentReceipt.list("-receipt_date", 500)
  });

  // Filter logic
  const filtered = receipts.filter(r => {
    if (dateFrom && r.receipt_date < dateFrom) return false;
    if (dateTo && r.receipt_date > dateTo) return false;
    if (customerId && customerId !== "all" && r.customer_id !== customerId) return false;
    if (paymentMode && paymentMode !== "all" && r.payment_mode !== paymentMode) return false;
    if (status && status !== "all" && r.status !== status) return false;
    
    // For project filter, match unit's project
    if (projectId && projectId !== "all") {
      const order = orders.find(o => o.id === r.sales_order_id || o.customer_id === r.customer_id);
      if (!order || order.project_name !== projectId) return false;
    }
    return true;
  });

  // 1. CALCULATE TOP METRICS
  const totalReceipts = filtered.length;
  const totalCollection = filtered.reduce((s, r) => s + Number(r.amount || 0), 0);
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const thisMonthStr = format(new Date(), "yyyy-MM");
  
  const todayCollection = filtered.filter(r => r.receipt_date === todayStr).reduce((s, r) => s + Number(r.amount || 0), 0);
  const thisMonthCollection = filtered.filter(r => r.receipt_date && r.receipt_date.substring(0, 7) === thisMonthStr).reduce((s, r) => s + Number(r.amount || 0), 0);
  const averageReceipt = filtered.length ? totalCollection / filtered.length : 0;
  const largestReceipt = filtered.length ? Math.max(...filtered.map(r => Number(r.amount || 0))) : 0;

  // 2. PREPARE CHARTS DATA
  // Monthly receipts
  const monthlyMap = filtered.reduce((acc, r) => {
    const d = r.receipt_date ? new Date(r.receipt_date) : new Date();
    const monthKey = format(d, "MMM yy");
    if (!acc[monthKey]) {
      acc[monthKey] = { month: monthKey, Amount: 0, Count: 0, timestamp: d.getTime() };
    }
    acc[monthKey].Amount += Number(r.amount || 0);
    acc[monthKey].Count += 1;
    return acc;
  }, {});

  const monthlyChartData = Object.values(monthlyMap).sort((a, b) => a.timestamp - b.timestamp);

  // Payment mode distribution
  const modeMap = filtered.reduce((acc, r) => {
    const m = (r.payment_mode || "online").toUpperCase();
    if (!acc[m]) acc[m] = { name: m, value: 0 };
    acc[m].value += Number(r.amount || 0);
    return acc;
  }, {});

  const modeChartData = Object.values(modeMap);

  // Milestone breakdown
  const milestoneMap = filtered.reduce((acc, r) => {
    const towards = r.towards || "installment";
    const label = towards.replace(/_/g, " ").toUpperCase();
    if (!acc[label]) acc[label] = { name: label, value: 0 };
    acc[label].value += Number(r.amount || 0);
    return acc;
  }, {});

  const milestoneChartData = Object.values(milestoneMap).sort((a, b) => b.value - a.value);

  const colors = ["#1e60eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

  // 3. TABLE ROW DATA WITH RUNNING COLLECTION
  let runningSum = 0;
  const tableRows = [...filtered]
    .sort((a, b) => new Date(a.receipt_date) - new Date(b.receipt_date))
    .map((r) => {
      runningSum += Number(r.amount || 0);
      
      // Resolve project name and unit number from orders if missing
      const order = orders.find(o => o.id === r.sales_order_id || o.customer_id === r.customer_id);
      return {
        ...r,
        project_name: r.project_name || order?.project_name || "General",
        unit_number: r.unit_number || order?.unit_number || "—",
        running_collection: runningSum
      };
    })
    .reverse(); // Display latest first

  // Unique projects from orders list for filter
  const uniqueProjects = Array.from(new Set(orders.map(o => o.project_name).filter(Boolean)));

  // 4. DOWNLOAD HANDLERS
  const handleDownloadPDF = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(30, 96, 235);
    doc.text("PropFin Platform", pageWidth / 2, 45, { align: "center" });

    doc.setFontSize(12);
    doc.setTextColor(100, 116, 139);
    doc.text("Collection Sales Receipt Report", pageWidth / 2, 65, { align: "center" });

    doc.setDrawColor(226, 232, 240);
    doc.line(40, 80, pageWidth - 40, 80);

    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(`Generated Date: ${format(new Date(), "dd-MMM-yyyy")}`, 50, 100);
    doc.text(`Total Receipts: ${totalReceipts}`, 50, 115);
    doc.text(`Total Collection: INR ${totalCollection.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, 50, 130);

    let y = 160;
    doc.setFont("helvetica", "bold");
    doc.setFillColor(248, 250, 252);
    doc.rect(40, y, pageWidth - 80, 20, "F");
    doc.setTextColor(15, 23, 42);
    doc.text("Receipt #", 50, y + 14);
    doc.text("Customer", 130, y + 14);
    doc.text("Project/Unit", 230, y + 14);
    doc.text("Date", 340, y + 14);
    doc.text("Amount", 430, y + 14);
    doc.text("Mode", 510, y + 14);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    y += 20;

    tableRows.forEach((row) => {
      if (y > 780) {
        doc.addPage();
        y = 40;
      }
      doc.text(row.receipt_number || "—", 50, y + 12);
      doc.text((row.customer_name || "—").substring(0, 18), 130, y + 12);
      doc.text(`${row.project_name} · ${row.unit_number}`, 230, y + 12);
      doc.text(row.receipt_date ? format(new Date(row.receipt_date), "dd-MMM-yy") : "—", 340, y + 12);
      doc.text((row.amount || 0).toFixed(2), 430, y + 12);
      doc.text((row.payment_mode || "—").toUpperCase(), 510, y + 12);
      y += 18;
    });

    doc.save(`Receipt_Report_${format(new Date(), "yyyyMMdd")}.pdf`);
  };

  const handleDownloadCSV = () => {
    const headers = ["Receipt #", "Customer", "Project", "Unit", "Date", "Amount", "Mode", "Towards", "Bank", "Status"];
    const csvRows = tableRows.map(r => [
      r.receipt_number,
      r.customer_name,
      r.project_name,
      r.unit_number,
      r.receipt_date,
      r.amount,
      r.payment_mode,
      r.towards,
      r.bank_name,
      r.status
    ]);
    const csvContent = [headers, ...csvRows].map(e => e.map(val => `"${String(val || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `Receipts_Report_${format(new Date(), "yyyyMMdd")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatINR = (val) => `₹${Number(val || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const columns = [
    { header: "Receipt #", accessor: "receipt_number", cell: r => <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-slate-100 rounded text-slate-700">{r.receipt_number || "—"}</span> },
    { header: "Customer", accessor: "customer_name" },
    { header: "Project / Unit", accessor: "project_name", cell: r => <span className="text-xs text-slate-500">{r.project_name} · Unit {r.unit_number}</span> },
    { header: "Milestone", accessor: "towards", cell: r => <span className="text-xs font-semibold text-slate-600 bg-slate-100/50 px-2 py-0.5 rounded uppercase">{String(r.towards || "installment").replace(/_/g, " ")}</span> },
    { header: "Date", accessor: "receipt_date", cell: r => r.receipt_date ? format(new Date(r.receipt_date), "dd-MMM-yyyy") : "—" },
    { header: "Amount", accessor: "amount", cell: r => <span className="font-bold text-slate-800">{formatINR(r.amount)}</span> },
    { header: "Mode", accessor: "payment_mode", cell: r => <span className="text-xs font-semibold uppercase">{r.payment_mode}</span> },
    { header: "Bank", accessor: "bank_name", cell: r => <span className="text-xs text-slate-500">{r.bank_name || "—"}</span> },
    { header: "Status", accessor: "status", cell: r => <StatusBadge status={r.status} /> },
    { header: "Running Collection", accessor: "running_collection", cell: r => <span className="font-black text-slate-900">{formatINR(r.running_collection)}</span> }
  ];

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <PageHeader 
        title="Sales Receipt Report" 
        description="Chronological record of wire receipts, cheques, and online clearance details" 
        actions={
          <div className="flex gap-2">
            <button onClick={handleDownloadPDF} className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary/95 transition-colors shadow-sm">
              <Download className="h-4 w-4" /> Download PDF
            </button>
            <button onClick={handleDownloadCSV} className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-md text-sm font-semibold hover:bg-slate-50 transition-colors shadow-sm">
              <Download className="h-4 w-4" /> Export CSV
            </button>
          </div>
        }
      />

      {/* FILTER SECTION */}
      <Card className="border-slate-200/90 shadow-sm">
        <CardContent className="pt-5 pb-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase text-slate-400">From Date</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border-slate-200 shadow-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase text-slate-400">To Date</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border-slate-200 shadow-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase text-slate-400">Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger className="border-slate-200 shadow-sm font-medium"><SelectValue placeholder="All Customers" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase text-slate-400">Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="border-slate-200 shadow-sm font-medium"><SelectValue placeholder="All Projects" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {uniqueProjects.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase text-slate-400">Payment Mode</Label>
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger className="border-slate-200 shadow-sm font-medium"><SelectValue placeholder="All Modes" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Modes</SelectItem>
                  {["cheque", "neft", "rtgs", "upi", "cash", "demand_draft", "online"].map(m => (
                    <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase text-slate-400">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="border-slate-200 shadow-sm font-medium"><SelectValue placeholder="All Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {["received", "cleared", "bounced", "cancelled"].map(s => (
                    <SelectItem key={s} value={s}>{s.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card className="border-slate-200/90 shadow-sm p-4 hover:shadow transition-shadow">
          <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1"><CreditCard className="h-3 w-3 text-slate-500" /> Total Receipts</span>
          <h3 className="text-sm sm:text-base font-extrabold text-slate-800 mt-2 truncate" title={totalReceipts}>{totalReceipts}</h3>
        </Card>
        <Card className="border-slate-200/90 shadow-sm p-4 hover:shadow transition-shadow bg-emerald-50/10 border-emerald-200">
          <span className="text-[10px] font-bold uppercase text-emerald-700 tracking-wider flex items-center gap-1"><DollarSign className="h-3 w-3 text-emerald-500" /> Total Collection</span>
          <h3 className="text-sm sm:text-base font-extrabold text-emerald-600 mt-2 truncate" title={formatINR(totalCollection)}>{formatINR(totalCollection)}</h3>
        </Card>
        <Card className="border-slate-200/90 shadow-sm p-4 hover:shadow transition-shadow">
          <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1"><Calendar className="h-3 w-3 text-indigo-500" /> Today's Collection</span>
          <h3 className="text-sm sm:text-base font-extrabold text-slate-800 mt-2 truncate" title={formatINR(todayCollection)}>{formatINR(todayCollection)}</h3>
        </Card>
        <Card className="border-slate-200/90 shadow-sm p-4 hover:shadow transition-shadow">
          <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1"><Calendar className="h-3 w-3 text-emerald-500" /> Month's Collection</span>
          <h3 className="text-sm sm:text-base font-extrabold text-emerald-600 mt-2 truncate" title={formatINR(thisMonthCollection)}>{formatINR(thisMonthCollection)}</h3>
        </Card>
        <Card className="border-slate-200/90 shadow-sm p-4 hover:shadow transition-shadow">
          <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1"><TrendingUp className="h-3 w-3 text-violet-500" /> Average Receipt</span>
          <h3 className="text-sm sm:text-base font-extrabold text-slate-800 mt-2 truncate" title={formatINR(averageReceipt)}>{formatINR(averageReceipt)}</h3>
        </Card>
        <Card className="border-slate-200/90 shadow-sm p-4 hover:shadow transition-shadow">
          <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1"><Landmark className="h-3 w-3 text-amber-500" /> Largest Receipt</span>
          <h3 className="text-sm sm:text-base font-extrabold text-slate-800 mt-2 truncate" title={formatINR(largestReceipt)}>{formatINR(largestReceipt)}</h3>
        </Card>
      </div>

      {/* COLLECTION ANALYTICS CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Collection and Trend */}
        <Card className="border-slate-200/90 shadow-sm p-5 col-span-2 space-y-2">
          <div className="flex items-center gap-1.5 mb-2"><TrendingUp className="h-4 w-4 text-primary" /><h4 className="text-sm font-bold text-slate-800">Monthly Collection Volumes & Receipts Trend</h4></div>
          {monthlyChartData.length === 0 ? (
            <div className="h-[250px] flex items-center justify-center text-xs text-slate-400 font-medium">No receipt entries found for charts</div>
          ) : (
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChartData}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} className="text-[10px] text-slate-400 font-semibold" />
                  <YAxis tickLine={false} axisLine={false} className="text-[10px] text-slate-400 font-semibold" />
                  <Tooltip formatter={(value) => formatINR(value)} contentStyle={{ borderRadius: 8 }} />
                  <Bar dataKey="Amount" fill="#3b82f6" radius={4} name="Collection" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Mode & Milestone Pie Chart */}
        <Card className="border-slate-200/90 shadow-sm p-5 flex flex-col justify-between">
          <div className="flex items-center gap-1.5 mb-4"><Landmark className="h-4 w-4 text-primary" /><h4 className="text-sm font-bold text-slate-800">Collection share by Milestone Category</h4></div>
          {milestoneChartData.length === 0 ? (
            <div className="h-[230px] flex items-center justify-center text-xs text-slate-400 font-medium">No milestone receipt statistics</div>
          ) : (
            <div className="h-[230px] w-full flex flex-col justify-between">
              <div className="h-[150px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={milestoneChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={68} paddingAngle={2}>
                      {milestoneChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatINR(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-y-auto max-h-[70px] space-y-1 mt-2">
                {milestoneChartData.slice(0, 3).map((entry, idx) => (
                  <div key={entry.name} className="flex justify-between items-center text-[10px] font-bold text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colors[idx % colors.length] }}></span>
                      {entry.name}
                    </span>
                    <span>{formatINR(entry.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* SALES RECEIPTS DATA TABLE */}
      <Card className="border-slate-200/90 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
          <h4 className="text-sm font-black text-slate-800">All Collections Ledger Statement</h4>
          <span className="text-xs text-slate-500 font-medium">Showing {tableRows.length} Receipts</span>
        </div>
        <DataTable columns={columns} data={tableRows} isLoading={isLoading} searchPlaceholder="Search receipts..." />
      </Card>
    </div>
  );
}