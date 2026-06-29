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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interestEntries"] });
      queryClient.invalidateQueries({ queryKey: ["ledgerEntries"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Interest entries created");
    }
  });

  const calculateMonthlyDelayedInterest = ({
    milestoneDemand,
    amountPaid,
    dueDate,
    calculationEndDate,
    annualInterestRate
  }) => {
    const principal = Number(milestoneDemand || 0) - Number(amountPaid || 0);
    if (principal <= 0) return [];
    const rate = Number(annualInterestRate);
    if (isNaN(rate) || rate < 0) return [];

    const parseDateToUtc = (d) => {
      const dateObj = new Date(d);
      return new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
    };

    const dueUtc = parseDateToUtc(dueDate);
    const endUtc = parseDateToUtc(calculationEndDate);

    if (dueUtc >= endUtc) return [];

    const overdueStart = new Date(dueUtc.getTime() + 24 * 60 * 60 * 1000);
    const overdueEnd = endUtc;

    const results = [];
    let currentYear = overdueStart.getUTCFullYear();
    let currentMonth = overdueStart.getUTCMonth();
    const endYear = overdueEnd.getUTCFullYear();
    const endMonth = overdueEnd.getUTCMonth();

    const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);

    const formatUtcDMY = (d) => {
      const dd = d.getUTCDate().toString().padStart(2, '0');
      const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
      const yyyy = d.getUTCFullYear();
      return `${dd}/${mm}/${yyyy}`;
    };

    while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
      const firstDayOfMonth = new Date(Date.UTC(currentYear, currentMonth, 1));
      const lastDayOfMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 0));

      const rangeStart = overdueStart > firstDayOfMonth ? overdueStart : firstDayOfMonth;
      const rangeEnd = overdueEnd < lastDayOfMonth ? overdueEnd : lastDayOfMonth;

      if (rangeStart <= rangeEnd) {
        const timeDiff = rangeEnd.getTime() - rangeStart.getTime();
        const daysOverdue = Math.round(timeDiff / (1000 * 60 * 60 * 24)) + 1;
        const daysInYear = isLeapYear(currentYear) ? 366 : 365;

        const interestCalculated = (principal * rate * daysOverdue) / (daysInYear * 100);
        const roundedInterest = Math.round((interestCalculated + Number.EPSILON) * 100) / 100;

        const monthStr = (currentMonth + 1).toString().padStart(2, '0');
        const monthYear = `${monthStr}-${currentYear}`;

        results.push({
          monthYear,
          daysOverdue,
          interestAmount: roundedInterest,
          narration: `Delayed payment interest for the period of ${formatUtcDMY(rangeStart)} to ${formatUtcDMY(rangeEnd)}`,
          rangeStart,
          rangeEnd
        });
      }

      if (currentMonth === 11) {
        currentMonth = 0;
        currentYear += 1;
      } else {
        currentMonth += 1;
      }
    }

    return results;
  };

  const calculateInterest = () => {
    const rate = Number(params.interest_rate);

    const filteredOrders = params.customer_id
      ? orders.filter(o => o.customer_id === params.customer_id && (o.outstanding_amount || 0) > 0)
      : orders.filter(o => (o.outstanding_amount || 0) > 0);

    const calc = [];

    for (const o of filteredOrders) {
      const monthlyBreakdown = calculateMonthlyDelayedInterest({
        milestoneDemand: o.outstanding_amount,
        amountPaid: 0,
        dueDate: params.from_date,
        calculationEndDate: params.to_date,
        annualInterestRate: rate
      });

      for (const m of monthlyBreakdown) {
        calc.push({
          entry_number: "INT" + Date.now().toString(36).toUpperCase() + o.id.slice(-4) + "_" + m.monthYear.replace("-", ""),
          customer_id: o.customer_id,
          customer_name: o.customer_name,
          sales_order_id: o.id,
          project_name: o.project_name,
          unit_number: o.unit_number,
          principal_amount: o.outstanding_amount,
          interest_rate: rate,
          interest_amount: m.interestAmount,
          period_from: m.rangeStart.toISOString().split("T")[0],
          period_to: m.rangeEnd.toISOString().split("T")[0],
          days: m.daysOverdue,
          entry_type: "calculated",
          status: "pending",
          monthYear: m.monthYear,
          narration: m.narration
        });
      }
    }

    setResults(calc);
  };

  return (
    <div>
      <PageHeader title="Interest Calculation Process" description="Calculate interest on outstanding balances" />
      
      {/* Deprecation Warning Banner */}
      <div className="bg-amber-50/70 border-l-4 border-amber-500 p-4 mb-6 rounded-r-md shadow-sm">
        <div className="flex">
          <div className="flex-shrink-0">
            <Calculator className="h-5 w-5 text-amber-600" aria-hidden="true" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-semibold text-amber-900">Standard Run Deprecation Notice</h3>
            <div className="mt-2 text-xs text-amber-800 space-y-1">
              <p>
                Standard monthly interest calculation has been fully automated and runs in the background at 23:50 on the last day of each calendar month.
              </p>
              <p>
                This manual tool is deprecated for standard monthly processing and should only be used for final settlements, adjustments, or manual overrides.
              </p>
            </div>
          </div>
        </div>
      </div>

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
          <Button className="mt-4 gap-2" onClick={calculateInterest} disabled={!params.from_date || !params.to_date}>
            <Play className="w-4 h-4" /> Run Manual Calculation (Final Settlement / Override)
          </Button>
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
                <div key={i} className="flex items-center justify-between py-3 border-b last:border-0 text-sm hover:bg-slate-50/50 transition-colors px-1">
                  <div>
                    <p className="font-semibold text-slate-900">{r.customer_name} ({r.unit_number || "N/A"})</p>
                    <p className="text-xs text-slate-600 font-medium mt-0.5">{r.project_name} · {r.narration}</p>
                    <p className="text-xs font-mono text-slate-500 mt-1 bg-slate-100/80 inline-block px-1.5 py-0.5 rounded">Month: {r.monthYear} · Days: {r.days} · Rate: {r.interest_rate}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Principal: ₹{(r.principal_amount || 0).toLocaleString()}</p>
                    <p className="font-semibold text-red-600 text-base">₹{r.interest_amount.toLocaleString()}</p>
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