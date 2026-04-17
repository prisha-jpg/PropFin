import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import WorkflowRequestForm from "../../components/shared/WorkflowRequestForm";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function GenerateTDS() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data) => apiClient.entities.ClientTDS.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["clientTDS"] }); toast.success("TDS entry generated"); navigate("/tds/view"); },
    onError: (error) => { toast.error(error.message || "Failed to generate TDS entry."); }
  });

  const fields = [
    { key: "transaction_amount", label: "Transaction Amount (₹)", type: "number", required: true },
    { key: "tds_rate", label: "TDS Rate (%)", type: "number", required: true },
    { key: "tds_amount", label: "TDS Amount (₹)", type: "number", required: true },
    { key: "deduction_date", label: "Deduction Date", type: "date", required: true, defaultValue: new Date().toISOString().split("T")[0] },
    { key: "financial_year", label: "Financial Year", type: "text" },
    { key: "pan_of_deductee", label: "PAN of Deductee", type: "text" },
    { key: "remarks", label: "Remarks", type: "textarea", fullWidth: true }
  ];

  return (
    <div>
      <PageHeader title="Generate Client TDS" description="Generate TDS entries for customer transactions" />
      <Card className="max-w-3xl"><CardContent className="pt-6">
        <WorkflowRequestForm fields={fields} onSubmit={(data) => mutation.mutate({ ...data, tds_number: "TDS" + Date.now().toString(36).toUpperCase(), status: "generated", transaction_amount: Number(data.transaction_amount), tds_rate: Number(data.tds_rate), tds_amount: Number(data.tds_amount) })} onCancel={() => navigate(-1)} isLoading={mutation.isPending} submitLabel="Generate TDS" />
      </CardContent></Card>
    </div>
  );
}