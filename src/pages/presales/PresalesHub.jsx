import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Building2, 
  FileSpreadsheet, 
  ListOrdered, 
  UploadCloud,
  Download,
  Calculator,
  Save,
  Settings2,
  CheckCircle2,
  Plus,
  Trash2,
  AlertCircle,
  Loader2
} from "lucide-react";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/api/apiClient";
import { resolvePricingField } from "@/lib/unitPricing";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const mapUnitsToMasterList = (units) =>
  (units || []).map((u) => {
    const p = u.unitPricing || {};
    const project = u.projects || {};
    return {
      unit_id: u.id,
      project_id: u.project_id,
      project_name: project.project_name || "",
      unit: u.unit_number,
      type: u.unit_type || "",
      block: u.blocks?.block_name || "",
      floor: String(u.floor_number ?? ""),
      sba: parseFloat(u.super_built_up_area || 0),
      rate: parseFloat(p.rate_per_sqft || 0),
      caic: resolvePricingField(p.caic_charges, project.default_caic_charges, 0, {
        treatZeroAsUnset: true,
      }),
      maintenance: resolvePricingField(
        p.maintenance_deposit,
        project.default_maintenance_deposit,
        300000,
      ),
      gst_rate: resolvePricingField(p.gst_rate, project.default_gst_rate, 5),
    };
  });

const initialPaymentSchedule = [
  { id: 1, name: "Booking Amount", percent: 10 },
  { id: 2, name: "Payable within 15 Days from Agreement Date", percent: 10 },
  { id: 3, name: "On Completion of Foundation Works", percent: 10 },
  { id: 4, name: "On Completion of Parking Level 2 Roof slab", percent: 5 },
  { id: 5, name: "On Completion of Parking Level 5 Roof slab", percent: 5 },
  { id: 6, name: "On Completion of Third Floor Roof slab", percent: 5 },
  { id: 7, name: "On Completion of Seventh Floor Roof slab", percent: 5 },
  { id: 8, name: "On Completion of Eleventh Floor Roof slab", percent: 5 },
  { id: 9, name: "On Completion of Fifteenth Floor Roof slab", percent: 5 },
  { id: 10, name: "On Completion of Terrace slab", percent: 5 },
  { id: 11, name: "On Completion of Internal Block Work", percent: 5 },
  { id: 12, name: "On Completion of Internal Plastering", percent: 5 },
  { id: 13, name: "On Completion of Internal Flooring", percent: 10 },
  { id: 14, name: "On Completion of Doors and Windows", percent: 10 },
  { id: 15, name: "On Handover - 5% on Basic Sale Value & Other Charges", percent: 5 },
];

export default function PresalesHub() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("master-pl");

  const { data: masterUnits, isLoading: isLoadingMaster } = useQuery({
    queryKey: ["master-price-list"],
    queryFn: () => apiClient.get("/pricing/master"),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiClient.entities.Project.list(),
  });

  const [masterList, setMasterList] = useState([]);
  const [paymentSchedule, setPaymentSchedule] = useState(initialPaymentSchedule);
  const [selectedProjectId, setSelectedProjectId] = useState("all");
  const [projectDefaults, setProjectDefaults] = useState({
    default_caic_charges: 1500000,
    default_maintenance_deposit: 300000,
    default_gst_rate: 5,
  });

  useEffect(() => {
    if (masterUnits) {
      setMasterList(mapUnitsToMasterList(masterUnits));
    }
  }, [masterUnits]);

  useEffect(() => {
    if (selectedProjectId === "all" || !projects.length) return;
    const project = projects.find((p) => p.id === selectedProjectId);
    if (project) {
      setProjectDefaults({
        default_caic_charges: Number(project.default_caic_charges ?? 1500000),
        default_maintenance_deposit: Number(project.default_maintenance_deposit ?? 300000),
        default_gst_rate: Number(project.default_gst_rate ?? 5),
      });
    }
  }, [selectedProjectId, projects]);

  const filteredMasterList =
    selectedProjectId === "all"
      ? masterList
      : masterList.filter((row) => row.project_id === selectedProjectId);

  const saveProjectDefaultsMutation = useMutation({
    mutationFn: ({ projectId, defaults }) =>
      apiClient.entities.Project.update(projectId, defaults),
    onSuccess: () => {
      toast({ title: "Saved!", description: "Project pricing defaults updated." });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["master-price-list"] });
    },
    onError: (err) => {
      toast({
        title: "Save Failed",
        description: err.message || "Could not save project defaults.",
        variant: "destructive",
      });
    },
  });

  const saveMasterMutation = useMutation({
    mutationFn: (prices) => apiClient.post("/pricing/master", { prices }),
    onSuccess: () => {
      toast({ title: "Saved!", description: "Master pricelist saved to database." });
      queryClient.invalidateQueries({ queryKey: ["master-price-list"] });
    },
    onError: (err) => {
      toast({
        title: "Save Failed",
        description: err.message || "Could not save master pricelist.",
        variant: "destructive",
      });
    },
  });

  const handleSaveConfiguration = () => {
    if (activeTab === "master-pl") {
      const payload = masterList
        .filter((row) => row.unit_id)
        .map((row) => {
          const bsv = Number(row.sba) * Number(row.rate) + Number(row.caic || 0);
          const gstRate = Number(row.gst_rate ?? 5);
          const gstAmount = bsv * (gstRate / 100);
          const maintenance = Number(row.maintenance || 300000);
          return {
            unit_id: row.unit_id,
            sba: Number(row.sba),
            unit_type: row.type,
            floor_number: row.floor,
            rate_per_sqft: Number(row.rate),
            caic_charges: Number(row.caic || 0),
            maintenance_deposit: maintenance,
            gst_rate: gstRate,
            basic_sale_value: bsv,
            total_sale_value: bsv + gstAmount + maintenance,
          };
        });
      saveMasterMutation.mutate(payload);
    } else {
      toast({ title: "Saved!", description: "Configuration saved locally." });
    }
  };

  const [unitConfig, setUnitConfig] = useState({
    sba: 2987.09,
    rate: 10640,
    caic: 1500000,
    maintDeposit: 300000,
    gstRate: 5 // Editable GST Percentage
  });
  const [unitBreakdown, setUnitBreakdown] = useState(null);

  const updateMasterList = (unitId, field, value) => {
    setMasterList((prev) =>
      prev.map((row) => (row.unit_id === unitId ? { ...row, [field]: value } : row)),
    );
  };

  const handleSaveProjectDefaults = () => {
    if (selectedProjectId === "all") {
      toast({
        title: "Select a project",
        description: "Choose a project to save its pricing defaults.",
        variant: "destructive",
      });
      return;
    }
    saveProjectDefaultsMutation.mutate({
      projectId: selectedProjectId,
      defaults: {
        default_caic_charges: Number(projectDefaults.default_caic_charges) || 0,
        default_maintenance_deposit: Number(projectDefaults.default_maintenance_deposit) || 300000,
        default_gst_rate: Number(projectDefaults.default_gst_rate) || 5,
      },
    });
  };

  const handleApplyProjectDefaults = () => {
    if (selectedProjectId === "all") {
      toast({
        title: "Select a project",
        description: "Choose a project to apply defaults to its units.",
        variant: "destructive",
      });
      return;
    }
    const caic = Number(projectDefaults.default_caic_charges) || 0;
    const maintenance = Number(projectDefaults.default_maintenance_deposit) || 300000;
    const gstRate = Number(projectDefaults.default_gst_rate) || 5;
    setMasterList((prev) =>
      prev.map((row) =>
        row.project_id === selectedProjectId
          ? { ...row, caic, maintenance, gst_rate: gstRate }
          : row,
      ),
    );
    toast({
      title: "Defaults applied",
      description: "CAIC, GST, and maintenance values applied to all units in this project.",
    });
  };

  const addMasterRow = () => {
    toast({
      title: "Add units in Setup",
      description: "New units must be created in the inventory first, then priced here.",
    });
  };

  const deleteMasterRow = () => {
    toast({
      title: "Cannot remove",
      description: "Units are managed in inventory. Edit pricing values here instead.",
    });
  };

  // --- TAB 2: UNITWISE CALCULATION HANDLER ---
  const handleCalculateUnitwise = () => {
    const { sba, rate, caic, maintDeposit, gstRate } = unitConfig;
    const bsv = Number(sba) * Number(rate);
    const agreementValue = bsv + Number(caic);
    const gst = agreementValue * (Number(gstRate) / 100);
    const total = agreementValue + gst + Number(maintDeposit);

    setUnitBreakdown({ bsv, agreementValue, gst, maintDeposit, total, gstRate });
    toast({ title: "Price Sheet Generated", description: "Unitwise math calculated successfully." });
  };

  // --- TAB 3: PAYMENT SCHEDULE HANDLERS ---
  const updateSchedule = (id, field, value) => {
    setPaymentSchedule(prev => prev.map(row => 
      row.id === id ? { ...row, [field]: field === 'percent' ? Number(value) : value } : row
    ));
  };

  const addScheduleRow = () => {
    const newId = paymentSchedule.length ? Math.max(...paymentSchedule.map(r => r.id)) + 1 : 1;
    setPaymentSchedule([...paymentSchedule, { id: newId, name: "New Milestone", percent: 0 }]);
  };

  const deleteScheduleRow = (id) => {
    setPaymentSchedule(prev => prev.filter(row => row.id !== id));
  };

  const totalSchedulePercent = paymentSchedule.reduce((sum, row) => sum + (Number(row.percent) || 0), 0);
  const isScheduleValid = totalSchedulePercent === 100;

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Presales Configurator</h1>
          <p className="text-slate-500 mt-1">Dynamically edit Master Pricelists, Unit configurations, and Billing Schedules.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="bg-white">
            <Download className="w-4 h-4 mr-2" /> Export
          </Button>
          <Button
            onClick={handleSaveConfiguration}
            disabled={saveMasterMutation.isPending}
          >
            {saveMasterMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Configuration
          </Button>
        </div>
      </div>

      {/* Tabs Layout */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-14 bg-slate-100/80 p-1">
          <TabsTrigger value="master-pl" className="text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <FileSpreadsheet className="w-4 h-4 mr-2 text-blue-600" />
            Master Pricelist
          </TabsTrigger>
          <TabsTrigger value="unit-pl" className="text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Calculator className="w-4 h-4 mr-2 text-emerald-600" />
            Unitwise Pricelist
          </TabsTrigger>
          <TabsTrigger value="payment-schedule" className="text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <ListOrdered className="w-4 h-4 mr-2 text-amber-600" />
            Payment Schedule
          </TabsTrigger>
        </TabsList>

        {/* ================================================================= */}
        {/* SUB-TAB 1: MASTER PRICELIST */}
        {/* ================================================================= */}
        <TabsContent value="master-pl" className="mt-6 focus-visible:outline-none">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-white pb-6 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl text-slate-800">Master Pricelist Data</CardTitle>
                <CardDescription className="mt-1">
                  Editable Excel-like grid. Set project defaults or edit each unit row.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" className="bg-slate-100 text-slate-700 hover:bg-slate-200">
                  <UploadCloud className="w-4 h-4 mr-2" /> Bulk Upload CSV
                </Button>
                <Button onClick={addMasterRow} className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="w-4 h-4 mr-2" /> Add Row
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-4 flex flex-col lg:flex-row lg:items-end gap-4">
                <div className="space-y-1.5">
                  <Label>Project</Label>
                  <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                    <SelectTrigger className="w-[220px] bg-white">
                      <SelectValue placeholder="All projects" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Projects</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.project_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>CAIC Charges (Project Default)</Label>
                  <Input
                    type="number"
                    className="w-[160px] bg-white"
                    value={projectDefaults.default_caic_charges}
                    onChange={(e) =>
                      setProjectDefaults((prev) => ({
                        ...prev,
                        default_caic_charges: e.target.value,
                      }))
                    }
                    disabled={selectedProjectId === "all"}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>GST % (Project Default)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    className="w-[100px] bg-white"
                    value={projectDefaults.default_gst_rate}
                    onChange={(e) =>
                      setProjectDefaults((prev) => ({
                        ...prev,
                        default_gst_rate: e.target.value,
                      }))
                    }
                    disabled={selectedProjectId === "all"}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Maint. Deposit (Project Default)</Label>
                  <Input
                    type="number"
                    className="w-[160px] bg-white"
                    value={projectDefaults.default_maintenance_deposit}
                    onChange={(e) =>
                      setProjectDefaults((prev) => ({
                        ...prev,
                        default_maintenance_deposit: e.target.value,
                      }))
                    }
                    disabled={selectedProjectId === "all"}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="bg-white"
                    onClick={handleSaveProjectDefaults}
                    disabled={selectedProjectId === "all" || saveProjectDefaultsMutation.isPending}
                  >
                    Save Project Defaults
                  </Button>
                  <Button
                    variant="secondary"
                    className="bg-blue-50 text-blue-700 hover:bg-blue-100"
                    onClick={handleApplyProjectDefaults}
                    disabled={selectedProjectId === "all"}
                  >
                    Apply to All Units
                  </Button>
                </div>
              </div>
            </CardContent>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="w-[120px]">Unit No.</TableHead>
                    <TableHead className="w-[120px]">Type</TableHead>
                    <TableHead className="w-[120px]">Block</TableHead>
                    <TableHead className="w-[100px]">Floor</TableHead>
                    <TableHead className="w-[120px] text-right">SBA (Sq.Ft)</TableHead>
                    <TableHead className="w-[120px] text-right">Rate (₹)</TableHead>
                    <TableHead className="w-[140px] text-right">CAIC Charges</TableHead>
                    <TableHead className="text-right text-slate-500">Base Sale Value</TableHead>
                    <TableHead className="w-[100px] text-right">GST (%)</TableHead>
                    <TableHead className="text-right text-slate-500">GST Charges</TableHead>
                    <TableHead className="w-[150px] text-right">Maint. Deposit</TableHead>
                    <TableHead className="text-right text-blue-600">Total Value</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingMaster ? (
                    <TableRow>
                      <TableCell colSpan={13} className="h-24 text-center">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                      </TableCell>
                    </TableRow>
                  ) : filteredMasterList.map((row) => {
                    const bsv = (Number(row.sba) || 0) * (Number(row.rate) || 0) + (Number(row.caic) || 0);
                    const gstRate = Number(row.gst_rate ?? 5);
                    const gst = bsv * (gstRate / 100);
                    const maintenance = Number(row.maintenance) || 300000;
                    const total = bsv > 0 ? bsv + gst + maintenance : 0;
                    return (
                      <TableRow key={row.unit_id} className="hover:bg-slate-50/50 group">
                        <TableCell className="font-medium">{row.unit}</TableCell>
                        <TableCell>
                          <Input value={row.type} onChange={(e) => updateMasterList(row.unit_id, "type", e.target.value)} className="h-8 border-transparent hover:border-slate-200 focus:border-blue-500" />
                        </TableCell>
                        <TableCell>{row.block}</TableCell>
                        <TableCell>
                          <Input value={row.floor} onChange={(e) => updateMasterList(row.unit_id, "floor", e.target.value)} className="h-8 border-transparent hover:border-slate-200 focus:border-blue-500" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" step="0.01" value={row.sba} onChange={(e) => updateMasterList(row.unit_id, "sba", e.target.value)} className="h-8 text-right font-medium border-transparent hover:border-slate-200 focus:border-blue-500" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={row.rate} onChange={(e) => updateMasterList(row.unit_id, "rate", e.target.value)} className="h-8 text-right border-transparent hover:border-slate-200 focus:border-blue-500" />
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            <Input
                              type="number"
                              value={row.caic ?? ""}
                              onChange={(e) => updateMasterList(row.unit_id, "caic", e.target.value)}
                              className="h-8 w-[130px] text-right border-transparent hover:border-slate-200 focus:border-blue-500"
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-slate-500 align-middle pr-4">₹{bsv.toLocaleString("en-IN")}</TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row.gst_rate ?? 5}
                              onChange={(e) => updateMasterList(row.unit_id, "gst_rate", e.target.value)}
                              className="h-8 w-[72px] text-right border-transparent hover:border-slate-200 focus:border-blue-500"
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-slate-500 align-middle pr-4">₹{gst.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            <Input
                              type="number"
                              value={row.maintenance ?? 300000}
                              onChange={(e) => updateMasterList(row.unit_id, "maintenance", e.target.value)}
                              className="h-8 w-[120px] text-right border-transparent hover:border-slate-200 focus:border-blue-500"
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-bold text-slate-800 align-middle pr-4">₹{total.toLocaleString("en-IN")}</TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    );
                  })}
                  {!isLoadingMaster && filteredMasterList.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={13} className="h-24 text-center text-slate-500">
                        No units found. Add units to inventory and configure pricing.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================= */}
        {/* SUB-TAB 2: UNITWISE PRICELIST */}
        {/* ================================================================= */}
        <TabsContent value="unit-pl" className="mt-6 focus-visible:outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <Card className="lg:col-span-4 border-slate-200 shadow-sm h-fit">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                <CardTitle className="text-lg flex items-center text-slate-800">
                  <Settings2 className="w-5 h-5 mr-2 text-slate-500" />
                  Dynamic Unit Config
                </CardTitle>
                <CardDescription>Adjust variables freely to calculate.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 pt-6">
                <div className="space-y-1.5">
                  <Label>Super Built-Up Area (SBA)</Label>
                  <div className="relative">
                    <Input type="number" value={unitConfig.sba} onChange={(e) => setUnitConfig({...unitConfig, sba: e.target.value})} className="pr-12" />
                    <span className="absolute right-3 top-2 text-xs text-slate-400 font-medium">Sq.Ft</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Applied Rate / Sq.Ft</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-500">₹</span>
                    <Input type="number" value={unitConfig.rate} onChange={(e) => setUnitConfig({...unitConfig, rate: e.target.value})} className="pl-7" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>CAIC Charges</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-500">₹</span>
                    <Input type="number" value={unitConfig.caic} onChange={(e) => setUnitConfig({...unitConfig, caic: e.target.value})} className="pl-7" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Maintenance Deposit</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-500">₹</span>
                    <Input type="number" value={unitConfig.maintDeposit} onChange={(e) => setUnitConfig({...unitConfig, maintDeposit: e.target.value})} className="pl-7" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>GST Percentage</Label>
                  <div className="relative">
                    <Input type="number" value={unitConfig.gstRate} onChange={(e) => setUnitConfig({...unitConfig, gstRate: e.target.value})} className="pr-8" />
                    <span className="absolute right-3 top-2 text-slate-500">%</span>
                  </div>
                </div>
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 mt-2" size="lg" onClick={handleCalculateUnitwise}>
                  <Calculator className="w-4 h-4 mr-2" /> Calculate Final Sheet
                </Button>
              </CardContent>
            </Card>

            <Card className="lg:col-span-8 border-slate-200 shadow-sm bg-slate-50/30">
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="text-xl text-slate-800">Final Price Sheet Breakdown</CardTitle>
                <CardDescription>Official breakdown generated from your inputs.</CardDescription>
              </CardHeader>
              <CardContent className="pt-8">
                {!unitBreakdown ? (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-white">
                    <Building2 className="w-12 h-12 mb-4 opacity-20" />
                    <p>Enter unit details and click generate to view breakdown.</p>
                  </div>
                ) : (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-slate-500 font-medium">Basic Sale Value (BSV)</span>
                        <span className="text-lg font-semibold">₹{unitBreakdown.bsv.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-100">
                        <span className="text-slate-500 font-medium">CAIC Charges</span>
                        <span className="text-lg font-semibold">₹{Number(unitConfig.caic).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-700 font-bold">Agreement Value</span>
                        <span className="text-2xl font-bold text-blue-700">₹{unitBreakdown.agreementValue.toLocaleString('en-IN')}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <p className="text-slate-500 font-medium mb-2">Goods & Services Tax ({unitBreakdown.gstRate}%)</p>
                        <p className="text-3xl font-light text-slate-800">₹{unitBreakdown.gst.toLocaleString('en-IN')}</p>
                      </div>
                      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <p className="text-slate-500 font-medium mb-2">Maintenance Deposit</p>
                        <p className="text-3xl font-light text-slate-800">₹{unitBreakdown.maintDeposit.toLocaleString('en-IN')}</p>
                      </div>
                    </div>

                    <div className="bg-slate-900 p-8 rounded-xl shadow-lg flex flex-col md:flex-row md:items-center justify-between">
                      <div className="flex items-center gap-4 mb-4 md:mb-0">
                        <div className="bg-emerald-500/20 p-3 rounded-full">
                          <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-slate-300 font-medium">Total Sale Value</p>
                          <p className="text-sm text-slate-400">Excluding Registration & Stamp Duty</p>
                        </div>
                      </div>
                      <p className="text-4xl font-bold text-white tracking-tight">
                        ₹{unitBreakdown.total.toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================================================================= */}
        {/* SUB-TAB 3: PAYMENT SCHEDULE */}
        {/* ================================================================= */}
        <TabsContent value="payment-schedule" className="mt-6 focus-visible:outline-none">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-white pb-6 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl text-slate-800">Custom Payment Schedule Editor</CardTitle>
                <CardDescription className="mt-1">
                  Add or edit construction milestones. The total must strictly equal 100%.
                </CardDescription>
              </div>
              <Button onClick={addScheduleRow} className="bg-amber-600 hover:bg-amber-700">
                <Plus className="w-4 h-4 mr-2" /> Add Milestone
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="w-[80px]">Step</TableHead>
                    <TableHead>Milestone Description</TableHead>
                    <TableHead className="text-right w-[150px]">Allocation (%)</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentSchedule.map((row, index) => (
                    <TableRow key={row.id} className="group hover:bg-slate-50/50 transition-colors">
                      <TableCell className="font-medium text-slate-500 pl-4">#{index + 1}</TableCell>
                      <TableCell>
                        <Input 
                          value={row.name} 
                          onChange={(e) => updateSchedule(row.id, 'name', e.target.value)}
                          className="h-9 border-transparent bg-transparent hover:border-slate-200 focus:border-amber-500 focus:bg-white"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="relative">
                          <Input 
                            type="number" 
                            value={row.percent} 
                            onChange={(e) => updateSchedule(row.id, 'percent', e.target.value)}
                            className="h-9 text-right pr-8 font-medium border-transparent bg-transparent hover:border-slate-200 focus:border-amber-500 focus:bg-white" 
                          />
                          <span className="absolute right-3 top-2 text-slate-400">%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => deleteScheduleRow(row.id)} className="h-8 w-8 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  
                  {/* Dynamic Validation Row */}
                  <TableRow className={isScheduleValid ? "bg-emerald-50/50" : "bg-red-50/50"}>
                    <TableCell colSpan={2} className="text-right font-bold text-slate-700 py-6">
                      <div className="flex items-center justify-end gap-2">
                        {!isScheduleValid && <AlertCircle className="w-4 h-4 text-red-500" />}
                        TOTAL ALLOCATION
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge className={isScheduleValid ? "bg-emerald-500 hover:bg-emerald-600 text-sm px-4 py-1" : "bg-red-500 hover:bg-red-600 text-sm px-4 py-1"}>
                        {totalSchedulePercent}%
                      </Badge>
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}