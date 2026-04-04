import React from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "../../components/shared/PageHeader";
import StatusBadge from "../../components/shared/StatusBadge";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Plus, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { downloadDocumentPdf, formatDocumentType, previewDocumentPdf } from "@/utils/documents";
import { toast } from "sonner";

export default function BankDocInquiry() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const { data: docs = [], isLoading } = useQuery({ queryKey: ["bankDocuments"], queryFn: () => apiClient.entities.BankDocument.list("-created_date", 200) });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => apiClient.entities.BankDocument.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bankDocuments"] });
      toast.success("Document status updated");
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

  return (
    <div className="space-y-6">
      <PageHeader title="Bank Document Inquiry" description="Track all generated Bank NOC and Builder NOC documents" actions={<Link to="/bank-documents/generate"><Button className="gap-2"><Plus className="w-4 h-4" /> Generate</Button></Link>} />
      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6">
        <Card className="border-teal-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Generation Events</CardTitle>
            <div className="relative">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" placeholder="Filter by customer, unit, type" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[70vh] overflow-y-auto">
            {isLoading && <p className="text-sm text-muted-foreground">Loading documents...</p>}
            {!isLoading && filteredDocs.length === 0 && <p className="text-sm text-muted-foreground">No matching documents</p>}
            {filteredDocs.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => setSelectedId(doc.id)}
                className={`w-full text-left rounded-md border p-3 transition-colors ${selectedDoc?.id === doc.id ? "border-teal-500 bg-teal-50" : "hover:bg-muted/30"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm">{doc.customer_name || "Unnamed Customer"}</p>
                  <Badge variant="outline" className="text-[10px]">{formatDocumentType(doc.document_type)}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{doc.customer_code || "-"} · {doc.unit_number || "-"}</p>
                <p className="text-xs text-muted-foreground">{doc.document_number || "-"} · {doc.generation_date ? format(new Date(doc.generation_date), "dd MMM yyyy") : "-"}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="border-b bg-slate-50/80">
            <CardTitle className="text-base">Document Details</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {!selectedDoc && <p className="text-sm text-muted-foreground">Select a document from the left panel.</p>}
            {selectedDoc && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Customer Code</p><p className="font-medium">{selectedDoc.customer_code || "-"}</p></div>
                  <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Customer Name</p><p className="font-medium">{selectedDoc.customer_name || "-"}</p></div>
                  <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Unit No.</p><p className="font-medium">{selectedDoc.unit_number || "-"}</p></div>
                  <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Document Type</p><p className="font-medium">{formatDocumentType(selectedDoc.document_type)}</p></div>
                  <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Generated Date</p><p className="font-medium">{selectedDoc.generation_date ? format(new Date(selectedDoc.generation_date), "dd MMM yyyy") : "-"}</p></div>
                  <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Generated By</p><p className="font-medium">{selectedDoc.generated_by || "Current User"}</p></div>
                  <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Triggered By</p><p className="font-medium">{selectedDoc.triggered_by === "auto_payment_reminder" ? "Auto - Payment Reminder" : "Manual"}</p></div>
                  <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Status</p><div className="pt-1"><StatusBadge status={selectedDoc.status || "draft"} /></div></div>
                </div>

                <div className="rounded-md border p-4">
                  <p className="text-sm font-medium mb-3">Status Timeline</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {[
                      { key: "draft", label: "Draft" },
                      { key: "sent", label: "Sent" },
                      { key: "acknowledged", label: "Acknowledged" },
                    ].map((s) => (
                      <Badge key={s.key} variant={selectedDoc.status === s.key ? "default" : "outline"}>{s.label}</Badge>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => previewDocumentPdf(selectedDoc)}>View</Button>
                  <Button variant="outline" onClick={() => downloadDocumentPdf(selectedDoc)}>Download</Button>
                  <Button
                    variant="outline"
                    onClick={() => updateMutation.mutate({ id: selectedDoc.id, data: { status: "sent" } })}
                    disabled={updateMutation.isPending}
                  >
                    Resend
                  </Button>
                  <Button
                    onClick={() => updateMutation.mutate({ id: selectedDoc.id, data: { status: "acknowledged" } })}
                    disabled={updateMutation.isPending}
                  >
                    Mark Acknowledged
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