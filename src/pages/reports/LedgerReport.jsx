import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

export default function LedgerReport() {
  const [customerId, setCustomerId] = useState("");
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: () => apiClient.entities.Customer.list("-created_date", 200) });
  const { data: receipts = [] } = useQuery({ queryKey: ["receipts"], queryFn: () => apiClient.entities.PaymentReceipt.list("-receipt_date", 500) });
  const { data: demands = [] } = useQuery({ queryKey: ["demandLetters"], queryFn: () => apiClient.entities.DemandLetter.list("-demand_date", 500) });

  const filtered = customerId
    ? [...demands.filter(d => d.customer_id === customerId).map(d => ({ ...d, type: "Debit", date: d.demand_date, amount: d.total_demand || d.demand_amount || 0, desc: `Demand #${d.installment_number || ""} - ${d.milestone_description || "Installment"}` })),
       ...receipts.filter(r => r.customer_id === customerId).map(r => ({ ...r, type: "Credit", date: r.receipt_date, amount: r.amount || 0, desc: `Receipt - ${r.payment_mode || ""} ${r.reference_number || ""}` }))
      ].sort((a, b) => new Date(a.date) - new Date(b.date))
    : [];

  let running = 0;
  const ledger = filtered.map(entry => {
    if (entry.type === "Debit") running += entry.amount;
    else running -= entry.amount;
    return { ...entry, balance: running };
  });

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const selectedOrder = customerId ? orders.find((o) => o.customer_id === customerId) : null;
  const ledgerColor = (type) => type === "Credit" ? "bg-emerald-50" : "bg-blue-50";

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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Project</p><p className="font-medium">{selectedOrder?.project_name || "-"}</p></div>
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Unit</p><p className="font-medium">{selectedOrder?.unit_number || "-"}</p></div>
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Customer</p><p className="font-medium">{selectedCustomer?.full_name || "-"}</p></div>
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">PAN</p><p className="font-medium">{selectedCustomer?.pan_number || "-"}</p></div>
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
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((entry, idx) => (
                    <tr key={idx} className={`border-b ${ledgerColor(entry.type)}`}>
                      <td className="py-2 px-3">{entry.date ? format(new Date(entry.date), "dd MMM yyyy") : "-"}</td>
                      <td className="py-2 px-3 font-medium">{entry.type === "Credit" ? "Receipts" : "Instalment"}</td>
                      <td className="py-2 px-3">{entry.date ? format(new Date(entry.date), "dd MMM yyyy") : "-"}</td>
                      <td className="py-2 px-3">{entry.desc}</td>
                      <td className="py-2 px-3 text-right">{entry.type === "Debit" ? `INR ${entry.amount.toLocaleString()}` : "-"}</td>
                      <td className="py-2 px-3 text-right">{entry.type === "Credit" ? `INR ${entry.amount.toLocaleString()}` : "-"}</td>
                      <td className="py-2 px-3 text-right font-semibold">INR {entry.balance.toLocaleString()}</td>
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