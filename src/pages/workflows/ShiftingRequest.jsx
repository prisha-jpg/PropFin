import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../../components/shared/PageHeader";
import DataTable from "../../components/shared/DataTable";
import StatusBadge from "../../components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  FileText,
  User,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Activity,
  CheckCircle2,
  XCircle,
  Printer,
  Eye,
  Search,
  Filter
} from "lucide-react";

export default function ShiftingRequestPage() {
  const queryClient = useQueryClient();

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL"); // ALL, UPGRADE, DOWNGRADE, EQUAL

  // Form state
  const [form, setForm] = useState({
    sales_order_id: "",
    to_unit_id: "",
    reason: "",
  });

  // Selected entities for display
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedDestProject, setSelectedDestProject] = useState("");
  const [selectedUnit, setSelectedUnit] = useState(null);

  // View details modal
  const [viewingRequest, setViewingRequest] = useState(null);

  // Rejection modal
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);

  // Queries
  const { data: eligibleOrders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["shiftOrders"],
    queryFn: async () => {
      const token = localStorage.getItem("token") || "";
      const res = await fetch("/api/shift/orders", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to load eligible sales orders.");
      return res.json();
    }
  });

  const { data: availableUnits = [], isLoading: unitsLoading } = useQuery({
    queryKey: ["availableUnits"],
    queryFn: async () => {
      const token = localStorage.getItem("token") || "";
      const res = await fetch("/api/shift/available-units", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to load available units.");
      return res.json();
    }
  });

  const { data: requests = [], isLoading: historyLoading } = useQuery({
    queryKey: ["shiftHistory"],
    queryFn: async () => {
      const token = localStorage.getItem("token") || "";
      const res = await fetch("/api/shift/history", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to load shifting request history.");
      return res.json();
    }
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (payload) => {
      const token = localStorage.getItem("token") || "";
      const res = await fetch("/api/shift/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create request");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shiftHistory"] });
      queryClient.invalidateQueries({ queryKey: ["shiftOrders"] });
      queryClient.invalidateQueries({ queryKey: ["availableUnits"] });
      queryClient.invalidateQueries({ queryKey: ["salesOrders"] });
      toast.success("Shifting request submitted successfully.");
      setForm({ sales_order_id: "", to_unit_id: "", reason: "" });
      setSelectedOrder(null);
      setSelectedDestProject("");
      setSelectedUnit(null);
    },
    onError: (err) => {
      toast.error(err.message || "Submission failed.");
    }
  });

  const approveMutation = useMutation({
    mutationFn: async (requestId) => {
      const token = localStorage.getItem("token") || "";
      const res = await fetch("/api/shift/approve", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ requestId })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to execute unit shift.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shiftHistory"] });
      queryClient.invalidateQueries({ queryKey: ["shiftOrders"] });
      queryClient.invalidateQueries({ queryKey: ["availableUnits"] });
      queryClient.invalidateQueries({ queryKey: ["salesOrders"] });
      toast.success("Shifting request approved and executed successfully!");
    },
    onError: (err) => {
      toast.error(err.message || "Approval failed.");
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ requestId, rejection_reason }) => {
      const token = localStorage.getItem("token") || "";
      const res = await fetch("/api/shift/reject", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ requestId, rejection_reason })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to reject request.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shiftHistory"] });
      toast.success("Shifting request rejected.");
      setShowRejectModal(false);
      setRejectReason("");
      setRejectingId(null);
    },
    onError: (err) => {
      toast.error(err.message || "Rejection failed.");
    }
  });

  // Source selection handler
  const handleSelectSourceOrder = (orderId) => {
    const order = eligibleOrders.find(o => o.id === orderId);
    setSelectedOrder(order || null);
    setForm(prev => ({ ...prev, sales_order_id: orderId, to_unit_id: "" }));
    setSelectedUnit(null);
  };

  // Destination project filter
  const uniqueDestProjects = Array.from(new Set(availableUnits.map(u => u.project_name)));

  const handleSelectDestProject = (projName) => {
    setSelectedDestProject(projName);
    setSelectedUnit(null);
    setForm(prev => ({ ...prev, to_unit_id: "" }));
  };

  // Destination unit filter
  const eligibleDestUnits = availableUnits.filter(u => {
    // Must match project
    if (u.project_name !== selectedDestProject) return false;
    // Cannot be same unit
    if (selectedOrder && u.id === selectedOrder.unit_id) return false;
    return true;
  });

  const handleSelectDestUnit = (unitId) => {
    const unit = availableUnits.find(u => u.id === unitId);
    setSelectedUnit(unit || null);
    setForm(prev => ({ ...prev, to_unit_id: unitId }));
  };

  // Calculations
  const oldAgreement = selectedOrder ? Number(selectedOrder.agreement_value) : 0;
  const newAgreement = selectedUnit ? Number(selectedUnit.agreement_value) : 0;
  const priceDifference = newAgreement - oldAgreement;
  const areaDifference = selectedOrder && selectedUnit ? (selectedUnit.carpet_area - selectedOrder.area) : 0;
  const floorDifference = selectedOrder && selectedUnit ? (selectedUnit.floor_number - selectedOrder.floor) : 0;

  const outstandingBefore = selectedOrder ? Number(selectedOrder.outstanding_amount) : 0;
  const outstandingAfter = outstandingBefore + priceDifference;

  let shiftType = "EQUAL";
  if (priceDifference > 0) shiftType = "UPGRADE";
  else if (priceDifference < 0) shiftType = "DOWNGRADE";

  // Form submit
  const handleSubmitRequest = () => {
    if (!form.sales_order_id || !form.to_unit_id) {
      toast.error("Please select both a current booking and a destination unit.");
      return;
    }
    createMutation.mutate({
      sales_order_id: form.sales_order_id,
      to_unit_id: form.to_unit_id,
      reason: form.reason
    });
  };

  // Print Statement Handler
  const handlePrint = (req) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Unit Shifting Statement - ${req.request_number}</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #333; line-height: 1.5; }
            .header { text-align: center; border-bottom: 2px solid #ddd; padding-bottom: 20px; margin-bottom: 30px; }
            .logo { font-size: 24px; font-weight: bold; color: #4f46e5; }
            .title { font-size: 20px; font-weight: bold; margin-top: 10px; text-transform: uppercase; letter-spacing: 1px; }
            .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            .meta-table td { padding: 8px 0; font-size: 14px; }
            .details-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            .details-table th, .details-table td { border: 1px solid #ddd; padding: 12px; text-align: left; }
            .details-table th { background-color: #f9fafb; font-weight: bold; }
            .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
            .badge-pending { background: #fef3c7; color: #d97706; }
            .badge-approved { background: #d1fae5; color: #059669; }
            .badge-rejected { background: #fee2e2; color: #dc2626; }
            .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #777; border-top: 1px solid #ddd; padding-top: 20px; }
            .signatures { display: flex; justify-content: space-between; margin-top: 80px; }
            .sig-box { width: 200px; text-align: center; border-top: 1px solid #333; padding-top: 8px; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">PropFin Sales Finance CRM</div>
            <div class="title">Unit Shifting Settlement Statement</div>
          </div>
          <table class="meta-table">
            <tr>
              <td><strong>Request Number:</strong> ${req.request_number}</td>
              <td><strong>Request Date:</strong> ${format(new Date(req.request_date), "dd MMM yyyy")}</td>
            </tr>
            <tr>
              <td><strong>Customer Name:</strong> ${req.customer_name}</td>
              <td><strong>Status:</strong> <span class="badge badge-${req.status}">${req.status}</span></td>
            </tr>
            \${req.approved_by ? \`
            <tr>
              <td><strong>Approved By:</strong> \${req.approved_by}</td>
              <td><strong>Approval Date:</strong> \${req.approval_date ? format(new Date(req.approval_date), "dd MMM yyyy") : "—"}</td>
            </tr>
            \` : ""}
          </table>

          <h3>Property Transfer Mapping</h3>
          <table class="details-table">
            <thead>
              <tr>
                <th>Metric / Attribute</th>
                <th>Source Unit (Old)</th>
                <th>Destination Unit (New)</th>
                <th>Variance / Change</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Project Name</strong></td>
                <td>\${req.from_project_name}</td>
                <td>\${req.to_project_name}</td>
                <td>\${req.from_project_name !== req.to_project_name ? "Cross Project Shift" : "Same Project Shift"}</td>
              </tr>
              <tr>
                <td><strong>Unit Number</strong></td>
                <td>\${req.from_unit_number}</td>
                <td>\${req.to_unit_number}</td>
                <td>—</td>
              </tr>
              <tr>
                <td><strong>Tower / Block</strong></td>
                <td>\${req.from_tower}</td>
                <td>\${req.to_tower}</td>
                <td>—</td>
              </tr>
              <tr>
                <td><strong>Agreement Value</strong></td>
                <td>₹\${Number(req.old_agreement_value).toLocaleString()}</td>
                <td>₹\${Number(req.new_agreement_value).toLocaleString()}</td>
                <td><strong>₹\${Number(req.price_difference).toLocaleString()} (\${req.price_difference >= 0 ? "Upgrade" : "Downgrade"})</strong></td>
              </tr>
            </tbody>
          </table>

          \${req.reason ? \`<p><strong>Reason for shifting:</strong> \${req.reason}</p>\` : ""}
          \${req.rejection_reason ? \`<p><strong>Rejection comments:</strong> \${req.rejection_reason}</p>\` : ""}

          <div class="signatures">
            <div class="sig-box">Prepared By (Sales Executive)</div>
            <div class="sig-box">Authorized Signatory (CRM)</div>
            <div class="sig-box">Customer Consent Sign</div>
          </div>

          <div class="footer">
            Generated automatically on \${new Date().toLocaleString()} | PropFin Solutions
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Filter and search computation
  const filteredHistory = requests.filter(req => {
    // 1. Search term match
    const searchString = `${req.request_number} ${req.customer_name} ${req.from_unit_number} ${req.to_unit_number}`.toLowerCase();
    if (searchTerm && !searchString.includes(searchTerm.toLowerCase())) return false;

    // 2. Status filter
    if (statusFilter !== "ALL" && req.status !== statusFilter.toLowerCase()) return false;

    // 3. Type filter
    if (typeFilter !== "ALL") {
      const diff = Number(req.price_difference || 0);
      if (typeFilter === "UPGRADE" && diff <= 0) return false;
      if (typeFilter === "DOWNGRADE" && diff >= 0) return false;
      if (typeFilter === "EQUAL" && diff !== 0) return false;
    }

    return true;
  });

  const columns = [
    { header: "Request #", accessor: "request_number", cell: r => <span className="font-mono text-xs font-semibold">{r.request_number || "—"}</span> },
    { header: "Date", accessor: "request_date", cell: r => format(new Date(r.request_date), "dd MMM yyyy") },
    { header: "Customer", accessor: "customer_name", cell: r => <span className="font-medium">{r.customer_name}</span> },
    {
      header: "From (Old)",
      cell: r => (
        <div className="text-xs">
          <p className="font-semibold text-slate-700">{r.from_unit_number}</p>
          <p className="text-slate-500 text-[10px]">{r.from_project_name}</p>
        </div>
      )
    },
    {
      header: "To (New)",
      cell: r => (
        <div className="text-xs">
          <p className="font-semibold text-slate-700">{r.to_unit_number}</p>
          <p className="text-slate-500 text-[10px]">{r.to_project_name}</p>
        </div>
      )
    },
    {
      header: "Financial Difference",
      accessor: "price_difference",
      cell: r => {
        const val = Number(r.price_difference || 0);
        return (
          <span className={`font-semibold ${val > 0 ? "text-amber-600" : val < 0 ? "text-emerald-600" : "text-blue-600"}`}>
            ₹{val.toLocaleString()}
          </span>
        );
      }
    },
    { header: "Requested By", accessor: "requested_by" },
    { header: "Approved By", accessor: "approved_by" },
    { header: "Status", accessor: "status", cell: r => <StatusBadge status={r.status} /> },
    {
      header: "Actions",
      cell: r => (
        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setViewingRequest(r)}>
            <Eye className="w-3.5 h-3.5 text-slate-500" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handlePrint(r)}>
            <Printer className="w-3.5 h-3.5 text-slate-500" />
          </Button>
          {r.status === "pending" && (
            <>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-600"
                onClick={() => {
                  if (window.confirm(`Are you sure you want to approve this unit shift? Old unit \${r.from_unit_number} will become available and unit \${r.to_unit_number} will be booked.`)) {
                    approveMutation.mutate(r.id);
                  }
                }}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 border-red-200 hover:bg-red-50 hover:text-red-600"
                onClick={() => {
                  setRejectingId(r.id);
                  setRejectReason("");
                  setShowRejectModal(true);
                }}
              >
                <XCircle className="w-3.5 h-3.5 text-red-500" />
              </Button>
            </>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Unit Shifting Workspace"
        description="Process buyer transfers from their currently booked property unit to another available unit."
      />

      {/* 1. DUAL-PANEL WORKSPACE & DIFFERENCE CALCULATOR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Panel: Source Unit */}
        <Card className="lg:col-span-5 border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <CardHeader className="border-b bg-slate-50/50 pb-4">
              <CardTitle className="text-base flex items-center gap-2 text-slate-800">
                <User className="w-4 h-4 text-slate-500" />
                Source Unit (Read-Only)
              </CardTitle>
              <CardDescription>Select an existing active sales order to shift from.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="sales-order-select" className="text-slate-600 font-medium">Select Existing Booking</Label>
                <Select value={form.sales_order_id} onValueChange={handleSelectSourceOrder} disabled={ordersLoading}>
                  <SelectTrigger id="sales-order-select" className="bg-white border-slate-200">
                    <SelectValue placeholder={ordersLoading ? "Loading bookings..." : "Choose Booking"} />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleOrders.map(o => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.order_number} — {o.customer_name} ({o.unit_number})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedOrder ? (
                <div className="grid grid-cols-2 gap-3 text-xs pt-2">
                  <div className="rounded-lg border bg-slate-50/30 p-2.5">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Customer Name</p>
                    <p className="font-semibold text-slate-700 mt-0.5">{selectedOrder.customer_name}</p>
                  </div>
                  <div className="rounded-lg border bg-slate-50/30 p-2.5">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Booking Unit</p>
                    <p className="font-semibold text-slate-700 mt-0.5">{selectedOrder.unit_number}</p>
                  </div>
                  <div className="rounded-lg border bg-slate-50/30 p-2.5">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Agreement Value</p>
                    <p className="font-semibold text-slate-700 mt-0.5">₹{selectedOrder.agreement_value.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg border bg-slate-50/30 p-2.5">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Project Name</p>
                    <p className="font-semibold text-slate-700 mt-0.5">{selectedOrder.project_name}</p>
                  </div>
                  <div className="rounded-lg border bg-slate-50/30 p-2.5">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Floor / Area</p>
                    <p className="font-semibold text-slate-700 mt-0.5">Floor {selectedOrder.floor} / {selectedOrder.area} sqft</p>
                  </div>
                  <div className="rounded-lg border bg-slate-50/30 p-2.5">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Booking Date</p>
                    <p className="font-semibold text-slate-700 mt-0.5">
                      {format(new Date(selectedOrder.booking_date), "dd MMM yyyy")}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-slate-50/30 p-2.5">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Paid Balance</p>
                    <p className="font-semibold text-emerald-600 mt-0.5">₹{selectedOrder.amount_paid.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg border bg-slate-50/30 p-2.5">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Outstanding Due</p>
                    <p className="font-semibold text-red-500 mt-0.5">₹{selectedOrder.outstanding_amount.toLocaleString()}</p>
                  </div>
                </div>
              ) : (
                <div className="h-44 border border-dashed rounded-lg flex flex-col items-center justify-center text-slate-400 bg-slate-50/20">
                  <FileText className="w-8 h-8 opacity-50 mb-2" />
                  <p className="text-xs">Select a booking to view its details</p>
                </div>
              )}
            </CardContent>
          </div>
        </Card>

        {/* Right Panel: Destination Unit */}
        <Card className="lg:col-span-7 border-indigo-100 shadow-sm flex flex-col justify-between">
          <div>
            <CardHeader className="border-b bg-indigo-50/30 pb-4">
              <CardTitle className="text-base flex items-center gap-2 text-indigo-900">
                <ArrowRight className="w-4 h-4 text-indigo-500" />
                Destination Unit (Read-Only)
              </CardTitle>
              <CardDescription>Select destination project and unit. Manual overrides are disabled.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="project-select" className="text-slate-600 font-medium">Select Project</Label>
                  <Select value={selectedDestProject} onValueChange={handleSelectDestProject} disabled={unitsLoading}>
                    <SelectTrigger id="project-select" className="bg-white border-slate-200">
                      <SelectValue placeholder="Choose Destination Project" />
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueDestProjects.map(proj => (
                        <SelectItem key={proj} value={proj}>{proj}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="unit-select" className="text-slate-600 font-medium">Select Available Unit</Label>
                  <Select value={form.to_unit_id} onValueChange={handleSelectDestUnit} disabled={!selectedDestProject}>
                    <SelectTrigger id="unit-select" className="bg-white border-slate-200">
                      <SelectValue placeholder={selectedDestProject ? "Choose Available Unit" : "Select project first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleDestUnits.map(unit => (
                        <SelectItem key={unit.id} value={unit.id}>{unit.unit_number}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedUnit ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs pt-2">
                  <div className="rounded-lg border bg-indigo-50/10 p-2.5">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Tower / Block</p>
                    <p className="font-semibold text-slate-700 mt-0.5">{selectedUnit.tower_name}</p>
                  </div>
                  <div className="rounded-lg border bg-indigo-50/10 p-2.5">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Floor Number</p>
                    <p className="font-semibold text-slate-700 mt-0.5">Floor {selectedUnit.floor_number}</p>
                  </div>
                  <div className="rounded-lg border bg-indigo-50/10 p-2.5">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Carpet Area</p>
                    <p className="font-semibold text-slate-700 mt-0.5">{selectedUnit.carpet_area} sqft</p>
                  </div>
                  <div className="rounded-lg border bg-indigo-50/10 p-2.5">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Unit Type</p>
                    <p className="font-semibold text-slate-700 mt-0.5">{selectedUnit.unit_type}</p>
                  </div>
                  <div className="rounded-lg border bg-indigo-50/10 p-2.5">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Facing direction</p>
                    <p className="font-semibold text-slate-700 mt-0.5">{selectedUnit.facing}</p>
                  </div>
                  <div className="rounded-lg border bg-indigo-50/10 p-2.5">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Agreement Value</p>
                    <p className="font-semibold text-indigo-700 mt-0.5">₹{selectedUnit.agreement_value.toLocaleString()}</p>
                  </div>
                </div>
              ) : (
                <div className="h-44 border border-dashed rounded-lg flex flex-col items-center justify-center text-indigo-400 bg-indigo-50/5">
                  <Activity className="w-8 h-8 opacity-50 mb-2" />
                  <p className="text-xs">Select destination project and unit to load attributes</p>
                </div>
              )}
            </CardContent>
          </div>
        </Card>

      </div>

      {/* 2. FINANCIAL SUMMARY & SUBMISSION BLOCK */}
      {selectedOrder && selectedUnit && (
        <Card className={`border shadow-md \${
          shiftType === "UPGRADE" ? "border-amber-200 bg-amber-50/10" :
          shiftType === "DOWNGRADE" ? "border-emerald-200 bg-emerald-50/10" : "border-blue-200 bg-blue-50/10"
        }`}>
          <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Shifting Impact Analysis</CardTitle>
              <CardDescription>Verifiable calculation difference between the two properties.</CardDescription>
            </div>
            <div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold \${
                shiftType === "UPGRADE" ? "bg-amber-100 text-amber-800" :
                shiftType === "DOWNGRADE" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
              }`}>
                {shiftType} MODULE
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div className="p-3 border rounded-lg bg-white">
                <p className="text-slate-400 uppercase font-semibold text-[9px]">Price Difference</p>
                <div className="flex items-center gap-1.5 mt-1 font-semibold">
                  {priceDifference > 0 ? <TrendingUp className="w-4 h-4 text-amber-600" /> : <TrendingDown className="w-4 h-4 text-emerald-600" />}
                  <span className={priceDifference > 0 ? "text-amber-700" : "text-emerald-700"}>
                    ₹{priceDifference.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="p-3 border rounded-lg bg-white">
                <p className="text-slate-400 uppercase font-semibold text-[9px]">Area Difference</p>
                <p className="font-semibold text-slate-700 mt-1">{areaDifference >= 0 ? "+" : ""}{areaDifference} sqft</p>
              </div>
              <div className="p-3 border rounded-lg bg-white">
                <p className="text-slate-400 uppercase font-semibold text-[9px]">Floor Difference</p>
                <p className="font-semibold text-slate-700 mt-1">{floorDifference >= 0 ? "+" : ""}{floorDifference} Floors</p>
              </div>
              <div className="p-3 border rounded-lg bg-white">
                <p className="text-slate-400 uppercase font-semibold text-[9px]">Project Shift</p>
                <p className="font-semibold text-slate-700 mt-1">
                  {selectedOrder.project_name === selectedUnit.project_name ? "Internal Block Transfer" : "Cross-Project Transfer"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs border-t pt-4">
              <div>
                <p className="text-slate-400">Old Agreement</p>
                <p className="text-sm font-semibold text-slate-600 mt-0.5">₹{oldAgreement.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-slate-400">New Agreement</p>
                <p className="text-sm font-semibold text-slate-700 mt-0.5">₹{newAgreement.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-slate-400">Total Paid (Carry Forward)</p>
                <p className="text-sm font-semibold text-emerald-600 mt-0.5">₹{selectedOrder.amount_paid.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-slate-400">Outstanding Before</p>
                <p className="text-sm font-semibold text-red-500 mt-0.5">₹{outstandingBefore.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-slate-400 font-semibold">Outstanding After Approval</p>
                <p className="text-sm font-bold text-slate-800 mt-0.5">₹{outstandingAfter.toLocaleString()}</p>
              </div>
            </div>

            <div className="space-y-1.5 border-t pt-4">
              <Label className="text-slate-600 font-medium">Remarks / Reason for Shifting</Label>
              <Textarea
                placeholder="Enter justification for the unit shifting request..."
                value={form.reason}
                onChange={e => setForm(prev => ({ ...prev, reason: e.target.value }))}
                rows={2}
                className="bg-white border-slate-200 text-xs"
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={handleSubmitRequest}
                disabled={createMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 font-medium"
              >
                Submit Shifting Request
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3. SHIFTING REQUEST HISTORY TABLE */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b pb-4">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Shifting Request History</span>
            <span className="text-xs font-normal text-slate-400">Total requests logged: {filteredHistory.length}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          
          {/* Filters and Search Bar */}
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search requests..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 bg-white"
              />
            </div>
            
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <Filter className="w-3.5 h-3.5" /> Filter by:
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36 bg-white"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Statuses</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-40 bg-white"><SelectValue placeholder="Shift Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Shift Types</SelectItem>
                  <SelectItem value="UPGRADE">Upgrades Only</SelectItem>
                  <SelectItem value="DOWNGRADE">Downgrades Only</SelectItem>
                  <SelectItem value="EQUAL">Equal Values</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DataTable
            columns={columns}
            data={filteredHistory}
            isLoading={historyLoading}
            searchPlaceholder="Search requests..."
          />
        </CardContent>
      </Card>

      {/* 4. REJECTION MODAL */}
      <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Shifting Request</DialogTitle>
            <DialogDescription>Please provide a justification for rejecting this request.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Rejection Reason</Label>
              <Textarea
                placeholder="Reason for rejection..."
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectModal(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!rejectReason.trim()) {
                  toast.error("Please enter a rejection reason.");
                  return;
                }
                rejectMutation.mutate({ requestId: rejectingId, rejection_reason: rejectReason });
              }}
              disabled={rejectMutation.isPending}
            >
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 5. VIEW REQUEST DETAILS MODAL */}
      <Dialog open={!!viewingRequest} onOpenChange={() => setViewingRequest(null)}>
        {viewingRequest && (
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Shifting Request Details</DialogTitle>
              <DialogDescription>Full audit breakdown of the shifting workflow.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2 text-xs border-y my-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-slate-400 font-semibold uppercase text-[9px]">Request Number</p>
                  <p className="font-semibold text-slate-700 mt-0.5">{viewingRequest.request_number}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-semibold uppercase text-[9px]">Request Date</p>
                  <p className="font-semibold text-slate-700 mt-0.5">
                    {format(new Date(viewingRequest.request_date), "dd MMM yyyy")}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 font-semibold uppercase text-[9px]">Customer Name</p>
                  <p className="font-semibold text-slate-700 mt-0.5">{viewingRequest.customer_name}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-semibold uppercase text-[9px]">Status</p>
                  <div className="mt-0.5"><StatusBadge status={viewingRequest.status} /></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                <div>
                  <p className="text-slate-400 font-bold uppercase text-[9px]">From (Source Unit)</p>
                  <p className="font-semibold text-slate-700 mt-1">Unit: {viewingRequest.from_unit_number}</p>
                  <p className="text-slate-500">Project: {viewingRequest.from_project_name}</p>
                  <p className="text-slate-500">Block: {viewingRequest.from_tower}</p>
                  <p className="text-slate-500 font-semibold mt-1">Agreement: ₹{Number(viewingRequest.old_agreement_value).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-bold uppercase text-[9px]">To (Destination Unit)</p>
                  <p className="font-semibold text-slate-700 mt-1">Unit: {viewingRequest.to_unit_number}</p>
                  <p className="text-slate-500">Project: {viewingRequest.to_project_name}</p>
                  <p className="text-slate-500">Block: {viewingRequest.to_tower}</p>
                  <p className="text-slate-500 font-semibold mt-1">Agreement: ₹{Number(viewingRequest.new_agreement_value).toLocaleString()}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-3 border-t bg-slate-50/50 p-2 rounded-lg">
                <div>
                  <p className="text-slate-400 uppercase text-[9px]">Price Difference</p>
                  <p className={`font-bold \${viewingRequest.price_difference > 0 ? "text-amber-700" : viewingRequest.price_difference < 0 ? "text-emerald-700" : "text-blue-700"}`}>
                    ₹{Number(viewingRequest.price_difference).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 uppercase text-[9px]">Area Difference</p>
                  <p className="font-bold text-slate-700">
                    {viewingRequest.area_difference >= 0 ? "+" : ""}{viewingRequest.area_difference} sqft
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 uppercase text-[9px]">Floor Difference</p>
                  <p className="font-bold text-slate-700">
                    {viewingRequest.floor_difference >= 0 ? "+" : ""}{viewingRequest.floor_difference} Floors
                  </p>
                </div>
              </div>

              {viewingRequest.reason && (
                <div className="pt-2">
                  <p className="text-slate-400 font-semibold uppercase text-[9px]">Reason for shifting</p>
                  <p className="text-slate-700 mt-0.5 italic">{viewingRequest.reason}</p>
                </div>
              )}

              {viewingRequest.rejection_reason && (
                <div className="pt-2 border-t border-red-100 bg-red-50/20 p-2 rounded-lg">
                  <p className="text-red-500 font-semibold uppercase text-[9px]">Rejection Reason</p>
                  <p className="text-red-700 mt-0.5 italic">{viewingRequest.rejection_reason}</p>
                </div>
              )}

              {(viewingRequest.approved_by || viewingRequest.requested_by) && (
                <div className="grid grid-cols-2 gap-4 pt-3 border-t text-[10px] text-slate-500">
                  <p><strong>Submitted by:</strong> {viewingRequest.requested_by}</p>
                  {viewingRequest.approved_by && (
                    <p><strong>Approved/Rejected by:</strong> {viewingRequest.approved_by} on {format(new Date(viewingRequest.approval_date), "dd MMM yyyy")}</p>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => setViewingRequest(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}