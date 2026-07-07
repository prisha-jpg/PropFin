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
import { Download, AlertTriangle, TrendingUp, DollarSign, Calendar, Landmark, Receipt } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { jsPDF } from "jspdf";

export default function OutstandingReport() {
  const [asOfDate, setAsOfDate] = useState("");
  const [projectId, setProjectId] = useState("all");

  // Data queries
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["salesOrders"], queryFn: () => apiClient.entities.SalesOrder.list("-created_date", 500)
  });
  const { data: demands = [] } = useQuery({
    queryKey: ["demandLetters"], queryFn: () => apiClient.entities.DemandLetter.list("-demand_date", 500)
  });
  const { data: entries = [] } = useQuery({
    queryKey: ["interestEntries"], queryFn: () => apiClient.entities.InterestEntry.list("-created_date", 500)
  });
  const { data: ledgers = [] } = useQuery({
    queryKey: ["ledgers"], queryFn: () => apiClient.entities.Ledger.list("-reference_date", 1000)
  });

  const asOf = asOfDate ? new Date(asOfDate) : new Date();

  // Active bookings with outstanding
  const activeOrders = orders.filter(o => o.status !== "cancelled");
  const filteredOrders = projectId && projectId !== "all" ? activeOrders.filter(o => o.project_name === projectId) : activeOrders;

  // 1. CALCULATE TOP METRICS
  const totalOutstanding = filteredOrders.reduce((s, o) => s + (o.outstanding_amount || 0), 0);
  const customersWithDues = filteredOrders.filter(o => (o.outstanding_amount || 0) > 0);
  const avgOutstanding = customersWithDues.length ? totalOutstanding / customersWithDues.length : 0;
  const highestOutstanding = filteredOrders.length ? Math.max(...filteredOrders.map(o => o.outstanding_amount || 0)) : 0;

  // Overdue and Current dues based on demand letters
  const activeDemands = demands.filter(d => {
    if (d.status === "paid") return false;
    const order = orders.find(o => o.id === d.sales_order_id);
    if (!order || order.status === "cancelled") return false;
    if (projectId && projectId !== "all" && order.project_name !== projectId) return false;
    return true;
  });

  const overdueAmount = activeDemands
    .filter(d => d.due_date && new Date(d.due_date) < asOf)
    .reduce((s, d) => s + (d.balance || 0), 0);

  const currentDueAmount = activeDemands
    .filter(d => d.due_date && new Date(d.due_date) >= asOf)
    .reduce((s, d) => s + (d.balance || 0), 0);

  // 2. AGING CALCULATION
  let age_0_30 = 0;
  let age_31_60 = 0;
  let age_61_90 = 0;
  let age_90_plus = 0;

  activeDemands.forEach(d => {
    if (d.due_date) {
      const dueDate = new Date(d.due_date);
      const ageDays = Math.max(0, Math.ceil((asOf - dueDate) / (1000 * 60 * 60 * 24)));
      const bal = Number(d.balance || 0);
      
      // Only age unpaid amounts
      if (bal > 0) {
        if (dueDate >= asOf) {
          // Current (not overdue)
        } else if (ageDays <= 30) {
          age_0_30 += bal;
        } else if (ageDays <= 60) {
          age_31_60 += bal;
        } else if (ageDays <= 90) {
          age_61_90 += bal;
        } else {
          age_90_plus += bal;
        }
      }
    }
  });

  // 3. CHARTS & DATA AGGREGATION
  // Project Outstanding Chart
  const projectMap = filteredOrders.reduce((acc, o) => {
    const proj = o.project_name || "General";
    if (!acc[proj]) acc[proj] = { name: proj, value: 0 };
    acc[proj].value += (o.outstanding_amount || 0);
    return acc;
  }, {});
  const projectChartData = Object.values(projectMap).filter(p => p.value > 0);

  // Aging Pie Chart
  const agingChartData = [
    { name: "0-30 Days", value: age_0_30 },
    { name: "31-60 Days", value: age_31_60 },
    { name: "61-90 Days", value: age_61_90 },
    { name: "90+ Days", value: age_90_plus }
  ].filter(a => a.value > 0);

  const colors = ["#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];

  // Accumulated interest helper maps
  const interestFromLedger = ledgers
    .filter(l => l.transaction_type === "INTEREST" || l.transaction_type === "LATE_FEE_INTEREST")
    .map(l => ({
      customer_id: l.customer_id,
      interest_amount: Number(l.amount || l.debit || 0)
    }));
  const combinedEntries = [...entries, ...interestFromLedger];

  const interestMap = combinedEntries.reduce((acc, r) => {
    const cid = r.customer_id;
    if (!acc[cid]) acc[cid] = 0;
    acc[cid] += (r.interest_amount || 0);
    return acc;
  }, {});

  // Milestone breakdown
  const milestoneMap = activeDemands.reduce((acc, d) => {
    const milestone = d.milestone_description || "Installment";
    if (!acc[milestone]) acc[milestone] = { name: milestone, value: 0 };
    acc[milestone].value += (d.balance || 0);
    return acc;
  }, {});
  const milestoneChartData = Object.values(milestoneMap).filter(m => m.value > 0).sort((a, b) => b.value - a.value);

  // Table columns mapping
  const tableRows = filteredOrders.map(o => {
    const cid = o.customer_id;
    const interest = interestMap[cid] || 0;
    
    // Calculate status
    let statusText = "Current";
    let statusVariant = "success";
    if (o.outstanding_amount > 0) {
      // Find oldest demand letter balance
      const customerDemands = activeDemands.filter(d => d.customer_id === cid && (d.balance || 0) > 0);
      const overdueDemands = customerDemands.filter(d => d.due_date && new Date(d.due_date) < asOf);
      
      if (overdueDemands.length > 0) {
        const oldestDue = new Date(Math.min(...overdueDemands.map(d => new Date(d.due_date))));
        const maxAge = Math.ceil((asOf - oldestDue) / (1000 * 60 * 60 * 24));
        if (maxAge > 90) {
          statusText = "Critical";
          statusVariant = "danger";
        } else {
          statusText = "Overdue";
          statusVariant = "warning";
        }
      } else {
        statusText = "Due";
        statusVariant = "info";
      }
    }

    return {
      ...o,
      interest,
      statusText,
      statusVariant
    };
  });

  const uniqueProjects = Array.from(new Set(activeOrders.map(o => o.project_name).filter(Boolean)));

  // 4. DOWNLOAD REVENUE SUMMARY
  const handleDownloadPDF = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(30, 96, 235);
    doc.text("PropFin Platform", pageWidth / 2, 45, { align: "center" });

    doc.setFontSize(12);
    doc.setTextColor(100, 116, 139);
    doc.text("Aged Outstanding Balances Statement", pageWidth / 2, 65, { align: "center" });

    doc.setDrawColor(226, 232, 240);
    doc.line(40, 80, pageWidth - 40, 80);

    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(`As of Date: ${format(asOf, "dd-MMM-yyyy")}`, 50, 100);
    doc.text(`Total Outstanding: INR ${totalOutstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, 50, 115);
    doc.text(`Overdue Amount: INR ${overdueAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, 50, 130);

    let y = 160;
    doc.setFont("helvetica", "bold");
    doc.setFillColor(248, 250, 252);
    doc.rect(40, y, pageWidth - 80, 20, "F");
    doc.setTextColor(15, 23, 42);
    doc.text("Customer", 50, y + 14);
    doc.text("Project/Unit", 150, y + 14);
    doc.text("Total Value", 260, y + 14);
    doc.text("Received", 340, y + 14);
    doc.text("Outstanding", 420, y + 14);
    doc.text("Status", 510, y + 14);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    y += 20;

    tableRows.forEach((row) => {
      if (y > 780) {
        doc.addPage();
        y = 40;
      }
      doc.text((row.customer_name || "—").substring(0, 16), 50, y + 12);
      doc.text(`${row.project_name} · ${row.unit_number}`, 150, y + 12);
      doc.text((row.total_value || 0).toFixed(2), 260, y + 12);
      doc.text((row.amount_received || 0).toFixed(2), 340, y + 12);
      doc.text((row.outstanding_amount || 0).toFixed(2), 420, y + 12);
      doc.text(row.statusText.toUpperCase(), 510, y + 12);
      y += 18;
    });

    doc.save(`Outstanding_Aged_Report_${format(new Date(), "yyyyMMdd")}.pdf`);
  };

  const handleDownloadCSV = () => {
    const headers = ["Customer", "Project", "Unit", "Total Value", "Received", "Outstanding", "Accrued Interest", "Outstanding Status"];
    const csvRows = tableRows.map(r => [
      r.customer_name,
      r.project_name,
      r.unit_number,
      r.total_value,
      r.amount_received,
      r.outstanding_amount,
      r.interest,
      r.statusText
    ]);
    const csvContent = [headers, ...csvRows].map(e => e.map(val => `"${String(val || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `Outstanding_Report_${format(new Date(), "yyyyMMdd")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatINR = (val) => `₹${Number(val || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const columns = [
    { header: "Customer", accessor: "customer_name", cell: r => <span className="font-semibold text-slate-800">{r.customer_name}</span> },
    { header: "Project / Unit", accessor: "project_name", cell: r => <span className="text-xs text-slate-500">{r.project_name} · Unit {r.unit_number}</span> },
    { header: "Agreement Value", accessor: "total_value", cell: r => formatINR(r.total_value) },
    { header: "Received", accessor: "amount_received", cell: r => <span className="text-emerald-600 font-medium">{formatINR(r.amount_received)}</span> },
    { header: "Outstanding", accessor: "outstanding_amount", cell: r => <span className="text-red-600 font-black">{formatINR(r.outstanding_amount)}</span> },
    { header: "Accrued Interest", accessor: "interest", cell: r => formatINR(r.interest) },
    { 
      header: "Outstanding Status", 
      accessor: "statusText", 
      cell: r => {
        const colors = {
          Current: "bg-emerald-50 text-emerald-700 border-emerald-200",
          Due: "bg-blue-50 text-blue-700 border-blue-200",
          Overdue: "bg-amber-50 text-amber-700 border-amber-200",
          Critical: "bg-rose-50 text-rose-700 border-rose-200"
        };
        return (
          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold border uppercase ${colors[r.statusText] || "bg-slate-50 border-slate-200 text-slate-700"}`}>
            {r.statusText}
          </span>
        );
      }
    }
  ];

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <PageHeader 
        title="CRM Ledger Outstanding Report" 
        description="Overdue principal & milestone payment aging dashboards" 
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
          <div className="flex flex-wrap items-end gap-5">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase text-slate-400">As of Date</Label>
              <Input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} className="border-slate-200 shadow-sm max-w-[200px]" />
            </div>
            <div className="space-y-1.5 flex-1 max-w-sm">
              <Label className="text-[10px] font-bold uppercase text-slate-400">Filter by Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="border-slate-200 shadow-sm font-medium"><SelectValue placeholder="All Projects" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {uniqueProjects.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card className="border-slate-200/90 shadow-sm p-4 hover:shadow transition-shadow">
          <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-red-500" /> Total Outstanding</span>
          <h3 className="text-sm sm:text-base font-extrabold text-slate-800 mt-2 truncate" title={formatINR(totalOutstanding)}>{formatINR(totalOutstanding)}</h3>
        </Card>
        <Card className="border-slate-200/90 shadow-sm p-4 hover:shadow transition-shadow">
          <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1"><Landmark className="h-3 w-3 text-slate-500" /> Customers with Dues</span>
          <h3 className="text-sm sm:text-base font-extrabold text-slate-800 mt-2 truncate" title={customersWithDues.length}>{customersWithDues.length}</h3>
        </Card>
        <Card className="border-slate-200/90 shadow-sm p-4 hover:shadow transition-shadow">
          <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1"><TrendingUp className="h-3 w-3 text-violet-500" /> Average Dues</span>
          <h3 className="text-sm sm:text-base font-extrabold text-slate-800 mt-2 truncate" title={formatINR(avgOutstanding)}>{formatINR(avgOutstanding)}</h3>
        </Card>
        <Card className="border-slate-200/90 shadow-sm p-4 hover:shadow transition-shadow">
          <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1"><Receipt className="h-3 w-3 text-indigo-500" /> Highest Outstanding</span>
          <h3 className="text-sm sm:text-base font-extrabold text-slate-800 mt-2 truncate" title={formatINR(highestOutstanding)}>{formatINR(highestOutstanding)}</h3>
        </Card>
        <Card className="border-slate-200/90 shadow-sm p-4 hover:shadow transition-shadow bg-rose-50/20 border-rose-200">
          <span className="text-[10px] font-bold uppercase text-rose-700 tracking-wider flex items-center gap-1"><DollarSign className="h-3 w-3 text-rose-600" /> Overdue Dues</span>
          <h3 className="text-sm sm:text-base font-extrabold text-rose-600 mt-2 truncate" title={formatINR(overdueAmount)}>{formatINR(overdueAmount)}</h3>
        </Card>
        <Card className="border-slate-200/90 shadow-sm p-4 hover:shadow transition-shadow">
          <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1"><Calendar className="h-3 w-3 text-emerald-500" /> Current Dues</span>
          <h3 className="text-sm sm:text-base font-extrabold text-emerald-600 mt-2 truncate" title={formatINR(currentDueAmount)}>{formatINR(currentDueAmount)}</h3>
        </Card>
      </div>

      {/* AGING METRICS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-200/90 shadow-sm p-5 hover:shadow transition-shadow bg-slate-50/20">
          <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider block">0-30 Days Overdue</span>
          <h3 className="text-sm sm:text-base font-extrabold text-blue-600 mt-2 truncate" title={formatINR(age_0_30)}>{formatINR(age_0_30)}</h3>
        </Card>
        <Card className="border-slate-200/90 shadow-sm p-5 hover:shadow transition-shadow bg-slate-50/20">
          <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider block">31-60 Days Overdue</span>
          <h3 className="text-sm sm:text-base font-extrabold text-amber-500 mt-2 truncate" title={formatINR(age_31_60)}>{formatINR(age_31_60)}</h3>
        </Card>
        <Card className="border-slate-200/90 shadow-sm p-5 hover:shadow transition-shadow bg-slate-50/20">
          <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider block">61-90 Days Overdue</span>
          <h3 className="text-sm sm:text-base font-extrabold text-orange-500 mt-2 truncate" title={formatINR(age_61_90)}>{formatINR(age_61_90)}</h3>
        </Card>
        <Card className="border-slate-200/90 shadow-sm p-5 hover:shadow transition-shadow bg-rose-50/20 border-rose-200">
          <span className="text-[10px] font-bold uppercase text-rose-700 tracking-wider block">90+ Days Overdue (Critical)</span>
          <h3 className="text-sm sm:text-base font-extrabold text-red-600 mt-2 truncate" title={formatINR(age_90_plus)}>{formatINR(age_90_plus)}</h3>
        </Card>
      </div>

      {/* CHARTS AND AGING */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Project outstanding bar chart */}
        <Card className="border-slate-200/90 shadow-sm p-5 col-span-2">
          <div className="flex items-center gap-1.5 mb-4"><TrendingUp className="h-4 w-4 text-primary" /><h4 className="text-sm font-bold text-slate-800">Outstanding Principal by Project Group</h4></div>
          {projectChartData.length === 0 ? (
            <div className="h-[250px] flex items-center justify-center text-xs text-slate-400 font-medium">No projects with outstanding dues</div>
          ) : (
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projectChartData}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} className="text-[10px] text-slate-400 font-semibold" />
                  <YAxis tickLine={false} axisLine={false} className="text-[10px] text-slate-400 font-semibold" />
                  <Tooltip formatter={(value) => formatINR(value)} contentStyle={{ borderRadius: 8 }} />
                  <Bar dataKey="value" fill="#ef4444" radius={4} name="Outstanding" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Aging Pie Chart */}
        <Card className="border-slate-200/90 shadow-sm p-5 flex flex-col justify-between">
          <div className="flex items-center gap-1.5 mb-4"><Calendar className="h-4 w-4 text-primary" /><h4 className="text-sm font-bold text-slate-800">Outstanding Aging Distribution</h4></div>
          {agingChartData.length === 0 ? (
            <div className="h-[230px] flex items-center justify-center text-xs text-slate-400 font-medium">No aging dues recorded</div>
          ) : (
            <div className="h-[230px] w-full flex flex-col justify-between">
              <div className="h-[150px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={agingChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={65} paddingAngle={2}>
                      {agingChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatINR(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-y-auto max-h-[70px] space-y-1 mt-2">
                {agingChartData.map((entry, idx) => (
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

      {/* OUTSTANDING CUSTOMER LEDGER */}
      <Card className="border-slate-200/90 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
          <h4 className="text-sm font-black text-slate-800">Customers Outstanding Dues Statement</h4>
          <span className="text-xs text-slate-500 font-medium">Showing {tableRows.length} Bookings</span>
        </div>
        <DataTable columns={columns} data={tableRows} isLoading={isLoading} searchPlaceholder="Search outstanding ledger..." />
      </Card>
    </div>
  );
}