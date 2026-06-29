import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/api/apiClient";
import { resolvePricingField } from "@/lib/unitPricing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const MasterPriceList = () => {
  const queryClient = useQueryClient();
  const [localData, setLocalData] = useState([]);
  
  const { data: units, isLoading } = useQuery({
    queryKey: ["master-price-list"],
    queryFn: () => apiClient.get("/pricing/master"),
  });

  useEffect(() => {
    if (units) {
      setLocalData(
        units.map((u) => {
          const p = u.unitPricing || {};
          const project = u.projects || {};
          return {
            unit_id: u.id,
            unit_number: u.unit_number,
            unit_type: u.unit_type || "N/A",
            floor_number: u.floor_number || "N/A",
            projects: u.projects,
            blocks: u.blocks,
            carpet_area: parseFloat(u.carpet_area || 0),
            sba: parseFloat(u.super_built_up_area || 0),
            classification: p.classification || "Luxury",
            rate_per_sqft: parseFloat(p.rate_per_sqft || 0),
            caic_charges: resolvePricingField(
              p.caic_charges,
              project.default_caic_charges,
              0,
              { treatZeroAsUnset: true },
            ),
            maintenance_deposit: resolvePricingField(
              p.maintenance_deposit,
              project.default_maintenance_deposit,
              300000,
            ),
            gst_rate: resolvePricingField(p.gst_rate, project.default_gst_rate, 5),
          };
        })
      );
    }
  }, [units]);

  const mutation = useMutation({
    mutationFn: (prices) => apiClient.post("/pricing/master", { prices }),
    onSuccess: () => {
      toast.success("Master prices saved successfully");
      queryClient.invalidateQueries({ queryKey: ["master-price-list"] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || "Failed to save prices");
    }
  });

  const handleUpdate = (unitId, field, val) => {
    setLocalData((prev) =>
      prev.map((row) => (row.unit_id === unitId ? { ...row, [field]: val } : row))
    );
  };

  const handleSave = () => {
    const payload = localData.map((row) => {
      const bsv = row.sba * row.rate_per_sqft + row.caic_charges;
      const gstRate = Number(row.gst_rate ?? 5);
      const gstAmount = bsv * (gstRate / 100);
      return {
        unit_id: row.unit_id,
        sba: row.sba,
        classification: row.classification,
        rate_per_sqft: row.rate_per_sqft,
        caic_charges: row.caic_charges,
        maintenance_deposit: row.maintenance_deposit,
        gst_rate: gstRate,
        basic_sale_value: bsv,
        total_sale_value: bsv + gstAmount + row.maintenance_deposit,
      };
    });
    mutation.mutate(payload);
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-8 bg-zinc-50/50 overflow-hidden">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Master Price List</h1>
          <p className="text-zinc-500 mt-2 text-base">
            Manage unit classification and pricing details.
          </p>
        </div>
        <Button onClick={handleSave} disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Price List
        </Button>
      </div>

      <Card className="flex-1 overflow-hidden shadow-sm border-zinc-200">
        <CardContent className="p-0 h-full">
          <ScrollArea className="h-[calc(100vh-250px)] max-w-[calc(100vw-300px)] overflow-x-auto whitespace-nowrap">
            <Table className="w-max">
              <TableHeader className="bg-zinc-100/50 sticky top-0 z-10 backdrop-blur-sm">
                <TableRow>
                  <TableHead className="w-[100px]">SI No.</TableHead>
                  <TableHead className="w-[100px]">Unit No.</TableHead>
                  <TableHead className="w-[100px]">Floor</TableHead>
                  <TableHead className="w-[100px]">BHK</TableHead>
                  <TableHead className="w-[120px]">Block</TableHead>
                  <TableHead className="w-[150px]">Classification</TableHead>
                  <TableHead className="text-right w-[100px]">Carpet Area</TableHead>
                  <TableHead className="text-right w-[100px]">SBA (Sq.Ft)</TableHead>
                  <TableHead className="text-right w-[120px]">Rate/Sq.Ft</TableHead>
                  <TableHead className="text-right w-[120px]">CAIC Charges</TableHead>
                  <TableHead className="text-right w-[150px]">Basic Sale Value</TableHead>
                  <TableHead className="text-right w-[100px]">GST (%)</TableHead>
                  <TableHead className="text-right w-[150px]">GST Charges</TableHead>
                  <TableHead className="text-right w-[150px]">Maintenance Deposit</TableHead>
                  <TableHead className="text-right w-[180px]">Total Sale Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {localData.map((row, index) => {
                  const bsv = row.sba * row.rate_per_sqft + row.caic_charges;
                  const gstRate = Number(row.gst_rate ?? 5);
                  const gst = bsv * (gstRate / 100);
                  const bsvWithGst = bsv + gst;
                  const totalSaleValue = bsvWithGst + row.maintenance_deposit;
                  
                  return (
                    <TableRow key={row.unit_id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-medium">{row.unit_number}</TableCell>
                      <TableCell>{row.floor_number}</TableCell>
                      <TableCell>{row.unit_type}</TableCell>
                      <TableCell>
                        <div className="truncate w-[100px]">
                          {row.blocks ? row.blocks.block_name : "N/A"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={row.classification}
                          onValueChange={(val) => handleUpdate(row.unit_id, "classification", val)}
                        >
                          <SelectTrigger className="w-[120px] h-8">
                            <SelectValue placeholder="Class" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Luxury">Luxury</SelectItem>
                            <SelectItem value="Grand">Grand</SelectItem>
                            <SelectItem value="Premium">Premium</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">{row.carpet_area}</TableCell>
                      <TableCell className="text-right">{row.sba}</TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                            <Input
                            type="number"
                            className="h-8 w-[100px] text-right"
                            value={row.rate_per_sqft || ""}
                            onChange={(e) => handleUpdate(row.unit_id, "rate_per_sqft", parseFloat(e.target.value) || 0)}
                            />
                        </div>
                      </TableCell>
                      <TableCell>
                         <div className="flex justify-end">
                            <Input
                              type="number"
                              className="h-8 w-[110px] text-right"
                              value={row.caic_charges || ""}
                              onChange={(e) => handleUpdate(row.unit_id, "caic_charges", parseFloat(e.target.value) || 0)}
                            />
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ₹{bsv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            className="h-8 w-[72px] text-right"
                            value={row.gst_rate ?? 5}
                            onChange={(e) => handleUpdate(row.unit_id, "gst_rate", parseFloat(e.target.value) || 0)}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        ₹{gst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                         <div className="flex justify-end">
                            <Input
                              type="number"
                              className="h-8 w-[110px] text-right"
                              value={row.maintenance_deposit || ""}
                              onChange={(e) => handleUpdate(row.unit_id, "maintenance_deposit", parseFloat(e.target.value) || 0)}
                            />
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-bold text-primary">
                        ₹{totalSaleValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {localData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={15} className="h-24 text-center">
                      No units found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default MasterPriceList;
