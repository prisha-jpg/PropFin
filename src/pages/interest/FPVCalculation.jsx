import React, { useMemo, useState } from "react";
import PageHeader from "../../components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calculator } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function FPVCalculation() {
  const [form, setForm] = useState({
    lienName: "",
    computationDate: "",
    bookingDate: "",
    discountRate: "",
    lateInterestRate: "",
    agreementValue: "",
    computeBasis: "due_date",
    discountType: "payment_before_due",
  });
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [schedules, setSchedules] = useState([
    { id: "due-1", name: "", percent: "", dueDate: "" },
  ]);
  const [payments, setPayments] = useState([
    { id: "pay-1", reference: "", paymentDate: "", amount: "" },
  ]);

  const setScheduleField = (id, field, value) => {
    setSchedules((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const setPaymentField = (id, field, value) => {
    setPayments((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const addScheduleRow = () => {
    setSchedules((prev) => [...prev, { id: `due-${Date.now()}`, name: "", percent: "", dueDate: "" }]);
  };

  const removeScheduleRow = (id) => {
    setSchedules((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== id) : prev));
  };

  const addPaymentRow = () => {
    setPayments((prev) => [...prev, { id: `pay-${Date.now()}`, reference: "", paymentDate: "", amount: "" }]);
  };

  const removePaymentRow = (id) => {
    setPayments((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== id) : prev));
  };

  const toDate = (value) => (value ? new Date(`${value}T00:00:00`) : null);
  const dayDiff = (a, b) => Math.round((a - b) / (1000 * 60 * 60 * 24));

  const calculate = () => {
    setError("");
    const agreementValue = Number(form.agreementValue || 0);
    const discountRate = Number(form.discountRate || 0) / 100;
    const lateInterestRate = Number(form.lateInterestRate || 0) / 100;
    const computationDate = toDate(form.computationDate);
    const bookingDate = toDate(form.bookingDate);

    if (agreementValue <= 0) {
      setError("Agreement value must be greater than 0.");
      setResult(null);
      return;
    }
    if (discountRate < 0 || lateInterestRate < 0) {
      setError("Rates cannot be negative.");
      setResult(null);
      return;
    }

    const dueRows = schedules
      .map((row) => ({
        ...row,
        dueAmount: (agreementValue * Number(row.percent || 0)) / 100,
        dueDateObj: toDate(row.dueDate),
        remaining: (agreementValue * Number(row.percent || 0)) / 100,
      }))
      .filter((row) => row.dueAmount > 0);

    if (!dueRows.length) {
      setError("Add at least one due schedule with a valid percentage.");
      setResult(null);
      return;
    }

    const paymentRows = payments
      .map((row) => ({
        ...row,
        amountNum: Number(row.amount || 0),
        paymentDateObj: toDate(row.paymentDate),
      }))
      .filter((row) => row.amountNum > 0 && row.paymentDateObj);

    if (!paymentRows.length) {
      setError("Add at least one payment with date and amount.");
      setResult(null);
      return;
    }

    paymentRows.sort((a, b) => a.paymentDateObj - b.paymentDateObj);
    dueRows.sort((a, b) => {
      if (!a.dueDateObj && !b.dueDateObj) return 0;
      if (!a.dueDateObj) return 1;
      if (!b.dueDateObj) return -1;
      return a.dueDateObj - b.dueDateObj;
    });

    let totalDiscount = 0;
    let totalLateInterest = 0;
    const paymentBreakdown = [];

    for (const payment of paymentRows) {
      let pendingPayment = payment.amountNum;
      let paymentDiscount = 0;
      let paymentLateInterest = 0;

      for (const due of dueRows) {
        if (pendingPayment <= 0 || due.remaining <= 0) continue;
        const allocated = Math.min(pendingPayment, due.remaining);
        due.remaining -= allocated;
        pendingPayment -= allocated;

        const basisDate =
          form.discountType === "payment_before_agreement"
            ? bookingDate
            : form.computeBasis === "computation_date"
              ? computationDate
              : due.dueDateObj || computationDate;
        if (!basisDate) continue;

        const days = dayDiff(payment.paymentDateObj, basisDate);
        if (days < 0) {
          const discount = allocated * discountRate * (Math.abs(days) / 365);
          paymentDiscount += discount;
          totalDiscount += discount;
        } else if (days > 0) {
          const interest = allocated * lateInterestRate * (days / 365);
          paymentLateInterest += interest;
          totalLateInterest += interest;
        }
      }

      paymentBreakdown.push({
        ...payment,
        discount: paymentDiscount,
        interest: paymentLateInterest,
      });
    }

    const totalDue = dueRows.reduce((sum, row) => sum + row.dueAmount, 0);
    const totalPaid = paymentRows.reduce((sum, row) => sum + row.amountNum, 0);
    const netAdjustment = totalLateInterest - totalDiscount;

    setResult({
      dueRows,
      paymentBreakdown,
      totalDue,
      totalPaid,
      totalDiscount,
      totalLateInterest,
      netAdjustment,
      adjustedPayable: Math.max(totalDue + netAdjustment, 0),
    });
  };

  const totalSchedulePct = useMemo(
    () => schedules.reduce((sum, row) => sum + Number(row.percent || 0), 0),
    [schedules]
  );

  return (
    <div>
      <PageHeader
        title="Discount on Upfront Payment / Interest on Late Payment"
        description="Sheet-style FPV computation using schedule due dates and payment dates"
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Calculator className="w-4 h-4" /> FPV and Interest Calculator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Lien Name</Label>
              <Input value={form.lienName} onChange={(e) => setForm((p) => ({ ...p, lienName: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Date of Discount Computation</Label>
              <Input
                type="date"
                value={form.computationDate}
                onChange={(e) => setForm((p) => ({ ...p, computationDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Date of Booking</Label>
              <Input
                type="date"
                value={form.bookingDate}
                onChange={(e) => setForm((p) => ({ ...p, bookingDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rate of Discount Applicable (% p.a.)</Label>
              <Input
                type="number"
                value={form.discountRate}
                onChange={(e) => setForm((p) => ({ ...p, discountRate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rate of Interest on Late Payment (% p.a.)</Label>
              <Input
                type="number"
                value={form.lateInterestRate}
                onChange={(e) => setForm((p) => ({ ...p, lateInterestRate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Agreement Value Before Discount (₹)</Label>
              <Input
                type="number"
                value={form.agreementValue}
                onChange={(e) => setForm((p) => ({ ...p, agreementValue: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Compute Discount and Interest</Label>
              <Select value={form.computeBasis} onValueChange={(value) => setForm((p) => ({ ...p, computeBasis: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="due_date">Due Date Wise</SelectItem>
                  <SelectItem value="computation_date">Computation Date Wise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Type of Discount</Label>
              <Select value={form.discountType} onValueChange={(value) => setForm((p) => ({ ...p, discountType: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="payment_before_due">Payment Before Due Date</SelectItem>
                  <SelectItem value="payment_before_agreement">Payment Before Agreement</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Due Details</h3>
              <div className="space-y-2">
                {schedules.map((row) => (
                  <div key={row.id} className="grid grid-cols-12 gap-2">
                    <Input
                      className="col-span-4"
                      value={row.name}
                      onChange={(e) => setScheduleField(row.id, "name", e.target.value)}
                      placeholder="Schedule"
                    />
                    <Input
                      className="col-span-2"
                      type="number"
                      value={row.percent}
                      onChange={(e) => setScheduleField(row.id, "percent", e.target.value)}
                      placeholder="%"
                    />
                    <Input
                      className="col-span-3"
                      type="date"
                      value={row.dueDate}
                      onChange={(e) => setScheduleField(row.id, "dueDate", e.target.value)}
                    />
                    <Input
                      className="col-span-3"
                      value={`₹${Math.round((Number(form.agreementValue || 0) * Number(row.percent || 0)) / 100).toLocaleString()}`}
                      readOnly
                    />
                    <Button type="button" variant="outline" className="col-span-12 md:col-span-2" onClick={() => removeScheduleRow(row.id)}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" onClick={addScheduleRow}>
                Add Due Row
              </Button>
              <p className={`text-xs ${totalSchedulePct === 100 ? "text-emerald-600" : "text-amber-600"}`}>
                Total Schedule %: {totalSchedulePct.toFixed(2)}%
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Payment Details</h3>
              <div className="space-y-2">
                {payments.map((row) => (
                  <div key={row.id} className="grid grid-cols-12 gap-2">
                    <Input
                      className="col-span-4"
                      value={row.reference}
                      onChange={(e) => setPaymentField(row.id, "reference", e.target.value)}
                      placeholder="Description/Cheque"
                    />
                    <Input
                      className="col-span-4"
                      type="date"
                      value={row.paymentDate}
                      onChange={(e) => setPaymentField(row.id, "paymentDate", e.target.value)}
                    />
                    <Input
                      className="col-span-4"
                      type="number"
                      value={row.amount}
                      onChange={(e) => setPaymentField(row.id, "amount", e.target.value)}
                      placeholder="Amount"
                    />
                    <Button type="button" variant="outline" className="col-span-12 md:col-span-2" onClick={() => removePaymentRow(row.id)}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" onClick={addPaymentRow}>
                Add Payment Row
              </Button>
            </div>
          </div>

          <Button className="w-full gap-2" onClick={calculate} disabled={!form.agreementValue}>
            <Calculator className="w-4 h-4" /> Compute
          </Button>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="text-xs text-muted-foreground border rounded-md p-3 bg-muted/20">
            Formula used: <strong>Simple Interest (Actual/365)</strong>. <br />
            Early payment discount = Allocated Amount × Discount Rate × Early Days / 365. <br />
            Late payment interest = Allocated Amount × Late Interest Rate × Delay Days / 365.
          </div>

          {result && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg border bg-muted/20">
                  <p className="text-xs text-muted-foreground">Total Due</p>
                  <p className="text-lg font-semibold">₹{Math.round(result.totalDue).toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-lg border bg-muted/20">
                  <p className="text-xs text-muted-foreground">Total Paid</p>
                  <p className="text-lg font-semibold">₹{Math.round(result.totalPaid).toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-lg border bg-emerald-50 border-emerald-200">
                  <p className="text-xs text-muted-foreground">Upfront Discount</p>
                  <p className="text-lg font-semibold text-emerald-700">₹{Math.round(result.totalDiscount).toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-lg border bg-amber-50 border-amber-200">
                  <p className="text-xs text-muted-foreground">Late Interest</p>
                  <p className="text-lg font-semibold text-amber-700">₹{Math.round(result.totalLateInterest).toLocaleString()}</p>
                </div>
              </div>

              <div className="p-4 rounded-lg border bg-primary/5">
                <p className="text-xs text-muted-foreground">Net Adjustment (Interest - Discount)</p>
                <p className="text-2xl font-bold text-primary">₹{Math.round(result.netAdjustment).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Adjusted Payable: ₹{Math.round(result.adjustedPayable).toLocaleString()}
                </p>
              </div>

              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="text-left p-2">Payment Ref</th>
                      <th className="text-left p-2">Payment Date</th>
                      <th className="text-right p-2">Amount</th>
                      <th className="text-right p-2">Discount</th>
                      <th className="text-right p-2">Late Interest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.paymentBreakdown.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="p-2">{row.reference || "-"}</td>
                        <td className="p-2">{row.paymentDate || "-"}</td>
                        <td className="p-2 text-right">₹{Math.round(row.amountNum).toLocaleString()}</td>
                        <td className="p-2 text-right text-emerald-700">₹{Math.round(row.discount).toLocaleString()}</td>
                        <td className="p-2 text-right text-amber-700">₹{Math.round(row.interest).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}