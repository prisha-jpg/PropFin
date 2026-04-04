import React, { useState } from "react";
import PageHeader from "../../components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calculator } from "lucide-react";

export default function FPVCalculation() {
  const [form, setForm] = useState({ principal: "", rate: "12", years: "1", type: "future" });
  const [result, setResult] = useState(null);

  const calculate = () => {
    const p = Number(form.principal);
    const r = Number(form.rate) / 100;
    const n = Number(form.years);

    if (form.type === "future") {
      setResult({ label: "Future Value", value: p * Math.pow(1 + r, n) });
    } else {
      setResult({ label: "Present Value", value: p / Math.pow(1 + r, n) });
    }
  };

  return (
    <div>
      <PageHeader title="FPV Calculation" description="Future/Present Value calculation for sales orders" />
      <Card className="max-w-lg">
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Calculator className="w-4 h-4" /> FPV Calculator</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label>Principal Amount (₹)</Label>
              <Input type="number" value={form.principal} onChange={e => setForm(p => ({ ...p, principal: e.target.value }))} placeholder="Enter amount" />
            </div>
            <div className="space-y-1.5">
              <Label>Interest Rate (% p.a.)</Label>
              <Input type="number" value={form.rate} onChange={e => setForm(p => ({ ...p, rate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Period (Years)</Label>
              <Input type="number" value={form.years} onChange={e => setForm(p => ({ ...p, years: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant={form.type === "future" ? "default" : "outline"} onClick={() => setForm(p => ({ ...p, type: "future" }))}>Future Value</Button>
            <Button variant={form.type === "present" ? "default" : "outline"} onClick={() => setForm(p => ({ ...p, type: "present" }))}>Present Value</Button>
          </div>
          <Button className="w-full gap-2" onClick={calculate} disabled={!form.principal}><Calculator className="w-4 h-4" /> Calculate</Button>
          {result && (
            <div className="mt-4 p-4 bg-primary/5 rounded-lg border border-primary/20 text-center">
              <p className="text-xs text-muted-foreground">{result.label}</p>
              <p className="text-2xl font-bold text-primary">₹{Math.round(result.value).toLocaleString()}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}