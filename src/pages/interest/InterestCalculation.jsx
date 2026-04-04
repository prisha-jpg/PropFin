import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Calculator, Play } from "lucide-react";

export default function InterestCalculation() {
  const [params, setParams] = useState({ from_date: "", to_date: "", interest_rate: "18", customer_id: "" });
  const [results, setResults] = useState([]);
  const queryClient = useQueryClient();

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: () => apiClient.entities.Customer.list("-created_date", 200) });
  const { data: orders = [] } = useQuery({ queryKey: ["salesOrders"], queryFn: () => apiClient.entities.SalesOrder.list("-created_date", 500) });

  const mutation = useMutation({
    mutationFn: (entries) => apiClient.entities.InterestEntry.bulkCreate(entries),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["interestEntries"] }); toast.success("Interest entries created"); }
  });

  const calculateInterest = () => {
    const rate = Number(params.interest_rate) / 100;
    const from = new Date(params.from_date);
    const to = new Date(params.to_date);
    const days = Math.ceil((to - from) / (1000 * 60 * 60 * 24));

    const filteredOrders = params.customer_id
      ? orders.filter(o => o.customer_id === params.customer_id && (o.outstanding_amount || 0) > 0)
      : orders.filter(o => (o.outstanding_amount || 0) > 0);

    const calc = filteredOrders.map(o => ({
      entry_number: "INT" + Date.now().toString(36).toUpperCase() + o.id.slice(-4),
      customer_id: o.customer_id,
      customer_name: o.customer_name,
      sales_order_id: o.id,
      project_name: o.project_name,
      unit_number: o.unit_number,
      principal_amount: o.outstanding_amount,
      interest_rate: Number(params.interest_rate),
      interest_amount: Math.round((o.outstanding_amount || 0) * rate * days / 365),
      period_from: params.from_date,
      period_to: params.to_date,
      days,
      entry_type: "calculated",
      status: "pending"
    }));

    setResults(calc);
  };

  return (
    <div>
      <PageHeader title="Interest Calculation Process" description="Calculate interest on outstanding balances" />
      <Card className="max-w-4xl mb-6">
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Calculator className="w-4 h-4" /> Calculation Parameters</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label>From Date *</Label>
              <Input type="date" value={params.from_date} onChange={e => setParams(p => ({ ...p, from_date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>To Date *</Label>
              <Input type="date" value={params.to_date} onChange={e => setParams(p => ({ ...p, to_date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Interest Rate (%)</Label>
              <Input type="number" value={params.interest_rate} onChange={e => setParams(p => ({ ...p, interest_rate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Customer (optional)</Label>
              <Select value={params.customer_id} onValueChange={v => setParams(p => ({ ...p, customer_id: v }))}>
                <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>All Customers</SelectItem>
                  {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button className="mt-4 gap-2" onClick={calculateInterest} disabled={!params.from_date || !params.to_date}><Play className="w-4 h-4" /> Run Calculation</Button>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Results ({results.length} entries)</CardTitle>
              <Button size="sm" onClick={() => mutation.mutate(results)} disabled={mutation.isPending}>Save All Entries</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {results.map((r, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                  <div>
                    <p className="font-medium">{r.customer_name}</p>
                    <p className="text-xs text-muted-foreground">{r.project_name} · {r.unit_number} · {r.days} days</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Principal: ₹{(r.principal_amount || 0).toLocaleString()}</p>
                    <p className="font-semibold text-red-600">Interest: ₹{r.interest_amount.toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}