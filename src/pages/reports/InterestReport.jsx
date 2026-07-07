import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import DataTable from "../../components/shared/DataTable";
import StatusBadge from "../../components/shared/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Download, Percent, TrendingUp, DollarSign, Calendar, Landmark, Receipt, Sparkles } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Line, LineChart, PieChart, Pie, Cell } from "recharts";
import { jsPDF } from "jspdf";

export default function InterestReport() {
  const [customerId, setCustomerId] = useState("all");
  
  // Data queries
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: () => apiClient.entities.Customer.list("-created_date", 200) });
  const { data: orders = [] } = useQuery({ queryKey: ["salesOrders"], queryFn: () => apiClient.entities.SalesOrder.list("-created_date", 500) });
  const { data: entries = [], isLoading } = useQuery({ queryKey: ["interestEntries"], queryFn: () => apiClient.entities.InterestEntry.list("-created_date", 500) });
  const { data: ledgers = [] } = useQuery({ queryKey: ["ledgers"], queryFn: () => apiClient.entities.Ledger.list("-reference_date", 1000) });

  const parseDateStr = (str) => {
    if (!str) return null;
    const [d, m, y] = str.split("/");
    return `${y}-${m}-${d}`;
  };

  const interestFromLedger = ledgers
    .filter(l => l.transaction_type === "INTEREST" || l.transaction_type === "LATE_FEE_INTEREST")
    .map(l => {
      let days = 30;
      let period_from = l.reference_date ? l.reference_date.substring(0, 10) : new Date().toISOString().substring(0, 10);
      let period_to = l.reference_date ? l.reference_date.substring(0, 10) : new Date().toISOString().substring(0, 10);
      
      const periodMatch = l.description.match(/period of (\d{2}\/\d{2}\/\d{4}) to (\d{2}\/\d{2}\/\d{4})/i);
      if (periodMatch) {
        period_from = parseDateStr(periodMatch[1]) || period_from;
        period_to = parseDateStr(periodMatch[2]) || period_to;
        const diffTime = Math.abs(new Date(period_to) - new Date(period_from));
        days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 30;
      } else {
        const daysMatch = l.description.match(/\((\d+)\s*days\)/i);
        if (daysMatch) {
          days = parseInt(daysMatch[1]);
        }
      }

      const order = orders.find(o => o.id === l.sales_order_id);
      
      return {
        id: l.id,
        entry_number: l.reference_no || `INT-${l.id.substring(0, 8).toUpperCase()}`,
        customer_id: l.customer_id,
        customer_name: order?.customer_name || "Customer",
        project_name: order?.project_name || "Project",
        period_from,
        period_to,
        days,
        overdue_principal: order?.total_value || 0,
        interest_rate: 18.0,
        interest_amount: Number(l.amount || l.debit || 0),
        status: l.status === "PAID" ? "settled" : "active"
      };
    });

  const combinedEntries = [...entries, ...interestFromLedger];
  const filtered = customerId && customerId !== "all" ? combinedEntries.filter(e => e.customer_id === customerId) : combinedEntries;

  // 1. CALCULATE TOP METRICS
  const totalInterestCharged = filtered.reduce((s, r) => s + (r.interest_amount || 0), 0);
  const totalInterestPaid = filtered.filter(r => r.status === "settled" || r.settlement_id).reduce((s, r) => s + (r.interest_amount || 0), 0);
  const totalInterestWaived = filtered.filter(r => r.status === "waived" || r.waiver_id).reduce((s, r) => s + (r.interest_amount || 0), 0);
  const outstandingInterest = totalInterestCharged - totalInterestPaid - totalInterestWaived;
  const avgDelayDays = filtered.length ? Math.round(filtered.reduce((s, r) => s + (r.days || r.days_overdue || 0), 0) / filtered.length) : 0;
  const highestInterest = filtered.length ? Math.max(...filtered.map(r => r.interest_amount || 0)) : 0;
  const numEntries = filtered.length;
  const collectionEfficiency = totalInterestCharged > 0 ? ((totalInterestPaid / totalInterestCharged) * 100).toFixed(1) : "100.0";

  // 2. PREPARE CHARTS DATA
  // Monthly accrued vs paid
  const monthlyMap = filtered.reduce((acc, r) => {
    const d = r.period_to ? new Date(r.period_to) : (r.created_at ? new Date(r.created_at) : new Date());
    const monthKey = format(d, "MMM yy");
    if (!acc[monthKey]) {
      acc[monthKey] = { month: monthKey, Charged: 0, Settled: 0, timestamp: d.getTime() };
    }
    acc[monthKey].Charged += (r.interest_amount || 0);
    if (r.status === "settled" || r.settlement_id) {
      acc[monthKey].Settled += (r.interest_amount || 0);
    }
    return acc;
  }, {});

  const monthlyChartData = Object.values(monthlyMap).sort((a, b) => a.timestamp - b.timestamp);

  // Project distribution
  const projectMap = filtered.reduce((acc, r) => {
    const proj = r.project_name || "General";
    if (!acc[proj]) {
      acc[proj] = { name: proj, value: 0 };
    }
    acc[proj].value += (r.interest_amount || 0);
    return acc;
  }, {});

  const projectChartData = Object.values(projectMap);
  const colors = ["#1e60eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

  // 3. PREPARE CUSTOMER SUMMARY TABLE
  const customerMap = filtered.reduce((acc, r) => {
    const cid = r.customer_id;
    if (!acc[cid]) {
      const order = orders.find(o => o.customer_id === cid);
      acc[cid] = {
        id: cid,
        customer: r.customer_name || order?.customer_name || "Unknown Customer",
        project: r.project_name || order?.project_name || "Unknown Project",
        unit: r.unit_number || order?.unit_number || "—",
        agreement_value: order?.total_value || 0,
        principal_outstanding: order?.outstanding_amount || 0,
        accrued: 0,
        collected: 0,
        netDue: 0
      };
    }
    acc[cid].accrued += (r.interest_amount || 0);
    if (r.status === "settled" || r.settlement_id) {
      acc[cid].collected += (r.interest_amount || 0);
    }
    acc[cid].netDue = acc[cid].accrued - acc[cid].collected;
    return acc;
  }, {});

  const customerSummary = Object.values(customerMap);

  // 4. PREPARE INTEREST LEDGER ROWS
  const sortedEntries = [...filtered].sort((a, b) => new Date(a.period_to || a.created_at) - new Date(b.period_to || b.created_at));
  let runningBalance = 0;
  const ledgerRows = [];

  sortedEntries.forEach((r) => {
    runningBalance += (r.interest_amount || 0);
    const chargeRow = {
      id: `${r.id}-charge`,
      date: r.period_to || r.created_at,
      reference: r.entry_number || "ACCR-INT",
      narration: r.remarks || `Interest charged for unit ${r.unit_number || ""}`,
      principal: r.principal_amount || 0,
      days: r.days || r.days_overdue || 0,
      rate: r.interest_rate || 0,
      interest: r.interest_amount || 0,
      debit: r.interest_amount || 0,
      credit: 0,
      running_balance: runningBalance,
      status: r.status
    };
    ledgerRows.push(chargeRow);

    if (r.status === "settled" || r.settlement_id) {
      runningBalance -= (r.interest_amount || 0);
      ledgerRows.push({
        id: `${r.id}-settled`,
        date: r.updated_at || r.created_at,
        reference: r.settlement_id ? "SETL-INT" : "PAID-INT",
        narration: `Settled: Interest payment clearing`,
        principal: 0,
        days: 0,
        rate: 0,
        interest: 0,
        debit: 0,
        credit: r.interest_amount || 0,
        running_balance: runningBalance,
        status: "settled"
      });
    } else if (r.status === "waived" || r.waiver_id) {
      runningBalance -= (r.interest_amount || 0);
      ledgerRows.push({
        id: `${r.id}-waived`,
        date: r.updated_at || r.created_at,
        reference: "WAIV-INT",
        narration: `Waived: Interest waiver credit applied`,
        principal: 0,
        days: 0,
        rate: 0,
        interest: 0,
        debit: 0,
        credit: r.interest_amount || 0,
        running_balance: runningBalance,
        status: "waived"
      });
    }
  });

  // 5. DOWNLOAD OPTIONS
  const handleDownloadPDF = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(30, 96, 235);
    doc.text("PropFin Platform", pageWidth / 2, 45, { align: "center" });

    doc.setFontSize(12);
    doc.setTextColor(100, 116, 139);
    doc.text("Interest Statement Report", pageWidth / 2, 65, { align: "center" });

    doc.setDrawColor(226, 232, 240);
    doc.line(40, 80, pageWidth - 40, 80);

    // Summary details
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(`Report Date: ${format(new Date(), "dd-MMM-yyyy")}`, 50, 100);
    doc.text(`Total Charged: INR ${totalInterestCharged.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, 50, 115);
    doc.text(`Total Paid: INR ${totalInterestPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, 50, 130);
    doc.text(`Outstanding Due: INR ${outstandingInterest.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, 50, 145);

    // Table headers
    let y = 180;
    doc.setFont("helvetica", "bold");
    doc.setFillColor(248, 250, 252);
    doc.rect(40, y, pageWidth - 80, 20, "F");
    doc.setTextColor(15, 23, 42);
    doc.text("Date", 50, y + 14);
    doc.text("Reference", 130, y + 14);
    doc.text("Narration", 210, y + 14);
    doc.text("Debit", 370, y + 14);
    doc.text("Credit", 440, y + 14);
    doc.text("Balance", 510, y + 14);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    y += 20;

    ledgerRows.forEach((row) => {
      if (y > 780) {
        doc.addPage();
        y = 40;
      }
      doc.text(format(new Date(row.date), "dd-MMM-yy"), 50, y + 12);
      doc.text(row.reference, 130, y + 12);
      doc.text(row.narration.substring(0, 32), 210, y + 12);
      doc.text(row.debit > 0 ? row.debit.toFixed(2) : "—", 370, y + 12);
      doc.text(row.credit > 0 ? row.credit.toFixed(2) : "—", 440, y + 12);
      doc.text(row.running_balance.toFixed(2), 510, y + 12);
      y += 18;
    });

    doc.save(`Interest_Report_${format(new Date(), "yyyyMMdd")}.pdf`);
  };

  const handleDownloadCSV = () => {
    const headers = ["Date", "Reference", "Narration", "Principal", "Days", "Rate", "Debit", "Credit", "Running Balance"];
    const rows = ledgerRows.map(r => [
      format(new Date(r.date), "yyyy-MM-dd"),
      r.reference,
      r.narration,
      r.principal,
      r.days,
      r.rate,
      r.debit,
      r.credit,
      r.running_balance
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `Interest_Ledger_${format(new Date(), "yyyyMMdd")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Indian Rupee helper
  const formatINR = (val) => `₹${Number(val || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const customerColumns = [
    { header: "Customer", accessor: "customer", cell: r => <span className="font-semibold text-slate-800">{r.customer}</span> },
    { header: "Project / Unit", accessor: "project", cell: r => <span className="text-xs text-slate-500">{r.project} · Unit {r.unit}</span> },
    { header: "Agreement Value", accessor: "agreement_value", cell: r => formatINR(r.agreement_value) },
    { header: "Principal Dues", accessor: "principal_outstanding", cell: r => <span className="text-rose-600 font-medium">{formatINR(r.principal_outstanding)}</span> },
    { header: "Interest Accrued", accessor: "accrued", cell: r => formatINR(r.accrued) },
    { header: "Interest Settled", accessor: "collected", cell: r => <span className="text-emerald-600 font-medium">{formatINR(r.collected)}</span> },
    { header: "Net Interest Due", accessor: "netDue", cell: r => <span className="font-bold text-slate-900">{formatINR(r.netDue)}</span> }
  ];

  const ledgerColumns = [
    { header: "Date", accessor: "date", cell: r => format(new Date(r.date), "dd-MMM-yyyy") },
    { header: "Reference", accessor: "reference", cell: r => <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-slate-100 rounded text-slate-700">{r.reference}</span> },
    { header: "Narration", accessor: "narration" },
    { header: "Days", accessor: "days", cell: r => r.days || "—" },
    { header: "Rate", accessor: "rate", cell: r => r.rate ? `${r.rate}%` : "—" },
    { header: "Debit (Charged)", accessor: "debit", cell: r => r.debit > 0 ? <span className="text-red-600 font-semibold">{formatINR(r.debit)}</span> : "—" },
    { header: "Credit (Cleared)", accessor: "credit", cell: r => r.credit > 0 ? <span className="text-emerald-600 font-semibold">{formatINR(r.credit)}</span> : "—" },
    { header: "Running Balance", accessor: "running_balance", cell: r => <span className="font-black text-slate-900">{formatINR(r.running_balance)}</span> },
    { header: "Status", accessor: "status", cell: r => <StatusBadge status={r.status} /> }
  ];

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <PageHeader 
        title="CRM Ledger Interest Report" 
        description="Enterprise Dashboard tracking Accrued Overdue Interest & Settlements" 
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
            <div className="space-y-1.5 flex-1 max-w-sm">
              <Label className="text-xs font-bold uppercase text-slate-400">Filter by Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger className="border-slate-200 shadow-sm font-medium">
                  <SelectValue placeholder="All Customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.full_name} ({c.customer_code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="px-4 py-2 bg-primary/5 rounded-lg border border-primary/10">
              <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Accrued Collection Rate</p>
              <p className="text-lg font-black text-primary mt-0.5">{collectionEfficiency}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card className="border-slate-200/90 shadow-sm p-4 hover:shadow transition-shadow">
          <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1"><Percent className="h-3 w-3 text-red-500" /> Total Accrued</span>
          <h3 className="text-lg font-black text-slate-800 mt-2">{formatINR(totalInterestCharged)}</h3>
        </Card>
        <Card className="border-slate-200/90 shadow-sm p-4 hover:shadow transition-shadow">
          <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1"><Landmark className="h-3 w-3 text-emerald-500" /> Total Paid</span>
          <h3 className="text-lg font-black text-emerald-600 mt-2">{formatINR(totalInterestPaid)}</h3>
        </Card>
        <Card className="border-slate-200/90 shadow-sm p-4 hover:shadow transition-shadow">
          <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1"><Receipt className="h-3 w-3 text-amber-500" /> Total Waived</span>
          <h3 className="text-lg font-black text-amber-600 mt-2">{formatINR(totalInterestWaived)}</h3>
        </Card>
        <Card className="border-slate-200/90 shadow-sm p-4 hover:shadow transition-shadow bg-rose-50/20 border-rose-200">
          <span className="text-[10px] font-bold uppercase text-rose-700 tracking-wider flex items-center gap-1"><DollarSign className="h-3 w-3 text-rose-600" /> Net Outstanding</span>
          <h3 className="text-lg font-black text-rose-600 mt-2">{formatINR(outstandingInterest)}</h3>
        </Card>
        <Card className="border-slate-200/90 shadow-sm p-4 hover:shadow transition-shadow">
          <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1"><Calendar className="h-3 w-3 text-indigo-500" /> Average Delay</span>
          <h3 className="text-lg font-black text-slate-800 mt-2">{avgDelayDays} Days</h3>
        </Card>
        <Card className="border-slate-200/90 shadow-sm p-4 hover:shadow transition-shadow">
          <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1"><TrendingUp className="h-3 w-3 text-violet-500" /> Highest Charge</span>
          <h3 className="text-lg font-black text-slate-800 mt-2">{formatINR(highestInterest)}</h3>
        </Card>
      </div>

      {/* ANALYTICS CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Charged vs Settled */}
        <Card className="border-slate-200/90 shadow-sm p-5 col-span-2">
          <div className="flex items-center gap-1.5 mb-4"><TrendingUp className="h-4 w-4 text-primary" /><h4 className="text-sm font-bold text-slate-800">Monthly Interest Accruals vs Paid Collection</h4></div>
          {monthlyChartData.length === 0 ? (
            <div className="h-[250px] flex items-center justify-center text-xs text-slate-400 font-medium">No chronological interest data found</div>
          ) : (
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChartData}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} className="text-[10px] text-slate-400 font-semibold" />
                  <YAxis tickLine={false} axisLine={false} className="text-[10px] text-slate-400 font-semibold" />
                  <Tooltip formatter={(value) => formatINR(value)} contentStyle={{ borderRadius: 8 }} />
                  <Bar dataKey="Charged" fill="#3b82f6" radius={4} name="Accrued" />
                  <Bar dataKey="Settled" fill="#10b981" radius={4} name="Settled" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Project Pie Chart */}
        <Card className="border-slate-200/90 shadow-sm p-5">
          <div className="flex items-center gap-1.5 mb-4"><Landmark className="h-4 w-4 text-primary" /><h4 className="text-sm font-bold text-slate-800">Interest Accruals by Real Estate Project</h4></div>
          {projectChartData.length === 0 ? (
            <div className="h-[250px] flex items-center justify-center text-xs text-slate-400 font-medium">No project interest data found</div>
          ) : (
            <div className="h-[250px] w-full flex flex-col justify-between">
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={projectChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={2}>
                      {projectChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatINR(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-2">
                {projectChartData.map((entry, idx) => (
                  <span key={entry.name} className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colors[idx % colors.length] }}></span>
                    {entry.name}: {formatINR(entry.value)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* CUSTOMER ACCRUED SUMMARY */}
      <Card className="border-slate-200/90 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
          <h4 className="text-sm font-black text-slate-800">Customer Accrued Interest Summary</h4>
          <span className="text-xs text-slate-500 font-medium">Showing {customerSummary.length} Customers</span>
        </div>
        <DataTable columns={customerColumns} data={customerSummary} searchPlaceholder="Search customer summary..." />
      </Card>

      {/* CHRONOLOGICAL INTEREST LEDGER */}
      <Card className="border-slate-200/90 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
          <h4 className="text-sm font-black text-slate-800">Accrued Interest Transaction Ledger</h4>
          <span className="text-xs text-slate-500 font-medium">Showing {ledgerRows.length} Ledger Postings</span>
        </div>
        <DataTable columns={ledgerColumns} data={ledgerRows} isLoading={isLoading} searchPlaceholder="Search interest ledger..." />
      </Card>
    </div>
  );
}