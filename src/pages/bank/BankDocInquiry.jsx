import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import StatusBadge from "../../components/shared/StatusBadge";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Plus, Search, RefreshCw, Download, Eye, CheckCircle2, Send, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { downloadDocumentPdf, formatDocumentType, previewDocumentPdf } from "@/utils/documents";
import { formatInrCurrency } from "@/utils/documentTemplates";
import { toast } from "sonner";

export default function BankDocInquiry() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  
  const { data: docs = [], isLoading } = useQuery({ 
    queryKey: ["bankDocuments"], 
    queryFn: () => apiClient.entities.BankDocument.list("-created_date", 200) 
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => apiClient.entities.BankDocument.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bankDocuments"] });
      toast.success("Document updated successfully");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update document status");
    }
  });

  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) =>
      [d.customer_code, d.customer_name, d.unit_number, d.document_number, d.document_type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [docs, search]);

  const selectedDoc = filteredDocs.find((d) => d.id === selectedId) || filteredDocs[0] || null;

  const handleRegenerate = async (doc) => {
    try {
      const toastId = toast.loading("Fetching latest CRM and ledger data...");
      
      // 1. Fetch latest customer details
      const customerRes = await fetch(`/api/entities/Customer/${doc.customer_id}`);
      let customerData = {};
      if (customerRes.ok) customerData = await customerRes.json();

      // 2. Fetch latest ledger summary
      const ledgerRes = await fetch(`/api/pricing/ledger-summary/${doc.sales_order_id}`);
      let ledgerSummary = {};
      if (ledgerRes.ok) ledgerSummary = await ledgerRes.json();

      // 3. Fetch latest sales order details
      const orderRes = await fetch(`/api/entities/SalesOrder/${doc.sales_order_id}`);
      let orderData = {};
      if (orderRes.ok) orderData = await orderRes.json();

      // Reconstruct document content with current live parameters
      const oldContent = doc.document_content 
        ? (typeof doc.document_content === "string" ? JSON.parse(doc.document_content) : doc.document_content) 
        : {};
      
      const newContent = {
        ...oldContent,
        customer_name: orderData.customer_name || customerData.full_name || oldContent.customer_name,
        customer_code: customerData.customer_code || oldContent.customer_code,
        project_name: orderData.project_name || oldContent.project_name,
        unit_number: orderData.unit_number || oldContent.unit_number,
        agreement_value: Number(orderData.agreement_value || orderData.total_value || oldContent.agreement_value),
        amount_received_to_date: Number(ledgerSummary.amountReceivedToDate || 0),
        outstanding_amount: Number(ledgerSummary.outstandingBalance || 0),
        loan_amount: null,
        loan_account_number: customerData.loan_account_number || oldContent.loan_account_number,
        bank_name: customerData.loan_bank_id || customerData.loan_bank_name || oldContent.bank_name,
        branch_name: customerData.loan_branch || oldContent.branch_name,
        generation_date: new Date().toISOString().split("T")[0]
      };

      await updateMutation.mutateAsync({
        id: doc.id,
        data: {
          document_content: newContent,
          loan_amount: null,
          loan_account_number: newContent.loan_account_number,
          generation_date: new Date()
        }
      });

      toast.dismiss(toastId);
      downloadDocumentPdf({ ...doc, document_content: newContent });
      toast.success("Document successfully regenerated and downloaded!");
    } catch (err) {
      toast.dismiss();
      console.error(err);
      toast.error("Failed to regenerate document.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Bank Document Inquiry" 
        description="Track, view, and regenerate all generated Bank NOC and Builder NOC documents" 
        actions={
          <Link to="/bank-documents/generate">
            <Button className="gap-2 bg-teal-700 hover:bg-teal-800">
              <Plus className="w-4 h-4" /> Generate Document
            </Button>
          </Link>
        } 
      />
      
      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6">
        
        {/* Left List Pane */}
        <Card className="border-teal-200 shadow-sm flex flex-col max-h-[78vh]">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-bold text-slate-800">Generation Events</CardTitle>
            <div className="relative pt-2">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 mt-1" />
              <Input 
                value={search} 
                onChange={(e) => setSearch(e.target.value)} 
                className="pl-9 border-slate-200" 
                placeholder="Filter by customer, unit, type..." 
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-2 overflow-y-auto pt-4 flex-grow">
            {isLoading && <p className="text-sm text-slate-500 text-center py-6">Loading documents...</p>}
            {!isLoading && filteredDocs.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No matching documents found</p>}
            
            {filteredDocs.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => setSelectedId(doc.id)}
                className={`w-full text-left rounded-lg border p-3.5 transition-all ${
                  selectedDoc?.id === doc.id 
                    ? "border-teal-600 bg-teal-50/50 shadow-sm" 
                    : "border-slate-100 hover:bg-slate-50/70"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm text-slate-800">{doc.customer_name || "Unnamed Customer"}</p>
                  <Badge variant="outline" className="text-[10px] uppercase font-bold text-teal-800 border-teal-200 bg-teal-50/30">
                    {formatDocumentType(doc.document_type)}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-1 font-medium">{doc.customer_code || "-"} · Unit: {doc.unit_number || "-"}</p>
                <div className="flex justify-between items-center text-[10px] text-slate-400 mt-2 font-mono">
                  <span>{doc.document_number}</span>
                  <span>{doc.generation_date ? format(new Date(doc.generation_date), "dd-MM-yyyy") : "-"}</span>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Right Details Pane */}
        <Card className="border-slate-200 shadow-sm bg-gradient-to-b from-white to-slate-50/30">
          <CardHeader className="border-b bg-slate-50/60 py-4">
            <CardTitle className="text-base font-bold text-slate-800">Document Specifications</CardTitle>
            <CardDescription>Detailed metadata, loan metrics, and generated file actions</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {!selectedDoc ? (
              <div className="py-20 text-center space-y-3">
                <FileText className="w-12 h-12 text-slate-300 mx-auto" />
                <p className="text-sm font-semibold text-slate-600">Select a document from the left list to review details.</p>
              </div>
            ) : (
              <div className="space-y-6">
                
                {/* Information Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-lg border border-slate-150 p-3 bg-white">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Document Number</p>
                    <p className="font-mono text-sm font-semibold text-slate-800">{selectedDoc.document_number}</p>
                  </div>
                  
                  <div className="rounded-lg border border-slate-150 p-3 bg-white">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Customer Name</p>
                    <p className="text-sm font-semibold text-slate-800">{selectedDoc.customer_name || "—"}</p>
                  </div>
                  
                  <div className="rounded-lg border border-slate-150 p-3 bg-white">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Unit Number</p>
                    <p className="text-sm font-semibold text-slate-800">{selectedDoc.unit_number || "—"}</p>
                  </div>
                  
                  <div className="rounded-lg border border-slate-150 p-3 bg-white">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Document Type</p>
                    <p className="text-sm font-semibold text-teal-700">{formatDocumentType(selectedDoc.document_type)}</p>
                  </div>
                  
                  <div className="rounded-lg border border-slate-150 p-3 bg-white">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Generation Date</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {selectedDoc.generation_date ? format(new Date(selectedDoc.generation_date), "dd-MM-yyyy") : "—"}
                    </p>
                  </div>

                  <div className="rounded-lg border border-slate-150 p-3 bg-white">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</p>
                    <div className="pt-1"><StatusBadge status={selectedDoc.status || "draft"} /></div>
                  </div>

                  <div className="rounded-lg border border-slate-150 p-3 bg-white">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Financing Bank</p>
                    <p className="text-sm font-semibold text-slate-800">{selectedDoc.bank_name || "—"}</p>
                  </div>
                  
                  <div className="rounded-lg border border-slate-150 p-3 bg-white">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Agreement Value</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {selectedDoc.document_content 
                        ? formatInrCurrency((typeof selectedDoc.document_content === "string" ? JSON.parse(selectedDoc.document_content) : selectedDoc.document_content).agreement_value) 
                        : "—"}
                    </p>
                  </div>

                  <div className="rounded-lg border border-slate-150 p-3 bg-white">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Loan Account Number</p>
                    <p className="text-sm font-semibold text-slate-800 font-mono">{selectedDoc.loan_account_number || "—"}</p>
                  </div>
                </div>

                {/* Status Timeline Progress Card */}
                <div className="rounded-lg border border-teal-100 p-4 bg-teal-50/20">
                  <p className="text-xs font-bold text-slate-700 mb-3 uppercase tracking-wider">Document Lifecycle</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {[
                      { key: "draft", label: "Draft" },
                      { key: "sent", label: "Sent to Bank" },
                      { key: "acknowledged", label: "Acknowledged by Bank" },
                    ].map((s) => (
                      <Badge 
                        key={s.key} 
                        variant={selectedDoc.status === s.key ? "default" : "outline"}
                        className={selectedDoc.status === s.key ? "bg-teal-600 hover:bg-teal-700" : ""}
                      >
                        {s.label}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Action Controls */}
                <div className="flex flex-wrap gap-2.5 pt-2">
                  <Button variant="outline" className="gap-1.5" onClick={() => previewDocumentPdf(selectedDoc)}>
                    <Eye className="w-4 h-4 text-blue-600" /> View / Print NOC
                  </Button>
                  
                  <Button variant="outline" className="gap-1.5" onClick={() => downloadDocumentPdf(selectedDoc)}>
                    <Download className="w-4 h-4 text-emerald-600" /> Download PDF
                  </Button>
                  
                  <Button variant="outline" className="gap-1.5" onClick={() => handleRegenerate(selectedDoc)}>
                    <RefreshCw className="w-4 h-4 text-amber-600" /> Regenerate NOC
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => updateMutation.mutate({ id: selectedDoc.id, data: { status: "sent" } })}
                    disabled={updateMutation.isPending}
                  >
                    <Send className="w-4 h-4 text-slate-500" /> Mark Sent
                  </Button>
                  
                  <Button
                    className="gap-1.5 bg-teal-700 hover:bg-teal-800"
                    onClick={() => updateMutation.mutate({ id: selectedDoc.id, data: { status: "acknowledged" } })}
                    disabled={updateMutation.isPending}
                  >
                    <CheckCircle2 className="w-4 h-4" /> Confirm Acknowledged
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}