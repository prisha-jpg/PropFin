import React, { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function CancellationRequestPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    sales_order_id: "",
    customer_id: "",
    customer_name: "",
    project_name: "",
    unit_number: "",
    request_date: new Date().toISOString().split("T")[0],
    reason: "",
    total_value: "",
    amount_received: "",
    remarks: "",
    other_recoverable_charges: "0",
  });

  const [settings, setSettings] = useState({
    cancellation_charge_percent: 0.5,
    cancellation_gst_rate: 18,
  });

  const [ledgerData, setLedgerData] = useState({
    loading: false,
    total_outstanding_balance: 0,
    total_receipts: 0,
    total_interest: 0,
    estimated_refund: 0,
    cancellation_charges: 0,
    cancellation_gst: 0,
    total_deduction: 0,
    agreement_value: 0,
  });

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/system-settings");
        if (res.ok) {
          const data = await res.json();
          setSettings({
            cancellation_charge_percent: data.cancellation_charge_percent ?? 0.5,
            cancellation_gst_rate: data.cancellation_gst_rate ?? 18,
          });
        }
      } catch (err) {
        console.warn("Failed to load settings:", err);
      }
    }
    loadSettings();
  }, []);

  const { data: orders = [] } = useQuery({ queryKey: ["salesOrders"], queryFn: () => apiClient.entities.SalesOrder.list("-created_date", 300) });

  const mutation = useMutation({
    mutationFn: (data) => apiClient.entities.CancellationRequest.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["cancellationRequests"] }); toast.success("Cancellation request submitted"); navigate("/cancellation/approved"); },
    onError: (error) => { toast.error(error?.response?.data?.message || error?.message || "This sales order has already been cancelled."); }
  });

  const pickOrder = async (orderId) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    setForm((prev) => ({
      ...prev,
      sales_order_id: order.id,
      customer_id: order.customer_id,
      customer_name: order.customer_name,
      project_name: order.project_name,
      unit_number: order.unit_number,
      total_value: String(order.agreement_value || order.total_value || 0),
      amount_received: String(order.amount_received || 0),
    }));

    setLedgerData((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch(`/api/pricing/ledger-summary/${order.id}`);
      if (res.ok) {
        const data = await res.json();
        setLedgerData({
          loading: false,
          total_outstanding_balance: Number(data.outstandingBalance || 0),
          total_receipts: Number(data.amountPaid || 0),
          total_interest: Number(data.totalInterest || 0),
          estimated_refund: Number(data.refundableAmount || 0),
          cancellation_charges: Number(data.cancellationCharges || 0),
          cancellation_gst: Number(data.gstOnCancellation || 0),
          total_deduction: Number(data.totalRecoveries || 0),
          agreement_value: Number(data.agreementValue || 0),
        });
      } else {
        setLedgerData((prev) => ({ ...prev, loading: false }));
      }
    } catch (err) {
      console.error("Error loading ledger details:", err);
      setLedgerData((prev) => ({ ...prev, loading: false }));
    }
  };

  const otherChargesVal = Number(form.other_recoverable_charges || 0);
  const cancellationFeeVal = Number(ledgerData.agreement_value || 0) * 0.005;
  const interestVal = Number(ledgerData.total_interest || 0);
  const totalRecoveriesVal = cancellationFeeVal + interestVal + otherChargesVal;
  const netPayableVal = Number(ledgerData.total_receipts || 0) - totalRecoveriesVal;

  const submit = () => {
    mutation.mutate({
      ...form,
      request_number: "CAN" + Date.now().toString(36).toUpperCase(),
      status: "pending",
      total_value: Number(form.total_value || 0),
      amount_received: ledgerData.total_receipts,
      admin_charges: cancellationFeeVal,
      other_recoverable_charges: otherChargesVal,
      deduction_amount: totalRecoveriesVal,
      refund_amount: netPayableVal,
      penalty_rate: 0.5,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Unit Cancellation" description="Request cancellation of a booked/allotted unit" />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="border-amber-200">
          <CardHeader><CardTitle className="text-base">Customer & Unit Snapshot</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Sales Order</Label>
              <Select value={form.sales_order_id} onValueChange={pickOrder}>
                <SelectTrigger><SelectValue placeholder="Search customer/unit" /></SelectTrigger>
                <SelectContent>{orders.map((o) => <SelectItem key={o.id} value={o.id}>{o.order_number} - {o.customer_name} ({o.unit_number})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Customer</p><p className="font-medium">{form.customer_name || "-"}</p></div>
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Unit</p><p className="font-medium">{form.unit_number || "-"}</p></div>
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Agreement Value</p><p className="font-medium">INR {Number(ledgerData.agreement_value || 0).toLocaleString()}</p></div>
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Amount Paid (Ledger)</p><p className="font-medium text-emerald-600">INR {ledgerData.total_receipts.toLocaleString()}</p></div>
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Accumulated Interest</p><p className="font-medium">INR {ledgerData.total_interest.toLocaleString()}</p></div>
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Total Recoveries</p><p className="font-medium text-amber-700">INR {totalRecoveriesVal.toLocaleString()}</p></div>
              <div className="rounded-md border p-3 col-span-2 bg-amber-50/50 border-amber-200">
                <p className="text-xs text-muted-foreground font-semibold text-amber-800">
                  {netPayableVal > 0 ? "Net Payable to Customer (Refund)" : netPayableVal < 0 ? "Net Payable by Customer (Owed)" : "No Amount Payable"}
                </p>
                <p className={`font-bold text-base ${netPayableVal >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  INR {Math.abs(netPayableVal).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="rounded-md bg-red-50 border border-red-200 p-3">
              <p className="text-xs text-red-700">Outstanding (Ledger Balance)</p>
              <p className="font-semibold text-red-700">
                INR {ledgerData.loading ? "Loading..." : ledgerData.total_outstanding_balance.toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base">Cancellation Form & Settlement Configuration</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Request Date</Label><Input type="date" value={form.request_date} onChange={(e) => setForm((p) => ({ ...p, request_date: e.target.value }))} /></div>
              <div className="space-y-1.5">
                <Label>Policy Configuration</Label>
                <div className="rounded-md bg-slate-50 border p-2 text-xs text-slate-600 space-y-1 font-mono">
                  <p>Agreement Cancellation Fee Rate: 0.5%</p>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Cancellation Reason</Label>
              <Select value={form.reason} onValueChange={(val) => setForm((p) => ({ ...p, reason: val }))}>
                <SelectTrigger><SelectValue placeholder="Select cancellation reason" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="financial">Financial Constraints</SelectItem>
                  <SelectItem value="personal">Personal Reasons</SelectItem>
                  <SelectItem value="project_delay">Project Delay</SelectItem>
                  <SelectItem value="quality">Construction Quality Issues</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Other Recoverable Charges (Maintenance, Documentation, Legal, etc.)</Label>
              <Input
                type="number"
                value={form.other_recoverable_charges}
                onChange={(e) => setForm((p) => ({ ...p, other_recoverable_charges: e.target.value }))}
                min="0"
                step="0.01"
                placeholder="Enter other recoverable charges"
                className="focus:ring-2 focus:ring-amber-500 font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Remarks / Detailed Description</Label>
              <Textarea value={form.remarks} onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))} rows={2} />
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">Live Settlement Preview</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 text-sm">
                <p>Total Amount Received: <span className="font-semibold text-emerald-700">INR {ledgerData.total_receipts.toLocaleString()}</span></p>
                <p>Cancellation Fee (0.5%): <span className="font-semibold">INR {cancellationFeeVal.toLocaleString()}</span></p>
                <p>Outstanding Interest: <span className="font-semibold">INR {interestVal.toLocaleString()}</span></p>
                <p>Other Recoverable Charges: <span className="font-semibold text-red-700">INR {otherChargesVal.toLocaleString()}</span></p>
                <p className="sm:col-span-2 border-t pt-2 border-amber-200 font-bold text-amber-950 flex justify-between items-center">
                  <span>
                    {netPayableVal > 0 ? "Net Payable to Customer (Refund):" : netPayableVal < 0 ? "Net Payable by Customer (Owed):" : "No Amount Payable:"}
                  </span>
                  <span className={netPayableVal >= 0 ? "text-emerald-800 text-base" : "text-rose-800 text-base"}>
                    INR {Math.abs(netPayableVal).toLocaleString()}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
              <Button onClick={submit} disabled={mutation.isPending || !form.sales_order_id || !form.reason}>Submit Cancellation</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}