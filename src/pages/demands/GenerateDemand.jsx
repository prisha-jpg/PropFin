import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function GenerateDemand() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: orders = [] } = useQuery({ queryKey: ["salesOrders"], queryFn: () => apiClient.entities.SalesOrder.list("-created_date", 200) });

  const [form, setForm] = useState({
    sales_order_id: "", customer_id: "", customer_name: "", project_name: "", unit_number: "",
    demand_type: "subsequent", demand_date: new Date().toISOString().split("T")[0], due_date: "",
    installment_number: "", milestone_description: "", demand_amount: "", gst_amount: "",
    payment_schedule_id: ""
  });

  const selectedOrder = orders.find(o => o.id === form.sales_order_id);
  const selectedOrderSchedules = selectedOrder?.payment_schedules || [];
  const demandedIds = new Set((selectedOrder?.demand_letters || []).map(d => d.payment_schedule_id).filter(Boolean));

  const h = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleOrderChange = (id) => {
    const o = orders.find(o => o.id === id);
    if (o) {
      const demandedScheduleIds = new Set(
        (o.demand_letters || [])
          .map(d => d.payment_schedule_id)
          .filter(Boolean)
      );
      
      const nextMilestone = (o.payment_schedules || []).find(
        s => !demandedScheduleIds.has(s.id)
      );

      setForm({
        sales_order_id: id,
        customer_id: o.customer_id,
        customer_name: o.customer_name,
        project_name: o.project_name,
        unit_number: o.unit_number,
        demand_type: "subsequent",
        demand_date: new Date().toISOString().split("T")[0],
        due_date: "",
        installment_number: nextMilestone ? String(nextMilestone.display_order) : "",
        milestone_description: nextMilestone ? nextMilestone.milestone_name : "",
        demand_amount: nextMilestone ? String(nextMilestone.due_amount) : "",
        gst_amount: nextMilestone ? String(Number(nextMilestone.due_amount) * 0.05) : "",
        payment_schedule_id: nextMilestone ? nextMilestone.id : ""
      });
    }
  };

  const mutation = useMutation({
    mutationFn: (data) => apiClient.entities.DemandLetter.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["demandLetters"] });
      toast.success("Demand letter generated");
      navigate("/demand-letters");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to generate demand letter.");
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.sales_order_id) {
      toast.error("Please select a sales order.");
      return;
    }
    if (!form.due_date || !form.demand_amount) {
      toast.error("Due date and demand amount are required.");
      return;
    }
    const demandAmt = Number(form.demand_amount);
    const gst = Number(form.gst_amount || 0);
    mutation.mutate({
      ...form,
      demand_number: "DM" + Date.now().toString(36).toUpperCase(),
      demand_amount: demandAmt,
      gst_amount: gst,
      total_demand: demandAmt + gst,
      balance: demandAmt + gst,
      amount_paid: 0,
      installment_number: Number(form.installment_number),
      status: "generated",
      payment_schedule_id: form.payment_schedule_id || null
    });
  };

  return (
    <div>
      <PageHeader title="Generate PRL Demand Letter" description="Generate subsequent payment request letter" />
      <Card className="max-w-3xl">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Sales Order *</Label>
                <Select value={form.sales_order_id} onValueChange={handleOrderChange}>
                  <SelectTrigger><SelectValue placeholder="Select order" /></SelectTrigger>
                  <SelectContent>
                    {orders.map(o => <SelectItem key={o.id} value={o.id}>{o.order_number} - {o.customer_name} ({o.unit_number})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Customer</Label>
                <Input value={form.customer_name} readOnly className="bg-muted" />
              </div>

              {selectedOrder && (
                <>
                  <div className="space-y-1.5">
                    <Label>Select Installment Milestone</Label>
                    <Select
                      value={form.payment_schedule_id}
                      onValueChange={(scheduleId) => {
                        const ms = selectedOrderSchedules.find(s => s.id === scheduleId);
                        if (ms) {
                          setForm(p => ({
                            ...p,
                            payment_schedule_id: ms.id,
                            installment_number: String(ms.display_order),
                            milestone_description: ms.milestone_name,
                            demand_amount: String(ms.due_amount),
                            gst_amount: String(Number(ms.due_amount) * 0.05)
                          }));
                        }
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Choose milestone" /></SelectTrigger>
                      <SelectContent>
                        {selectedOrderSchedules.map(s => {
                          const isDemanded = demandedIds.has(s.id);
                          return (
                            <SelectItem key={s.id} value={s.id}>
                              {s.display_order}. {s.milestone_name} (₹{Number(s.due_amount).toLocaleString()}){isDemanded ? " [Demanded]" : ""}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Current Outstanding</Label>
                    <Input
                      value={selectedOrder ? `₹${Number(selectedOrder.outstanding_amount || 0).toLocaleString()}` : "—"}
                      readOnly
                      className="bg-muted font-semibold text-red-600"
                    />
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label>Demand Type</Label>
                <Select value={form.demand_type} onValueChange={v => h("demand_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first">First Demand</SelectItem>
                    <SelectItem value="subsequent">Subsequent PRL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Installment #</Label>
                <Input type="number" value={form.installment_number} onChange={e => h("installment_number", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Demand Date</Label>
                <Input type="date" value={form.demand_date} onChange={e => h("demand_date", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Due Date *</Label>
                <Input type="date" value={form.due_date} onChange={e => h("due_date", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Demand Amount (₹) *</Label>
                <Input type="number" value={form.demand_amount} onChange={e => h("demand_amount", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>GST Amount (₹)</Label>
                <Input type="number" value={form.gst_amount} onChange={e => h("gst_amount", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Milestone Description</Label>
              <Textarea value={form.milestone_description} onChange={e => h("milestone_description", e.target.value)} rows={2} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate("/demand-letters")}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>Generate Demand Letter</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}