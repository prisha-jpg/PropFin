import React, { useState } from "react";
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
  Wallet,
  Plus,
  Trash2,
  AlertCircle
} from "lucide-react";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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

// --- INITIAL STATE DATA ---
const initialMasterList = [
  { id: 1, unit: "E-1011", type: "3 BHK", block: "Block 1", floor: "1", sba: 1509.56, rate: 11340 },
  { id: 2, unit: "F-1012", type: "3 BHK", block: "Block 1", floor: "1", sba: 1511.04, rate: 11340 },
  { id: 3, unit: "L-3011", type: "4.5 BHK", block: "Block 3", floor: "1", sba: 2987.09, rate: 11640 },
];

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
  const [activeTab, setActiveTab] = useState("master-pl");

  // --- STATE MANAGEMENT ---
  const [masterList, setMasterList] = useState(initialMasterList);
  const [paymentSchedule, setPaymentSchedule] = useState(initialPaymentSchedule);

  const [unitConfig, setUnitConfig] = useState({
    sba: 2987.09,
    rate: 10640,
    caic: 1500000,
    maintDeposit: 300000,
    gstRate: 5 // Editable GST Percentage
  });
  const [unitBreakdown, setUnitBreakdown] = useState(null);

  // --- TAB 1: MASTER LIST HANDLERS ---
  const updateMasterList = (id, field, value) => {
    setMasterList(prev => prev.map(row => 
      row.id === id ? { ...row, [field]: value } : row
    ));
  };

  const addMasterRow = () => {
    const newId = masterList.length ? Math.max(...masterList.map(r => r.id)) + 1 : 1;
    setMasterList([...masterList, { id: newId, unit: "", type: "", block: "", floor: "", sba: 0, rate: 0 }]);
  };

  const deleteMasterRow = (id) => {
    setMasterList(prev => prev.filter(row => row.id !== id));
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
          <Button onClick={() => toast({ title: "Saved!", description: "Configurations saved to database." })}>
            <Save className="w-4 h-4 mr-2" /> Save Configuration
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
                  Editable Excel-like grid. Add, update, or remove unit templates.
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
                    <TableHead className="text-right text-slate-500">Base Sale Value</TableHead>
                    <TableHead className="text-right text-blue-600">Total Value</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {masterList.map((row) => {
                    const bsv = (Number(row.sba) || 0) * (Number(row.rate) || 0);
                    const gst = bsv * 0.05;
                    const total = bsv > 0 ? bsv + gst + 300000 : 0; // Standard calc
                    return (
                      <TableRow key={row.id} className="hover:bg-slate-50/50 group">
                        <TableCell>
                          <Input value={row.unit} onChange={(e) => updateMasterList(row.id, 'unit', e.target.value)} className="h-8 border-transparent hover:border-slate-200 focus:border-blue-500" />
                        </TableCell>
                        <TableCell>
                          <Input value={row.type} onChange={(e) => updateMasterList(row.id, 'type', e.target.value)} className="h-8 border-transparent hover:border-slate-200 focus:border-blue-500" />
                        </TableCell>
                        <TableCell>
                          <Input value={row.block} onChange={(e) => updateMasterList(row.id, 'block', e.target.value)} className="h-8 border-transparent hover:border-slate-200 focus:border-blue-500" />
                        </TableCell>
                        <TableCell>
                          <Input value={row.floor} onChange={(e) => updateMasterList(row.id, 'floor', e.target.value)} className="h-8 border-transparent hover:border-slate-200 focus:border-blue-500" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={row.sba} onChange={(e) => updateMasterList(row.id, 'sba', e.target.value)} className="h-8 text-right font-medium border-transparent hover:border-slate-200 focus:border-blue-500" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={row.rate} onChange={(e) => updateMasterList(row.id, 'rate', e.target.value)} className="h-8 text-right border-transparent hover:border-slate-200 focus:border-blue-500" />
                        </TableCell>
                        <TableCell className="text-right text-slate-500 align-middle pr-4">₹{bsv.toLocaleString('en-IN')}</TableCell>
                        <TableCell className="text-right font-bold text-slate-800 align-middle pr-4">₹{total.toLocaleString('en-IN')}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => deleteMasterRow(row.id)} className="h-8 w-8 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
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