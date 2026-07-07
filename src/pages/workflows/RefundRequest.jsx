import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import DataTable from "../../components/shared/DataTable";
import ApprovalWorkflow from "../../components/shared/ApprovalWorkflow";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { format } from "date-fns";
import { CheckCircle2, XCircle, Info, Landmark, ShieldAlert } from "lucide-react";

export default function RefundRequestPage() {
  const [form, setForm] = useState({
    sales_order_id: "",
    customer_id: "",
    customer_name: "",
    project_name: "",
    unit_number: "",
    request_date: new Date().toISOString().split("T")[0],
    refund_amount: "",
    reason: "cancellation",
    reason_details: "",
    bank_name: "",
    account_number: "",
    ifsc_code: "",
    account_holder_name: "",
    remarks: "",
  });

  const [financeOverride, setFinanceOverride] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  
  // Bank processing inputs
  const [utrNumber, setUtrNumber] = useState("");
  const [disbursementDate, setDisbursementDate] = useState(new Date().toISOString().split("T")[0]);

  const queryClient = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({ 
    queryKey: ["refundRequests"], 
    queryFn: () => apiClient.entities.RefundRequest.list("-created_date", 200) 
  });
  
  const { data: orders = [] } = useQuery({ 
    queryKey: ["salesOrders"], 
    queryFn: () => apiClient.entities.SalesOrder.list("-created_date", 300) 
  });

  const createMutation = useMutation({
    mutationFn: (data) => apiClient.entities.RefundRequest.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["refundRequests"] });
      queryClient.invalidateQueries({ queryKey: ["salesOrders"] });
      toast.success("Refund request submitted successfully!");
      // Reset form
      setForm({
        sales_order_id: "",
        customer_id: "",
        customer_name: "",
        project_name: "",
        unit_number: "",
        request_date: new Date().toISOString().split("T")[0],
        refund_amount: "",
        reason: "cancellation",
        reason_details: "",
        bank_name: "",
        account_number: "",
        ifsc_code: "",
        account_holder_name: "",
        remarks: "",
      });
      setFinanceOverride(false);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to submit request.");
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, payload }) => apiClient.entities.RefundRequest.update(id, payload),
    onSuccess: (updatedRecord) => {
      queryClient.invalidateQueries({ queryKey: ["refundRequests"] });
      queryClient.invalidateQueries({ queryKey: ["salesOrders"] });
      // Keep it selected but with updated fields
      setSelectedRequest(updatedRecord);
      setUtrNumber("");
      toast.success(`Refund status updated to ${updatedRecord.status.replace(/_/g, " ").toUpperCase()}`);
    },
    onError: (err) => {
      toast.error(err.message || "Action failed.");
    }
  });

  const [ledgerLoading, setLedgerLoading] = useState(false);

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
      refund_amount: "0",
    }));

    setLedgerLoading(true);
    try {
      const res = await fetch(`/api/pricing/ledger-summary/${order.id}`);
      if (res.ok) {
        const data = await res.json();
        setForm((prev) => ({
          ...prev,
          refund_amount: String(data.refundableAmount || 0)
        }));
      }
    } catch (err) {
      console.error("Failed to load refund amount from ledger:", err);
    } finally {
      setLedgerLoading(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    createMutation.mutate({
      ...form,
      request_number: "REF" + Date.now().toString(36).toUpperCase(),
      status: "pending",
      refund_amount: Number(form.refund_amount || 0),
    });
  };

  const handleStatusTransition = (status) => {
    if (!selectedRequest) return;
    const payload = { status };
    updateStatusMutation.mutate({ id: selectedRequest.id, payload });
  };

  const handleDisbursement = () => {
    if (!selectedRequest) return;
    if (!utrNumber.trim()) {
      toast.error("UTR / Payment Reference number is required for disbursement.");
      return;
    }
    const payload = {
      status: "disbursed",
      transaction_reference: utrNumber,
      disbursement_date: disbursementDate
    };
    updateStatusMutation.mutate({ id: selectedRequest.id, payload });
  };

  const getStatusIndex = (status) => {
    const sequence = ["pending", "finance_review", "management_approval", "bank_processing", "disbursed"];
    return sequence.indexOf(status);
  };

  const columns = [
    { header: "Request #", accessor: "request_number", cell: r => <span className="font-mono text-xs font-semibold">{r.request_number || "—"}</span> },
    { header: "Customer", accessor: "customer_name" },
    { header: "Project", accessor: "project_name" },
    { header: "Amount", accessor: "refund_amount", cell: r => <span className="font-bold text-slate-800">₹{(r.refund_amount || 0).toLocaleString()}</span> },
    { header: "Reason", accessor: "reason", cell: r => (r.reason || "—").replace(/_/g, " ") },
    { header: "Workflow", accessor: "status", cell: r => <ApprovalWorkflow status={r.status} /> },
    {
      header: "Action",
      cell: r => (
        <Button 
          variant={selectedRequest?.id === r.id ? "default" : "outline"} 
          size="xs" 
          onClick={() => {
            setSelectedRequest(r);
            setUtrNumber(r.transaction_reference || "");
          }}
        >
          Manage
        </Button>
      )
    }
  ];

  const currentStageIdx = selectedRequest ? getStatusIndex(selectedRequest.status) : -1;
  const stages = [
    { key: "pending", label: "Requested", desc: "Refund request submitted" },
    { key: "finance_review", label: "Finance Review", desc: "Audited by Finance team" },
    { key: "management_approval", label: "Management Approval", desc: "Approved by Management" },
    { key: "bank_processing", label: "Bank Processing", desc: "Disbursement in progress" },
    { key: "disbursed", label: "Disbursed", desc: "Paid out and account settled" }
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Refund Requests" description="Manage refund requests for cancelled/overpaid orders" />
      <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_0.9fr] gap-6">
        {/* Creation Form */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-bold">New Refund Request</CardTitle>
            <CardDescription>Initiate a customer payout against an approved cancellation</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-slate-700 font-semibold">Sales Order</Label>
                  <Select value={form.sales_order_id} onValueChange={pickOrder}>
                    <SelectTrigger className="border-slate-200">
                      <SelectValue placeholder="Select a cancelled sales order" />
                    </SelectTrigger>
                    <SelectContent>
                      {orders
                        .filter(o => o.status === "cancelled")
                        .map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.order_number} - {o.customer_name} ({o.unit_number})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-1.5">
                  <Label className="text-slate-700 font-semibold">Request Date</Label>
                  <Input type="date" value={form.request_date} onChange={(e) => setForm((p) => ({ ...p, request_date: e.target.value }))} className="border-slate-200" />
                </div>
                
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <Label className="text-slate-700 font-semibold">Refund Amount (INR)</Label>
                    <div className="flex items-center gap-1.5">
                      <Checkbox 
                        id="financeOverride" 
                        checked={financeOverride} 
                        onCheckedChange={(checked) => setFinanceOverride(!!checked)} 
                      />
                      <label htmlFor="financeOverride" className="text-[10px] text-amber-700 font-bold uppercase tracking-wider cursor-pointer flex items-center gap-0.5">
                        <ShieldAlert className="w-3.5 h-3.5" /> Override
                      </label>
                    </div>
                  </div>
                  <Input 
                    type="number" 
                    value={form.refund_amount} 
                    onChange={(e) => setForm((p) => ({ ...p, refund_amount: e.target.value }))} 
                    readOnly={!financeOverride} 
                    className={`font-semibold transition-colors ${
                      financeOverride 
                        ? "bg-white border-amber-300 text-amber-900 focus-visible:ring-amber-500" 
                        : "bg-slate-50 border-slate-200 text-emerald-700"
                    }`}
                    placeholder={ledgerLoading ? "Loading from ledger..." : "0"}
                    required 
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-slate-700 font-semibold">Reason</Label>
                  <Select value={form.reason} onValueChange={(v) => setForm((p) => ({ ...p, reason: v }))}>
                    <SelectTrigger className="border-slate-200"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cancellation">Cancellation</SelectItem>
                      <SelectItem value="overpayment">Overpayment</SelectItem>
                      <SelectItem value="scheme_change">Scheme Change</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-slate-700 font-semibold">Beneficiary Bank</Label>
                  <Input value={form.bank_name} onChange={(e) => setForm((p) => ({ ...p, bank_name: e.target.value }))} placeholder="e.g. ICICI Bank" className="border-slate-200" />
                </div>
                
                <div className="space-y-1.5">
                  <Label className="text-slate-700 font-semibold">Account Number</Label>
                  <Input value={form.account_number} onChange={(e) => setForm((p) => ({ ...p, account_number: e.target.value }))} placeholder="e.g. 501002934812" className="border-slate-200" />
                </div>
                
                <div className="space-y-1.5">
                  <Label className="text-slate-700 font-semibold">IFSC Code</Label>
                  <Input value={form.ifsc_code} onChange={(e) => setForm((p) => ({ ...p, ifsc_code: e.target.value }))} placeholder="e.g. ICIC0000007" className="border-slate-200" />
                </div>
                
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-slate-700 font-semibold">Account Holder Name</Label>
                  <Input value={form.account_holder_name} onChange={(e) => setForm((p) => ({ ...p, account_holder_name: e.target.value }))} placeholder="Must match bank record" className="border-slate-200" />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-slate-700 font-semibold">Detailed Reason</Label>
                  <Textarea value={form.reason_details} onChange={(e) => setForm((p) => ({ ...p, reason_details: e.target.value }))} placeholder="Provide internal notes for review..." rows={2} className="border-slate-200" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="submit" disabled={createMutation.isPending || !form.sales_order_id}>
                  Submit Refund Request
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Dynamic Workflow Journey & Action console */}
        <Card className="border-teal-200 shadow-sm bg-gradient-to-b from-white to-slate-50/50">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-800">
              <Landmark className="w-5 h-5 text-teal-600" /> Refund Approval Journey
            </CardTitle>
            <CardDescription>
              {selectedRequest 
                ? `Managing Request #${selectedRequest.request_number}` 
                : "Select a request from the table below to approve"}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-5">
            {!selectedRequest ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <Info className="w-6 h-6" />
                </div>
                <div className="max-w-[280px] mx-auto space-y-1">
                  <p className="text-sm font-semibold text-slate-700">No Request Selected</p>
                  <p className="text-xs text-slate-500">Click the "Manage" button on any list row below to configure status transitions, payment disbursements, and ledger postings.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Visual Stepper */}
                <div className="space-y-4">
                  {stages.map((stage, idx) => {
                    const isCompleted = idx < currentStageIdx || selectedRequest.status === "disbursed";
                    const isCurrent = idx === currentStageIdx;
                    
                    let iconBg = "bg-slate-100 text-slate-400 border-slate-200";
                    let lineBg = "bg-slate-200";
                    
                    if (isCompleted) {
                      iconBg = "bg-emerald-100 text-emerald-700 border-emerald-300";
                      lineBg = "bg-emerald-500";
                    } else if (isCurrent) {
                      iconBg = "bg-teal-600 text-white border-teal-700 shadow-sm shadow-teal-100";
                      lineBg = "bg-slate-300";
                    }

                    if (selectedRequest.status === "rejected" && idx === currentStageIdx) {
                      iconBg = "bg-red-100 text-red-700 border-red-300";
                    }

                    return (
                      <div key={stage.key} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold border ${iconBg}`}>
                            {isCompleted ? "✓" : idx + 1}
                          </div>
                          {idx < 4 && <div className={`w-0.5 h-8 ${lineBg} mt-1`} />}
                        </div>
                        <div className="pb-2">
                          <p className={`text-sm ${isCurrent ? "font-bold text-slate-900" : isCompleted ? "font-medium text-emerald-800" : "text-slate-500"}`}>
                            {stage.label}
                            {selectedRequest.status === "rejected" && isCurrent && " (REJECTED)"}
                          </p>
                          <p className="text-xs text-muted-foreground">{selectedRequest.status === "rejected" && isCurrent ? selectedRequest.rejection_reason || "Declined during review" : stage.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-slate-200 pt-4 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Approval Actions</h4>

                  {/* Pending state actions */}
                  {selectedRequest.status === "pending" && (
                    <div className="space-y-2">
                      <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => handleStatusTransition("finance_review")}>
                        Submit for Finance Review
                      </Button>
                      <Button className="w-full" variant="outline" onClick={() => {
                        const reason = prompt("Enter rejection reason:");
                        if (reason) updateStatusMutation.mutate({ id: selectedRequest.id, payload: { status: "rejected", rejection_reason: reason } });
                      }}>
                        Reject Request
                      </Button>
                    </div>
                  )}

                  {/* Finance Review state actions */}
                  {selectedRequest.status === "finance_review" && (
                    <div className="space-y-2">
                      <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={() => handleStatusTransition("management_approval")}>
                        Approve Payout Details
                      </Button>
                      <Button className="w-full" variant="outline" onClick={() => {
                        const reason = prompt("Enter rejection reason:");
                        if (reason) updateStatusMutation.mutate({ id: selectedRequest.id, payload: { status: "rejected", rejection_reason: reason } });
                      }}>
                        Reject Request
                      </Button>
                    </div>
                  )}

                  {/* Management Approval state actions */}
                  {selectedRequest.status === "management_approval" && (
                    <div className="space-y-2">
                      <Button className="w-full bg-teal-600 hover:bg-teal-700" onClick={() => handleStatusTransition("bank_processing")}>
                        Initiate Bank Disbursement
                      </Button>
                      <Button className="w-full" variant="outline" onClick={() => handleStatusTransition("rejected")}>
                        Reject Request
                      </Button>
                    </div>
                  )}

                  {/* Bank Processing state form */}
                  {selectedRequest.status === "bank_processing" && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-3">
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Enter Settlement Bank Details</p>
                      
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-slate-700">Bank UTR / Reference Number</Label>
                        <Input 
                          placeholder="e.g. UTR20260707..." 
                          value={utrNumber} 
                          onChange={(e) => setUtrNumber(e.target.value)}
                          className="bg-white border-slate-200"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-slate-700">Disbursement Date</Label>
                        <Input 
                          type="date"
                          value={disbursementDate} 
                          onChange={(e) => setDisbursementDate(e.target.value)}
                          className="bg-white border-slate-200"
                        />
                      </div>

                      <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={handleDisbursement} disabled={updateStatusMutation.isPending}>
                        Mark Disbursed & Settle Ledger
                      </Button>
                    </div>
                  )}

                  {/* Disbursed State */}
                  {selectedRequest.status === "disbursed" && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-2">
                      <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Settlement Completed
                      </div>
                      <div className="text-xs text-emerald-900 space-y-1 font-mono pt-1">
                        <div>UTR: {selectedRequest.transaction_reference}</div>
                        <div>JV Number: {selectedRequest.journal_voucher_no || "N/A"}</div>
                        <div>Paid On: {selectedRequest.disbursement_date ? format(new Date(selectedRequest.disbursement_date), "dd MMM yyyy") : format(new Date(), "dd MMM yyyy")}</div>
                      </div>
                    </div>
                  )}

                  {/* Rejected / Cancelled State */}
                  {["rejected", "cancelled"].includes(selectedRequest.status) && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                      <div className="flex items-center justify-center gap-2 text-red-800 font-bold text-sm">
                        <XCircle className="w-5 h-5 text-red-600" /> Request {selectedRequest.status.toUpperCase()}
                      </div>
                      {selectedRequest.rejection_reason && (
                        <p className="text-xs text-red-700 mt-1 font-medium">Reason: {selectedRequest.rejection_reason}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <DataTable columns={columns} data={requests} isLoading={isLoading} searchPlaceholder="Search refund requests..." />
    </div>
  );
}