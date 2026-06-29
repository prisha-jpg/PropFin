import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Download } from "lucide-react";

export default function LedgerReport() {
  const [customerId, setCustomerId] = useState("");
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: () => apiClient.entities.Customer.list("-created_date", 200) });
  const { data: receipts = [] } = useQuery({ queryKey: ["receipts"], queryFn: () => apiClient.entities.PaymentReceipt.list("-receipt_date", 500) });
  const { data: demands = [] } = useQuery({ queryKey: ["demandLetters"], queryFn: () => apiClient.entities.DemandLetter.list("-demand_date", 500) });
  const { data: orders = [] } = useQuery({ queryKey: ["salesOrders"], queryFn: () => apiClient.entities.SalesOrder.list("-created_date", 500) });
  const { data: ledgerEntries = [] } = useQuery({
    queryKey: ["ledgerEntries", customerId],
    queryFn: () => customerId ? apiClient.get(`/pricing/ledger/${customerId}`) : Promise.resolve([]),
    enabled: !!customerId
  });

  const filtered = customerId
    ? [
        ...demands.filter(d => d.customer_id === customerId).map(d => ({
          ...d,
          type: "Debit",
          date: d.demand_date,
          amount: Number(d.total_demand_amount || d.principal_amount || 0),
          desc: `Demand #${d.demand_number || ""} - ${d.demand_type || "Installment"}`,
          entryClass: "Instalment",
          labelType: "Instalment"
        })),
        ...receipts.filter(r => r.customer_id === customerId).map(r => ({
          ...r,
          type: "Credit",
          date: r.receipt_date,
          amount: Number(r.amount || 0),
          desc: `Receipt - ${r.payment_mode || ""} ${r.receipt_number || ""}`,
          entryClass: "Receipts",
          labelType: "Receipts"
        })),
        ...ledgerEntries.filter(l => l.customer_id === customerId).map(l => {
          let labelType = "Interest";
          let entryClass = "Interest";

          if (l.transaction_type === "LATE_FEE_INTEREST") {
            labelType = "Interest";
            entryClass = "Interest";
          } else if (l.transaction_type === "REVERSAL" || l.transaction_type === "BOUNCE_REVERSAL") {
            labelType = "Reversal";
            entryClass = "Reversal";
          } else if (l.transaction_type === "PENALTY") {
            labelType = "Penalty";
            entryClass = "Penalty";
          } else {
            labelType = l.transaction_type || "Debit";
            entryClass = "Debit";
          }

          return {
            ...l,
            type: "Debit",
            date: l.reference_date,
            amount: Number(l.amount || 0),
            desc: l.description,
            entryClass,
            labelType
          };
        })
      ].sort((a, b) => new Date(a.date) - new Date(b.date))
    : [];

  let running = 0;
  const ledger = filtered.map(entry => {
    if (entry.type === "Debit") running += entry.amount;
    else running -= entry.amount;
    return { ...entry, balance: running, netAmount: running };
  });

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const selectedOrder = customerId ? orders.find((o) => o.customer_id === customerId) : null;
  
  const ledgerColor = (entry) => {
    if (entry.type === "Credit") return "bg-emerald-50/50 hover:bg-emerald-50 text-emerald-950";
    if (entry.entryClass === "Interest") return "bg-orange-50/50 hover:bg-orange-50 text-orange-950";
    if (entry.entryClass === "Reversal") return "bg-red-50/50 hover:bg-red-50 text-red-950";
    if (entry.entryClass === "Penalty") return "bg-amber-50/50 hover:bg-amber-50 text-amber-950";
    return "bg-blue-50/50 hover:bg-blue-50 text-blue-950";
  };

  return (
    <div className="space-y-6">
      <PageHeader title="CRM Ledger Report" description="Complete debit/credit ledger per customer" />
      <Card className="mb-6">
        <CardContent className="pt-4">
          <div className="flex items-end gap-4">
            <div className="space-y-1.5 flex-1 max-w-sm">
              <Label>Select Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="Choose a customer" /></SelectTrigger>
                <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name} ({c.customer_code})</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {customerId && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Project</p><p className="font-medium">{selectedOrder?.project_name || "-"}</p></div>
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Unit</p><p className="font-medium">{selectedOrder?.unit_number || "-"}</p></div>
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Customer</p><p className="font-medium">{selectedCustomer?.full_name || "-"}</p></div>
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">PAN</p><p className="font-medium">{selectedCustomer?.pan_number || "-"}</p></div>
              <div className="rounded-md border border-red-200 bg-red-50/20 p-3"><p className="text-xs text-red-700 font-semibold">Outstanding Balance (Profile)</p><p className="font-bold text-red-700">INR {Number(ledger.length > 0 ? ledger[ledger.length - 1].netAmount : 0).toLocaleString()}</p></div>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-100 z-10">
                  <tr className="text-xs uppercase text-muted-foreground border-b">
                    <th className="text-left py-2 px-3">Date</th>
                    <th className="text-left py-2 px-3">Type</th>
                    <th className="text-left py-2 px-3">Consideration Date</th>
                    <th className="text-left py-2 px-3">Narration</th>
                    <th className="text-right py-2 px-3">Debit</th>
                    <th className="text-right py-2 px-3">Credit</th>
                    <th className="text-right py-2 px-3">Net Amount</th>
                    <th className="text-center py-2 px-3 w-24">Download</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((entry, idx) => (
                    <tr key={idx} className={`border-b transition-colors duration-200 ${ledgerColor(entry)}`}>
                      <td className="py-2 px-3">{entry.date ? format(new Date(entry.date), "dd MMM yyyy") : "-"}</td>
                      <td className="py-2 px-3 font-medium">{entry.labelType || (entry.type === "Credit" ? "Receipts" : "Instalment")}</td>
                      <td className="py-2 px-3">{entry.date ? format(new Date(entry.date), "dd MMM yyyy") : "-"}</td>
                      <td className="py-2 px-3">{entry.desc}</td>
                      <td className="py-2 px-3 text-right">{entry.type === "Debit" ? `INR ${entry.amount.toLocaleString()}` : "-"}</td>
                      <td className="py-2 px-3 text-right">{entry.type === "Credit" ? `INR ${entry.amount.toLocaleString()}` : "-"}</td>
                      <td className="py-2 px-3 text-right font-semibold">INR {entry.balance.toLocaleString()}</td>
                      <td className="py-2 px-3 text-center">
                        {(entry.entryClass === "Instalment" || entry.entryClass === "Receipts") ? (
                          <a
                            href={
                              entry.entryClass === "Instalment"
                                ? `/api/documents/demand-letter/${entry.id}/download`
                                : `/api/documents/receipt/${entry.id}/download`
                            }
                            download
                            className="inline-flex items-center justify-center rounded-md p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 transition-colors"
                            title={`Download ${entry.entryClass === "Instalment" ? "Demand Letter" : "Receipt"}`}
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {!customerId && <p className="text-sm text-muted-foreground text-center py-12">Select a customer to view their ledger</p>}
    </div>
  );
}