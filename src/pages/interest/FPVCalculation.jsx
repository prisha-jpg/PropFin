import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calculator, Save } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const normalisePercent = (raw) => {
  const n = Number(raw ?? 0);
  return n > 0 && n <= 1 ? n * 100 : n;
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));

const getErrorMessage = (error) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Request failed";
};

export default function FPVCalculation() {
  const { toast } = useToast();

  const [form, setForm] = useState({
    lienName: "",
    salesOrderId: "",
    computationDate: "",
    bookingDate: "",
    lateInterestRate: "",
    agreementValue: "",
    computeBasis: "due_date",
    discountType: "payment_before_due",
  });

  const [selectedLienId, setSelectedLienId] = useState("");
  const [error, setError] = useState("");
  const [calculationSummary, setCalculationSummary] = useState(null);
  const [dueSchedule, setDueSchedule] = useState([]);
  const [payments, setPayments] = useState([{ id: "pay-1", description: "", date: "", amount: "", source: "manual" }]);
  const [isLoading, setIsLoading] = useState(false);

  const { data: salesOrders = [] } = useQuery({
    queryKey: ["salesOrders"],
    queryFn: () => apiClient.entities.SalesOrder.list("-created_date", 500),
  });

  const { data: savedFpvData, refetch: refetchSavedFpv } = useQuery({
    queryKey: ["saved-fpv", selectedLienId],
    queryFn: () => apiClient.get(`/pricing/fpv-calculation/${selectedLienId}`),
    enabled: !!selectedLienId,
  });

  useEffect(() => {
    if (!selectedLienId) {
      setDueSchedule([]);
      setPayments([{ id: "pay-1", description: "", date: "", amount: "", source: "manual" }]);
      setCalculationSummary(null);
      setError("");
      return;
    }

    const loadWorkflow = async () => {
      setIsLoading(true);
      try {
        const workflow = await apiClient.get(`/pricing/customer-schedule/${selectedLienId}`);
        const order = workflow.sales_order || {};
        const agreementValue = Number(order.basic_sale_value ?? order.agreement_value ?? order.total_value ?? 0);

        setForm((prev) => ({
          ...prev,
          salesOrderId: selectedLienId,
          bookingDate: workflow.booking_date ? workflow.booking_date.split("T")[0] : prev.bookingDate,
          lateInterestRate: prev.lateInterestRate || String(workflow.interest_rate ?? ""),
          agreementValue: agreementValue > 0 ? String(agreementValue) : prev.agreementValue,
        }));

        const dueDetails = Array.isArray(workflow.due_schedule) ? workflow.due_schedule : [];
        setDueSchedule(
          dueDetails.map((row, index) => ({
            id: row.id || `due-${index + 1}`,
            name: row.description || row.milestone_name || row.name || "",
            percent: String(normalisePercent(row.allocation_percent ?? row.percent ?? 0)),
            dueDate: row.due_date || row.dueDate || "",
            rowAmount: Number(row.due_amount || row.rowAmount || 0),
            source: row.source || (index < 2 ? "Customer" : "Presales"),
          }))
        );

        const persistedPayments = Array.isArray(workflow.existing_receipts) && workflow.existing_receipts.length
          ? workflow.existing_receipts
          : [];

        setPayments(
          persistedPayments.length
            ? persistedPayments.map((payment, idx) => ({
                id: payment.id || `pay-${idx + 1}`,
                description: payment.description || payment.reference || payment.receipt_number || "",
                date: payment.date || payment.paymentDate || payment.payment_date || "",
                amount: String(payment.amount || payment.amountNum || ""),
                source: payment.source || "ledger",
              }))
            : [{ id: "pay-1", description: "", date: "", amount: "", source: "manual" }]
        );

        if (workflow.summary) {
          setCalculationSummary({
            totalDue: Number(workflow.summary.total_due_amount || 0),
            totalPaid: Number(workflow.summary.total_paid_amount || 0),
            totalDiscount: Number(workflow.summary.total_discount || 0),
            totalLateInterest: Number(workflow.summary.total_late_interest || 0),
            outstanding: Number(workflow.summary.outstanding_amount || 0),
            netAdjustment: Number(workflow.summary.net_adjustment || 0),
            allocations: workflow.allocations || [],
            summary: workflow.summary,
          });
        } else {
          setCalculationSummary(null);
        }
        setError("");
      } catch (err) {
        setError(getErrorMessage(err));
        setCalculationSummary(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadWorkflow();
  }, [selectedLienId]);

  useEffect(() => {
    if (!selectedLienId || !form.computationDate || !form.agreementValue || !dueSchedule.length) {
      setCalculationSummary(null);
      return;
    }

    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      try {
        const paymentRows = payments
          .filter((row) => Number(row.amount || 0) > 0)
          .map((row) => ({
            id: row.id,
            reference: row.description,
            payment_date: row.date,
            amount: Number(row.amount || 0),
          }));

        const response = await apiClient.post("/pricing/calculate-fpv", {
          sales_order_id: selectedLienId,
          agreement_value: Number(form.agreementValue || 0),
          basic_sale_value: Number(form.agreementValue || 0),
          base_value: Number(form.agreementValue || 0),
          computation_date: form.computationDate,
          interest_rate: form.lateInterestRate ? Number(form.lateInterestRate) : 0,
          discount_type: form.discountType,
          due_schedule: dueSchedule.map((row, index) => ({
            id: row.id,
            description: row.name,
            allocation_percent: Number(row.percent || 0),
            due_date: row.dueDate,
            due_amount: Number(row.rowAmount || 0),
            source: row.source,
            sequence: index + 1,
            milestone_type: index < 2 ? "Customer" : "Presales",
          })),
          payments: paymentRows,
        });

        setCalculationSummary({
          totalDue: Number(response.totals?.total_due_amount || 0),
          totalPaid: Number(response.totals?.total_paid_amount || 0),
          totalDiscount: Number(response.totals?.total_discount || 0),
          totalLateInterest: Number(response.totals?.total_late_interest || 0),
          outstanding: Number(response.totals?.outstanding_amount || 0),
          netAdjustment: Number(response.totals?.net_adjustment || 0),
          allocations: response.allocations || [],
          summary: {
            total_milestones: dueSchedule.length,
            total_allocation: dueSchedule.reduce((sum, row) => sum + Number(normalisePercent(row.percent || 0)), 0),
            total_due_amount: Number(response.totals?.total_due_amount || 0),
            total_paid_amount: Number(response.totals?.total_paid_amount || 0),
            total_discount: Number(response.totals?.total_discount || 0),
            total_late_interest: Number(response.totals?.total_late_interest || 0),
            outstanding_amount: Number(response.totals?.outstanding_amount || 0),
            net_adjustment: Number(response.totals?.net_adjustment || 0),
          },
        });
        setError("");
      } catch (err) {
        setError(getErrorMessage(err));
        setCalculationSummary(null);
      } finally {
        setIsLoading(false);
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [selectedLienId, form.computationDate, form.lateInterestRate, form.discountType, dueSchedule, payments, form.agreementValue]);

  const handlePaymentChange = (id, field, value) => {
    setPayments((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const handleAddPayment = () => {
    setPayments((prev) => [...prev, { id: `pay-${Date.now()}`, description: "", date: "", amount: "", source: "manual" }]);
  };

  const handleRemovePayment = (id) => {
    setPayments((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== id) : prev));
  };

  const totalSchedulePct = useMemo(
    () => dueSchedule.reduce((sum, row) => sum + Number(normalisePercent(row.percent || 0)), 0),
    [dueSchedule]
  );

  const totalDueAmount = useMemo(
    () => dueSchedule.reduce((sum, row) => sum + Number(row.rowAmount || 0), 0),
    [dueSchedule]
  );

  const totalPayments = useMemo(
    () => payments.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [payments]
  );

  const handleSaveFpv = async () => {
    if (!selectedLienId) return;
    const order = salesOrders.find((o) => o.id === selectedLienId);
    if (!order) return;

    const payload = {
      sales_order_id: selectedLienId,
      customer_id: order.customer_id,
      calculation_date: form.computationDate ? new Date(form.computationDate) : new Date(),
      interest_rate: form.lateInterestRate ? Number(form.lateInterestRate) : null,
      total_agreement_value: form.agreementValue ? Number(form.agreementValue) : null,
      discount_on_upfront: calculationSummary ? Number(calculationSummary.totalDiscount) : 0,
      interest_on_late_payment: calculationSummary ? Number(calculationSummary.totalLateInterest) : 0,
      net_fpv: calculationSummary ? Number(calculationSummary.netAdjustment) : null,
      schedule_details: dueSchedule.map((row, index) => ({
        id: row.id,
        name: row.name,
        percent: Number(normalisePercent(row.percent || 0)) || 0,
        dueDate: row.dueDate,
        rowAmount: row.rowAmount,
        source: row.source,
        sequence: index + 1,
      })),
      payment_details: payments.map((row) => ({
        id: row.id,
        reference: row.description,
        paymentDate: row.date,
        amount: row.amount,
      })),
    };

    try {
      await apiClient.post("/pricing/fpv-calculation", payload);
      toast({ title: "Saved!", description: "FPV calculation saved successfully." });
      refetchSavedFpv();
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast({ title: "Save Failed", description: message, variant: "destructive" });
    }
  };

  return (
    <div>
      <PageHeader
        title="Discount on Upfront Payment / Interest on Late Payment"
        description="Backend-driven FPV computation with database-backed milestones and FIFO payment allocation"
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Calculator className="w-4 h-4" /> FPV and Interest Calculator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label>Lien Name</Label>
              <Select
                value={selectedLienId}
                onValueChange={(value) => {
                  const order = salesOrders.find((o) => o.id === value);
                  const agreementValue = Number(order?.agreement_value ?? order?.total_value ?? order?.basic_sale_value ?? 0);
                  setSelectedLienId(value);
                  setForm((prev) => ({
                    ...prev,
                    salesOrderId: value,
                    lienName: order?.customer_name || order?.order_number || "",
                    agreementValue: agreementValue > 0 ? String(agreementValue) : "",
                    bookingDate: order?.booking_date ? order.booking_date.split("T")[0] : "",
                  }));
                  setError("");
                  setCalculationSummary(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select sales order…" />
                </SelectTrigger>
                <SelectContent>
                  {salesOrders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.customer_name || o.order_number} — {o.order_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date of Discount Computation</Label>
              <Input
                type="date"
                value={form.computationDate}
                onChange={(e) => setForm((prev) => ({ ...prev, computationDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Date of Booking</Label>
              <Input
                type="date"
                value={form.bookingDate}
                readOnly
                className="bg-muted/50 cursor-not-allowed"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rate of Interest on Late Payment (% p.a.)</Label>
              <Input
                type="number"
                value={form.lateInterestRate}
                onChange={(e) => setForm((prev) => ({ ...prev, lateInterestRate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Agreement Value After Discount (₹)</Label>
              <Input
                type="number"
                value={form.agreementValue}
                readOnly
                className="bg-muted/50 cursor-not-allowed"
                placeholder="Auto-filled from sales order"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Compute Method</Label>
              <Select value={form.computeBasis} onValueChange={(value) => setForm((prev) => ({ ...prev, computeBasis: value }))}>
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
              <Label>Discount Type</Label>
              <Select value={form.discountType} onValueChange={(value) => setForm((prev) => ({ ...prev, discountType: value }))}>
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
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Due Details</h3>
                {isLoading ? <span className="text-xs text-slate-500">Loading schedule…</span> : null}
              </div>

              <div className="rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                <div className="max-h-[460px] overflow-y-auto overflow-x-auto relative">
                  <Table className="w-full border-collapse">
                    <TableHeader className="bg-slate-50/75 sticky top-0 z-20 backdrop-blur-sm border-b shadow-[0_1px_0_rgba(0,0,0,0.05)]">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-[45px] text-center font-bold text-slate-700 py-2.5">#</TableHead>
                        <TableHead className="min-w-[220px] font-bold text-slate-700 py-2.5">Milestone</TableHead>
                        <TableHead className="w-[100px] text-center font-bold text-slate-700 py-2.5">Allocation %</TableHead>
                        <TableHead className="w-[140px] font-bold text-slate-700 py-2.5">Due Date</TableHead>
                        <TableHead className="w-[120px] text-right font-bold text-slate-700 py-2.5">Due Amount</TableHead>
                        <TableHead className="w-[100px] text-center font-bold text-slate-700 py-2.5">Source</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dueSchedule.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-6 text-center text-sm text-slate-500">
                            Select a lien to load the backend schedule.
                          </TableCell>
                        </TableRow>
                      ) : (
                        dueSchedule.map((row, index) => (
                          <TableRow key={row.id} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/30">
                            <TableCell className="text-center font-medium text-slate-400 py-2">{index + 1}</TableCell>
                            <TableCell className="py-2 pr-2 text-sm font-medium text-slate-800">{row.name || "-"}</TableCell>
                            <TableCell className="py-2 text-center text-sm font-semibold text-slate-800">{Number(normalisePercent(row.percent || 0)).toFixed(1)}%</TableCell>
                            <TableCell className="py-2 text-sm text-slate-700">{row.dueDate || "-"}</TableCell>
                            <TableCell className="py-2 text-right font-mono text-slate-800 font-semibold pr-4">₹{Number(row.rowAmount || 0).toLocaleString()}</TableCell>
                            <TableCell className="py-2 text-center">
                              <Badge variant={row.source === "Customer" ? "secondary" : "outline"} className="text-[10px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded border shadow-none">
                                {row.source || "Presales"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-2 text-slate-700 shadow-inner">
                <div className="flex justify-between items-center text-xs font-medium pb-2 border-b border-slate-200">
                  <span className="text-slate-500 uppercase tracking-wide">Financial Worksheet Summary</span>
                  <span className="font-mono text-slate-400">{isLoading ? "Recalculating…" : "Auto-updating"}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm pt-1">
                  <div>
                    <span className="text-xs text-slate-400 block font-semibold uppercase tracking-wider">Total Milestones</span>
                    <span className="text-lg font-bold text-slate-800">{dueSchedule.length}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block font-semibold uppercase tracking-wider">Total Allocation</span>
                    <span className={`text-lg font-bold ${totalSchedulePct === 100 ? "text-emerald-600" : "text-amber-600"}`}>{totalSchedulePct.toFixed(1)}%</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block font-semibold uppercase tracking-wider">Total Due Amount</span>
                    <span className="text-lg font-bold text-slate-800">₹{formatCurrency(totalDueAmount)}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block font-semibold uppercase tracking-wider">Total Payments</span>
                    <span className="text-lg font-bold text-slate-800">₹{formatCurrency(calculationSummary?.totalPaid ?? totalPayments)}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm pt-2 border-t border-slate-200/80">
                  <div>
                    <span className="text-xs text-slate-400 block font-semibold uppercase tracking-wider">Outstanding</span>
                    <span className="text-base font-bold text-slate-800">₹{formatCurrency(calculationSummary?.outstanding ?? Math.max(totalDueAmount - totalPayments, 0))}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block font-semibold uppercase tracking-wider">Discount</span>
                    <span className="text-base font-bold text-emerald-700">₹{formatCurrency(calculationSummary?.totalDiscount ?? 0)}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block font-semibold uppercase tracking-wider">Late Interest</span>
                    <span className="text-base font-bold text-amber-700">₹{formatCurrency(calculationSummary?.totalLateInterest ?? 0)}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block font-semibold uppercase tracking-wider">Net Adjustment</span>
                    <span className="text-base font-bold text-primary">₹{formatCurrency(calculationSummary?.netAdjustment ?? 0)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Payment Details</h3>
              <p className="text-xs text-slate-500">Each payment row is allocated to the earliest outstanding milestone using FIFO and recalculated automatically.</p>
              <div className="space-y-2">
                {payments.map((row) => (
                  <div key={row.id} className="grid grid-cols-1 md:grid-cols-12 gap-2">
                    <Input
                      className="md:col-span-4"
                      value={row.description}
                      onChange={(e) => handlePaymentChange(row.id, "description", e.target.value)}
                      placeholder="Description / Cheque"
                      disabled={!selectedLienId || row.source === "ledger"}
                    />
                    <Input
                      className="md:col-span-4"
                      type="date"
                      value={row.date}
                      onChange={(e) => handlePaymentChange(row.id, "date", e.target.value)}
                      disabled={!selectedLienId || row.source === "ledger"}
                    />
                    <Input
                      className="md:col-span-3"
                      type="number"
                      value={row.amount}
                      onChange={(e) => handlePaymentChange(row.id, "amount", e.target.value)}
                      placeholder="Amount"
                      disabled={!selectedLienId || row.source === "ledger"}
                    />
                    {row.source === "ledger" ? (
                      <div className="md:col-span-1 flex items-center justify-center text-[10px] font-semibold uppercase text-slate-500">
                        Ledger
                      </div>
                    ) : (
                      <Button type="button" variant="outline" className="md:col-span-1" onClick={() => handleRemovePayment(row.id)} disabled={!selectedLienId}>
                        ×
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" onClick={handleAddPayment} disabled={!selectedLienId}>
                Add Payment Row
              </Button>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 gap-2 border-primary text-primary hover:bg-primary/5"
              onClick={handleSaveFpv}
              disabled={!selectedLienId || !form.agreementValue || isLoading}
            >
              <Save className="w-4 h-4" /> Save FPV Calculation
            </Button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="text-xs text-muted-foreground border rounded-md p-3 bg-muted/20">
            Formula used: <strong>Simple Interest (Actual/365)</strong>. <br />
            Early payment discount = Allocated Amount × Interest Rate × Early Days / 365. <br />
            Late payment interest = Allocated Amount × Interest Rate × Late Days / 365.
          </div>

          {calculationSummary && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg border bg-muted/20">
                  <p className="text-xs text-muted-foreground">Total Due</p>
                  <p className="text-lg font-semibold">₹{formatCurrency(calculationSummary.totalDue)}</p>
                </div>
                <div className="p-3 rounded-lg border bg-muted/20">
                  <p className="text-xs text-muted-foreground">Total Paid</p>
                  <p className="text-lg font-semibold">₹{formatCurrency(calculationSummary.totalPaid)}</p>
                </div>
                <div className="p-3 rounded-lg border bg-emerald-50 border-emerald-200">
                  <p className="text-xs text-muted-foreground">Upfront Discount</p>
                  <p className="text-lg font-semibold text-emerald-700">₹{formatCurrency(calculationSummary.totalDiscount)}</p>
                </div>
                <div className="p-3 rounded-lg border bg-amber-50 border-amber-200">
                  <p className="text-xs text-muted-foreground">Late Interest</p>
                  <p className="text-lg font-semibold text-amber-700">₹{formatCurrency(calculationSummary.totalLateInterest)}</p>
                </div>
              </div>

              <div className="p-4 rounded-lg border bg-primary/5">
                <p className="text-xs text-muted-foreground">Net Adjustment (Interest - Discount)</p>
                <p className="text-2xl font-bold text-primary">₹{formatCurrency(calculationSummary.netAdjustment)}</p>
              </div>

              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="text-left p-2">Payment Ref</th>
                      <th className="text-left p-2">Payment Date</th>
                      <th className="text-left p-2">Milestone</th>
                      <th className="text-right p-2">Allocated</th>
                      <th className="text-right p-2">Days</th>
                      <th className="text-right p-2">Adjustment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculationSummary.allocations.map((row) => (
                      <tr key={`${row.payment_id}-${row.milestone_id}`} className="border-t">
                        <td className="p-2">{row.reference || "-"}</td>
                        <td className="p-2">{row.payment_date || "-"}</td>
                        <td className="p-2">{row.milestone_description || "-"}</td>
                        <td className="p-2 text-right">₹{formatCurrency(row.allocated_amount || 0)}</td>
                        <td className="p-2 text-right">{row.days_delta || 0}</td>
                        <td className="p-2 text-right">₹{formatCurrency(row.adjustment || 0)}</td>
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