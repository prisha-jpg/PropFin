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
import { Download, Landmark, FileText, Calendar, ArrowRight, ShieldCheck } from "lucide-react";
import { jsPDF } from "jspdf";

export default function ProvisionalStatement() {
  const [customerId, setCustomerId] = useState("");

  // Data queries
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: () => apiClient.entities.Customer.list("-created_date", 200) });
  const { data: orders = [] } = useQuery({ queryKey: ["salesOrders"], queryFn: () => apiClient.entities.SalesOrder.list("-created_date", 500) });
  const { data: receipts = [] } = useQuery({ queryKey: ["receipts"], queryFn: () => apiClient.entities.PaymentReceipt.list("-receipt_date", 500) });
  const { data: demands = [] } = useQuery({ queryKey: ["demandLetters"], queryFn: () => apiClient.entities.DemandLetter.list("-demand_date", 500) });
  const { data: entries = [] } = useQuery({ queryKey: ["interestEntries"], queryFn: () => apiClient.entities.InterestEntry.list("-created_date", 500) });
  const { data: ledgers = [] } = useQuery({ queryKey: ["ledgers"], queryFn: () => apiClient.entities.Ledger.list("-reference_date", 1000) });

  const customer = customers.find(c => c.id === customerId);
  const customerOrders = orders.filter(o => o.customer_id === customerId && o.status !== "cancelled");
  const order = customerOrders[0]; // primary booking

  const customerReceipts = receipts.filter(r => r.customer_id === customerId);
  const customerDemands = demands.filter(d => d.customer_id === customerId);

  const interestFromLedger = ledgers
    .filter(l => l.customer_id === customerId && (l.transaction_type === "INTEREST" || l.transaction_type === "LATE_FEE_INTEREST"))
    .map(l => ({
      id: l.id,
      customer_id: l.customer_id,
      interest_amount: Number(l.amount || l.debit || 0),
      status: l.status === "PAID" ? "settled" : "active"
    }));

  const customerInterest = [...entries.filter(e => e.customer_id === customerId), ...interestFromLedger];

  // Financial aggregates
  const totalOrderValue = order?.total_value || 0;
  const totalDemanded = customerDemands.reduce((s, d) => s + (d.total_demand || d.demand_amount || 0), 0);
  const totalReceived = customerReceipts.reduce((s, r) => s + (r.amount || 0), 0);
  
  // Principal & GST demands breakdown
  const totalPrincipalDemanded = customerDemands.reduce((s, d) => s + (d.demand_amount || 0), 0);
  const totalGstDemanded = customerDemands.reduce((s, d) => s + (d.gst_amount || 0), 0);
  
  // Accrued interest details
  const interestAccrued = customerInterest.reduce((s, e) => s + (e.interest_amount || 0), 0);
  const interestSettled = customerInterest.filter(e => e.status === "settled" || e.settlement_id).reduce((s, e) => s + (e.interest_amount || 0), 0);
  const interestWaived = customerInterest.filter(e => e.status === "waived" || e.waiver_id).reduce((s, e) => s + (e.interest_amount || 0), 0);
  const interestOutstanding = interestAccrued - interestSettled - interestWaived;

  // Final statement balance formula: Net Raised Dues (Milestones Demands + GST Demands + Interest Charges - Payments Received)
  const outstandingBalance = order?.outstanding_amount || (totalDemanded - totalReceived);
  const netReceivableBalance = outstandingBalance + interestOutstanding;

  // 1. COMBINED CHRONOLOGICAL LEDGER
  const ledgerRows = [];
  customerDemands.forEach(d => {
    ledgerRows.push({
      date: d.demand_date || order?.booking_date || new Date().toISOString(),
      reference: d.demand_number || "DEMAND",
      narration: d.milestone_description || "Milestone installment demand raised",
      debit: d.total_demand || d.demand_amount || 0,
      credit: 0
    });
  });

  customerReceipts.forEach(r => {
    ledgerRows.push({
      date: r.receipt_date || new Date().toISOString(),
      reference: r.receipt_number || "RECEIPT",
      narration: `Payment received via ${r.payment_mode.toUpperCase()}${r.bank_name ? ` (${r.bank_name})` : ""}`,
      debit: 0,
      credit: r.amount || 0
    });
  });

  // Sort and build running balance
  const sortedLedger = ledgerRows.sort((a, b) => new Date(a.date) - new Date(b.date));
  let bal = 0;
  const ledgerRowsWithBalance = sortedLedger.map(row => {
    bal = bal + row.debit - row.credit;
    return {
      ...row,
      running_balance: bal
    };
  });

  const ledgerColumns = [
    { header: "Date", accessor: "date", cell: r => format(new Date(r.date), "dd-MMM-yyyy") },
    { header: "Reference", accessor: "reference", cell: r => <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-slate-100 rounded text-slate-700">{r.reference}</span> },
    { header: "Description", accessor: "narration" },
    { header: "Debit (Demanded)", accessor: "debit", cell: r => r.debit > 0 ? <span className="text-slate-800 font-semibold">{formatINR(r.debit)}</span> : "—" },
    { header: "Credit (Received)", accessor: "credit", cell: r => r.credit > 0 ? <span className="text-emerald-600 font-semibold">{formatINR(r.credit)}</span> : "—" },
    { header: "Running Balance", accessor: "running_balance", cell: r => <span className="font-black text-slate-900">{formatINR(r.running_balance)}</span> }
  ];

  // Helper formatting INR
  const formatINR = (val) => `₹${Number(val || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // 2. PROGRESS STEPPER PERCENTAGES
  const demandPercent = totalOrderValue > 0 ? Math.min(100, Math.round((totalDemanded / totalOrderValue) * 100)) : 0;
  const paidPercent = totalDemanded > 0 ? Math.min(100, Math.round((totalReceived / totalDemanded) * 100)) : 0;

  // 3. DOWNLOAD PDF STATEMENT
  const handleDownloadPDF = () => {
    if (!customer) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(30, 96, 235);
    doc.text("PropFin Platform", pageWidth / 2, 45, { align: "center" });

    doc.setFontSize(12);
    doc.setTextColor(100, 116, 139);
    doc.text("Provisional Financial Statement", pageWidth / 2, 65, { align: "center" });

    doc.setDrawColor(226, 232, 240);
    doc.line(40, 80, pageWidth - 40, 80);

    // Summary details
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(`Customer Name: ${customer.full_name}`, 50, 100);
    doc.text(`Project & Unit: ${order?.project_name || "—"} (Unit ${order?.unit_number || "—"})`, 50, 115);
    doc.text(`Agreement Value: INR ${totalOrderValue.toLocaleString()}`, 50, 130);
    doc.text(`Total Demands: INR ${totalDemanded.toLocaleString()}`, 50, 145);
    doc.text(`Total Paid: INR ${totalReceived.toLocaleString()}`, 320, 100);
    doc.text(`Outstanding Balance: INR ${outstandingBalance.toLocaleString()}`, 320, 115);
    doc.text(`Interest Outstanding: INR ${interestOutstanding.toLocaleString()}`, 320, 130);
    doc.text(`Net Payable: INR ${netReceivableBalance.toLocaleString()}`, 320, 145);

    let y = 180;
    doc.setFont("helvetica", "bold");
    doc.setFillColor(248, 250, 252);
    doc.rect(40, y, pageWidth - 80, 20, "F");
    doc.setTextColor(15, 23, 42);
    doc.text("Date", 50, y + 14);
    doc.text("Reference", 130, y + 14);
    doc.text("Description", 210, y + 14);
    doc.text("Debit", 380, y + 14);
    doc.text("Credit", 450, y + 14);
    doc.text("Balance", 510, y + 14);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    y += 20;

    ledgerRowsWithBalance.forEach((row) => {
      if (y > 780) {
        doc.addPage();
        y = 40;
      }
      doc.text(format(new Date(row.date), "dd-MMM-yy"), 50, y + 12);
      doc.text(row.reference, 130, y + 12);
      doc.text(row.narration.substring(0, 32), 210, y + 12);
      doc.text(row.debit > 0 ? row.debit.toFixed(2) : "—", 380, y + 12);
      doc.text(row.credit > 0 ? row.credit.toFixed(2) : "—", 450, y + 12);
      doc.text(row.running_balance.toFixed(2), 510, y + 12);
      y += 18;
    });

    doc.save(`Provisional_Statement_${customer.customer_code}.pdf`);
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <PageHeader 
        title="Provisional Financial Statement" 
        description="Comprehensive customer billing timeline, ledger payments history, and schedule status" 
        actions={
          customer && (
            <button onClick={handleDownloadPDF} className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary/95 transition-colors shadow-sm">
              <Download className="h-4 w-4" /> Download Statement PDF
            </button>
          )
        }
      />

      {/* CUSTOMER SELECTION CARD */}
      <Card className="border-slate-200/90 shadow-sm">
        <CardContent className="pt-5 pb-5">
          <div className="space-y-1.5 max-w-sm">
            <Label className="text-xs font-bold uppercase text-slate-400">Select Customer Account</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger className="border-slate-200 shadow-sm font-semibold text-slate-800">
                <SelectValue placeholder="Choose a customer account..." />
              </SelectTrigger>
              <SelectContent>
                {customers.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.full_name} ({c.customer_code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {customer ? (
        <div className="space-y-6">
          {/* CUSTOMER SUMMARY DASHBOARD CARD */}
          <Card className="border-slate-200/90 shadow-sm overflow-hidden bg-white">
            <div className="bg-slate-50/50 p-5 border-b border-slate-200 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded uppercase tracking-wider">Applicant 1 Info</span>
                <h3 className="text-base font-black text-slate-800 mt-1.5">{customer.full_name}</h3>
                <p className="text-xs text-slate-400 mt-0.5">CIF: {customer.customer_code} • PAN: {customer.pan_number || "—"}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 block uppercase font-bold tracking-wider">Booking Status</span>
                <span className="inline-block mt-1"><StatusBadge status={order?.status || "booked"} /></span>
              </div>
            </div>
            <CardContent className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Agreement Value</p>
                  <p className="text-base font-black text-slate-800 mt-1">{formatINR(totalOrderValue)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Demands Raised</p>
                  <p className="text-base font-black text-slate-800 mt-1">{formatINR(totalDemanded)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Amount Cleared</p>
                  <p className="text-base font-black text-emerald-600 mt-1">{formatINR(totalReceived)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Accrued Interest Dues</p>
                  <p className="text-base font-black text-amber-700 mt-1">{formatINR(interestOutstanding)}</p>
                </div>
                <div className="bg-primary/[0.02] border border-primary/10 p-3 rounded-lg">
                  <p className="text-[9px] font-bold text-primary uppercase tracking-wider">Net Outstanding Balance</p>
                  <p className="text-base font-extrabold text-primary mt-1">{formatINR(netReceivableBalance)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* PROGRESS STEPPER BAR */}
          <Card className="border-slate-200/90 shadow-sm p-6 bg-white">
            <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-4">Milestones & Billing Collection Progress</h4>
            <div className="space-y-4">
              <div className="relative pt-1">
                <div className="flex mb-2 items-center justify-between text-xs font-bold text-slate-600">
                  <span>Demanded from Agreement ({demandPercent}%)</span>
                  <span>Paid from Demands ({paidPercent}%)</span>
                </div>
                <div className="overflow-hidden h-2.5 text-xs flex rounded-full bg-slate-100 border border-slate-200">
                  <div style={{ width: `${demandPercent}%` }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-primary rounded-l-full"></div>
                  <div style={{ width: `${paidPercent}%` }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-emerald-500 rounded-r-full"></div>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] font-extrabold text-slate-400 uppercase tracking-wider pt-2">
                <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary block"></span> Agreement (₹{totalOrderValue.toLocaleString()})</div>
                <div className="flex items-center gap-1.5"><ArrowRight className="h-3 w-3" /> Demanded (₹{totalDemanded.toLocaleString()})</div>
                <div className="flex items-center gap-1.5"><ArrowRight className="h-3 w-3" /> Paid (₹{totalReceived.toLocaleString()})</div>
                <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500 block"></span> Dues (₹{outstandingBalance.toLocaleString()})</div>
              </div>
            </div>
          </Card>

          {/* TIMELINE DEMAND SCHEDULE */}
          <Card className="border-slate-200/90 shadow-sm p-5 bg-white">
            <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-5">Generated Milestone Demand Schedule</h4>
            <div className="space-y-4 relative before:absolute before:left-[17px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
              {customerDemands.length === 0 ? (
                <p className="text-sm text-slate-500 pl-6 py-2">No demand milestones generated for this booking.</p>
              ) : (
                customerDemands.map((d, index) => {
                  const balance = (d.total_demand || d.demand_amount || 0) - (d.amount_paid || 0);
                  return (
                    <div key={d.id} className="flex gap-4 items-start relative animate-in slide-in-from-left duration-200" style={{ animationDelay: `${index * 50}ms` }}>
                      <div className="h-9 w-9 rounded-full bg-slate-50 border border-slate-200 shadow-sm flex items-center justify-center text-primary font-bold text-sm z-10">
                        {index + 1}
                      </div>
                      <div className="flex-1 bg-slate-50/50 p-4 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{d.milestone_description || `Installment Sequence ${d.installment_number || ""}`}</p>
                          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                            <Calendar className="h-3 w-3" /> Due Date: {d.due_date ? format(new Date(d.due_date), "dd-MMM-yyyy") : "—"}
                          </p>
                        </div>
                        <div className="flex items-center gap-5 justify-between sm:justify-end">
                          <div className="text-right">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Demanded Amount</p>
                            <p className="text-sm font-black text-slate-800 mt-0.5">{formatINR(d.total_demand || d.demand_amount)}</p>
                            <p className="text-[10px] text-slate-400 font-medium">Paid: {formatINR(d.amount_paid)}</p>
                          </div>
                          <span className="inline-block"><StatusBadge status={d.status} /></span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          {/* FINANCIAL SUMMARY & CHECKLIST */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Payment history unified ledger table */}
            <Card className="border-slate-200/90 shadow-sm overflow-hidden lg:col-span-2">
              <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
                <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Unified Account Transaction History Ledger</h4>
                <span className="text-xs text-slate-500 font-semibold">{ledgerRowsWithBalance.length} Entries</span>
              </div>
              <DataTable columns={ledgerColumns} data={ledgerRowsWithBalance} searchPlaceholder="Search statement ledger..." />
            </Card>

            {/* Billing breakdown summary */}
            <Card className="border-slate-200/90 shadow-sm p-5 bg-white flex flex-col justify-between">
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Billing Breakdown Summary</h4>
                <div className="divide-y divide-slate-100">
                  <div className="py-2.5 flex justify-between text-sm">
                    <span className="text-slate-500 font-medium">Total Demanded Principal:</span>
                    <span className="font-mono text-slate-800">{formatINR(totalPrincipalDemanded)}</span>
                  </div>
                  <div className="py-2.5 flex justify-between text-sm">
                    <span className="text-slate-500 font-medium">GST Tax Demanded:</span>
                    <span className="font-mono text-slate-800">{formatINR(totalGstDemanded)}</span>
                  </div>
                  <div className="py-2.5 flex justify-between text-sm">
                    <span className="text-slate-500 font-medium">Total Interest Accrued:</span>
                    <span className="font-mono text-red-600">{formatINR(interestAccrued)}</span>
                  </div>
                  <div className="py-2.5 flex justify-between text-sm">
                    <span className="text-slate-500 font-medium">Approved Interest Waivers:</span>
                    <span className="font-mono text-emerald-600">({formatINR(interestWaived)})</span>
                  </div>
                  <div className="py-2.5 flex justify-between text-sm">
                    <span className="text-slate-500 font-medium">Payments Received / Paid:</span>
                    <span className="font-mono text-emerald-600">({formatINR(totalReceived)})</span>
                  </div>
                  <div className="pt-4 flex justify-between text-sm font-bold text-slate-900">
                    <span>Net Statement Receivable:</span>
                    <span className="font-mono">{formatINR(netReceivableBalance)}</span>
                  </div>
                </div>
              </div>
              <div className="mt-6 p-3 bg-slate-50 rounded-lg border border-slate-200/80 flex items-start gap-2.5">
                <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-[10px] text-slate-500 leading-relaxed font-semibold">
                  This provisional statement represents calculated billings. Interest calculations and GST levies are subject to standard audit logs.
                </p>
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <Card className="border-slate-200 shadow-sm border-dashed">
          <CardContent className="py-16 text-center">
            <FileText className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-500">Select a customer account from the dropdown above to view billing statement timeline and payment schedules.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}