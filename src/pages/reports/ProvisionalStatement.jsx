import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

export default function ProvisionalStatement() {
  const [customerId, setCustomerId] = useState("");
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: () => apiClient.entities.Customer.list("-created_date", 200) });
  const { data: orders = [] } = useQuery({ queryKey: ["salesOrders"], queryFn: () => apiClient.entities.SalesOrder.list("-created_date", 500) });
  const { data: receipts = [] } = useQuery({ queryKey: ["receipts"], queryFn: () => apiClient.entities.PaymentReceipt.list("-receipt_date", 500) });
  const { data: demands = [] } = useQuery({ queryKey: ["demandLetters"], queryFn: () => apiClient.entities.DemandLetter.list("-demand_date", 500) });

  const customer = customers.find(c => c.id === customerId);
  const customerOrders = orders.filter(o => o.customer_id === customerId);
  const customerReceipts = receipts.filter(r => r.customer_id === customerId);
  const customerDemands = demands.filter(d => d.customer_id === customerId);

  const totalDemanded = customerDemands.reduce((s, d) => s + (d.total_demand || d.demand_amount || 0), 0);
  const totalReceived = customerReceipts.reduce((s, r) => s + (r.amount || 0), 0);
  const totalOrderValue = customerOrders.reduce((s, o) => s + (o.total_value || 0), 0);

  return (
    <div>
      <PageHeader title="Provisional Statement Report" description="Expected future dues and current balance per customer" />
      <Card className="mb-6">
        <CardContent className="pt-4">
          <div className="space-y-1.5 max-w-sm">
            <Label>Select Customer</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger><SelectValue placeholder="Choose a customer" /></SelectTrigger>
              <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name} ({c.customer_code})</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {customer && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Customer: {customer.full_name} ({customer.customer_code})</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div><p className="text-xs text-muted-foreground">Total Order Value</p><p className="text-lg font-bold">₹{totalOrderValue.toLocaleString()}</p></div>
                <div><p className="text-xs text-muted-foreground">Total Demanded</p><p className="text-lg font-bold">₹{totalDemanded.toLocaleString()}</p></div>
                <div><p className="text-xs text-muted-foreground">Total Received</p><p className="text-lg font-bold text-emerald-600">₹{totalReceived.toLocaleString()}</p></div>
                <div><p className="text-xs text-muted-foreground">Balance Due</p><p className="text-lg font-bold text-red-600">₹{(totalDemanded - totalReceived).toLocaleString()}</p></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Demand Schedule</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {customerDemands.length === 0 && <p className="text-sm text-muted-foreground">No demands generated</p>}
                {customerDemands.map(d => (
                  <div key={d.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{d.milestone_description || `Installment ${d.installment_number || ""}`}</p>
                      <p className="text-xs text-muted-foreground">Due: {d.due_date ? format(new Date(d.due_date), "dd MMM yyyy") : "—"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">₹{(d.total_demand || d.demand_amount || 0).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Paid: ₹{(d.amount_paid || 0).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      {!customerId && <p className="text-sm text-muted-foreground text-center py-12">Select a customer to generate provisional statement</p>}
    </div>
  );
}