import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Printer, Save } from "lucide-react";

export default function PriceSheet() {
  const [selectedUnit, setSelectedUnit] = useState("");
  const [customerName, setCustomerName] = useState("");

  const { data: units = [] } = useQuery({
    queryKey: ["master-price-list"],
    queryFn: () => apiClient.get("/pricing/master"),
  });

  const { data: schedules = [] } = useQuery({
    queryKey: ["schedule-master"],
    queryFn: () => apiClient.get("/pricing/schedule-master"),
  });

  const generateSchema = () => {
    if (!selectedUnit) return null;
    
    const unit = units.find(u => u.id === selectedUnit);
    if (!unit || !unit.unit_pricing) return null;

    const pricing = unit.unit_pricing;
    const projectSchedules = schedules.filter(s => s.project_id === unit.project_id);
    
    if (projectSchedules.length === 0) {
      toast.error("No payment schedule master defined for this project.");
      return null;
    }

    const {
      rate_per_sqft,
      basic_sale_value,
      caic_charges,
      classification,
      maintenance_deposit
    } = pricing;

    const totalSaleValue = parseFloat(basic_sale_value);
    const generatedMilestones = projectSchedules.map(ms => {
      const amount = (parseFloat(ms.percentage_of_total) / 100) * totalSaleValue;
      return {
        milestone: ms.milestone_name,
        percentage: parseFloat(ms.percentage_of_total),
        amount: Math.round(amount)
      };
    });

    return {
      unit,
      pricing,
      generatedMilestones,
      totalSaleValue
    };
  };

  const schema = generateSchema();

  const handleSaveQuotation = async () => {
    if (!schema) return;
    if (!customerName) {
      toast.error("Please enter a customer name for the quote");
      return;
    }

    try {
      await apiClient.post("/pricing/quotations", {
        unit_id: schema.unit.id,
        customer_name: customerName,
        total_value: schema.totalSaleValue,
        generated_schedule: schema
      });
      toast.success("Quotation saved successfully");
    } catch (err) {
      toast.error("Failed to save quotation");
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto bg-zinc-50/50 min-h-full">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Generate Price Sheet</h1>
          <p className="text-muted-foreground mt-1">Create and save official unit quotations</p>
        </div>
        <div className="flex gap-2">
          {schema && (
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" /> Print PDF
            </Button>
          )}
          <Button onClick={handleSaveQuotation} disabled={!schema || !customerName}>
            <Save className="mr-2 h-4 w-4" /> Save Quote
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card>
           <CardHeader>
             <CardTitle className="text-lg">Select Unit</CardTitle>
           </CardHeader>
           <CardContent>
             <Select value={selectedUnit} onValueChange={setSelectedUnit}>
               <SelectTrigger>
                 <SelectValue placeholder="Search or select Unit No." />
               </SelectTrigger>
               <SelectContent>
                 {units.map((u) => (
                   <SelectItem key={u.id} value={u.id}>{u.unit_number}</SelectItem>
                 ))}
               </SelectContent>
             </Select>
           </CardContent>
        </Card>
        
        <Card>
           <CardHeader>
             <CardTitle className="text-lg">Customer Information (For Quote)</CardTitle>
           </CardHeader>
           <CardContent>
             <Input 
               placeholder="Prospect / Customer Name" 
               value={customerName}
               onChange={(e) => setCustomerName(e.target.value)} 
             />
           </CardContent>
        </Card>
      </div>

      {schema ? (
        <div className="space-y-6 bg-white p-8 rounded-xl shadow-sm border border-zinc-200 printable-area">
          <div className="text-center mb-8">
             <h2 className="text-2xl font-bold uppercase tracking-widest">{schema.unit.projects?.project_name}</h2>
             <p className="text-muted-foreground">Official Price Sheet & Quotation</p>
          </div>

          <div className="grid grid-cols-2 text-sm border border-zinc-200">
            <div className="p-3 border-b border-r border-zinc-200"><span className="font-semibold text-zinc-500 w-32 inline-block">Unit No:</span> {schema.unit.unit_number}</div>
            <div className="p-3 border-b border-zinc-200"><span className="font-semibold text-zinc-500 w-32 inline-block">Type:</span> {schema.pricing.classification}</div>
            <div className="p-3 border-b border-r border-zinc-200"><span className="font-semibold text-zinc-500 w-32 inline-block">Floor:</span> {schema.unit.floor_number || 'N/A'}</div>
            <div className="p-3 border-b border-zinc-200"><span className="font-semibold text-zinc-500 w-32 inline-block">Block:</span> {schema.unit.blocks?.block_name || 'N/A'}</div>
            <div className="p-3 border-r border-zinc-200"><span className="font-semibold text-zinc-500 w-32 inline-block">SBA (Sq.Ft):</span> {schema.unit.super_built_up_area}</div>
            <div className="p-3"><span className="font-semibold text-zinc-500 w-32 inline-block">Rate / Sq.Ft:</span> ₹{schema.pricing.rate_per_sqft}</div>
          </div>

          <Table className="border border-zinc-200">
            <TableHeader className="bg-zinc-100">
              <TableRow>
                 <TableHead>Cost Component</TableHead>
                 <TableHead className="text-right w-48">Amount (INR)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
               <TableRow>
                 <TableCell>Basic Sale Value (SBA × Rate)</TableCell>
                 <TableCell className="text-right">₹{(schema.unit.super_built_up_area * schema.pricing.rate_per_sqft).toLocaleString()}</TableCell>
               </TableRow>
               <TableRow>
                 <TableCell>Common Area Infrastructure Charges (CAIC)</TableCell>
                 <TableCell className="text-right">₹{schema.pricing.caic_charges?.toLocaleString()}</TableCell>
               </TableRow>
               <TableRow className="font-bold bg-zinc-50">
                 <TableCell>Total Agreement Value</TableCell>
                 <TableCell className="text-right">₹{schema.totalSaleValue?.toLocaleString()}</TableCell>
               </TableRow>
               <TableRow>
                 <TableCell className="text-zinc-500">Maintenance Deposit (To be paid at possession)</TableCell>
                 <TableCell className="text-right text-zinc-500">₹{schema.pricing.maintenance_deposit?.toLocaleString()}</TableCell>
               </TableRow>
            </TableBody>
          </Table>

          <div>
             <h3 className="font-bold text-lg mb-3">Payment Schedule</h3>
             <Table className="border border-zinc-200">
                <TableHeader className="bg-zinc-100">
                  <TableRow>
                     <TableHead>Milestone</TableHead>
                     <TableHead className="text-right w-24">%</TableHead>
                     <TableHead className="text-right w-48">Amount (INR)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                   {schema.generatedMilestones.map((ms, i) => (
                     <TableRow key={i}>
                        <TableCell>{ms.milestone}</TableCell>
                        <TableCell className="text-right">{ms.percentage}%</TableCell>
                        <TableCell className="text-right font-medium">₹{ms.amount.toLocaleString()}</TableCell>
                     </TableRow>
                   ))}
                   <TableRow className="font-bold bg-zinc-50">
                      <TableCell className="text-right" colSpan={2}>Total Sale Value</TableCell>
                      <TableCell className="text-right">₹{schema.totalSaleValue?.toLocaleString()}</TableCell>
                   </TableRow>
                </TableBody>
             </Table>
          </div>
          
          <div className="mt-8 text-xs text-muted-foreground border-t border-zinc-200 pt-4 space-y-1">
             <p><strong>Terms & Conditions:</strong></p>
             <p>1. Goods and Services Tax (GST) are as per prevailing rates subject to change.</p>
             <p>2. Stamp Duty and Registration fee for Sale Agreement shall be paid on actuals.</p>
             <p>3. Demand notes for payment will be issued on the basis of milestone completion.</p>
          </div>
        </div>
      ) : (
         <div className="flex items-center justify-center p-12 text-muted-foreground border border-zinc-200 border-dashed rounded-lg bg-white/50">
            Select a Unit to automatically generate its Price Sheet and Payment Schedule.
         </div>
      )}
    </div>
  );
}
