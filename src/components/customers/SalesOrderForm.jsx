import React, { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  Calculator, 
  Save, 
  Loader2, 
  CheckCircle2, 
  Building2, 
  UserCircle, 
  Wallet,
  FileText
} from "lucide-react";
import { apiClient } from "@/api/apiClient";
import { calculateUnitPricing, resolvePricingField } from "@/lib/unitPricing";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const getLocalDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formSchema = z.object({
  customer_id: z.string().min(36, "Please select a valid Customer"),
  project_id: z.string().min(36, "Please select a valid Project"),
  unit_id: z.string().min(36, "Please select a valid Unit"),
  booking_date: z.string().min(1, "Booking Date is required"),
  sba: z.coerce.number().min(1, "Super Built-Up Area must be greater than 0"),
  rate_per_sqft: z.coerce.number().min(1, "Rate per sqft is required"),
  caic_charges: z.coerce.number().default(0),
  maintenance_deposit: z.coerce.number().default(300000),
  gst_rate: z.coerce.number().min(0).max(100).default(5),
  discount_per_sqft: z.coerce.number().min(0, "Discount cannot be negative").default(0),
  basic_sale_value: z.coerce.number().min(1, "Please calculate the price first"),
  total_value: z.coerce.number().min(1, "Please calculate the price first"),
});

export default function SalesOrderForm({ onSuccess, onCancel }) {
  const { toast } = useToast();
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingMaster, setIsLoadingMaster] = useState(true);

  const [customers, setCustomers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [masterUnits, setMasterUnits] = useState([]);
  const [priceBreakdown, setPriceBreakdown] = useState(null);
  const [selectedUnitMeta, setSelectedUnitMeta] = useState(null);

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customer_id: "",
      project_id: "",
      unit_id: "",
      booking_date: getLocalDateString(),
      sba: "",
      rate_per_sqft: "",
      caic_charges: 0,
      maintenance_deposit: 300000,
      gst_rate: 5,
      discount_per_sqft: 0,
      basic_sale_value: 0,
      total_value: 0,
    },
  });

  const watchedSba = form.watch("sba");
  const watchedDiscountPerSqft = form.watch("discount_per_sqft");
  const computedDiscountTotal =
    (Number(watchedSba) || 0) * (Number(watchedDiscountPerSqft) || 0);

  const formatCurrency = (value) =>
    `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  const formatArea = (value) =>
    Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

  const selectedProjectId = form.watch("project_id");

  const filteredUnits = selectedProjectId
    ? masterUnits.filter((u) => u.project_id === selectedProjectId)
    : masterUnits;

  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        setIsLoadingMaster(true);
        const [custRes, projRes, masterRes] = await Promise.all([
          apiClient.entities.Customer.list(),
          apiClient.entities.Project.list(),
          apiClient.get("/pricing/master"),
        ]);

        setCustomers(Array.isArray(custRes) ? custRes : custRes?.data || []);
        setProjects(Array.isArray(projRes) ? projRes : projRes?.data || []);
        setMasterUnits(Array.isArray(masterRes) ? masterRes : []);
      } catch (error) {
        console.error("Failed to load dropdown data:", error);
        toast({
          title: "Load Failed",
          description: "Could not load customers, projects, or master price list.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingMaster(false);
      }
    };
    fetchDropdownData();
  }, [toast]);

  const applyPricingBreakdown = useCallback(
    (data) => {
      setPriceBreakdown(data);
      form.setValue("basic_sale_value", parseFloat(data.basic_sale_value), { shouldValidate: true });
      form.setValue("total_value", parseFloat(data.total_sale_value), { shouldValidate: true });
    },
    [form],
  );

  const runPricingCalculation = useCallback(
    ({ sba, rate, caic, maintenance, discountPerSqft, gstRate }) => {
      const grossBsv = Number(sba) * Number(rate);
      const discountTotal = Number(discountPerSqft) * Number(sba);
      if (discountTotal > grossBsv) {
        toast({
          title: "Invalid Discount",
          description: "Total discount (Discount/Sq.Ft × SBA) cannot exceed gross basic sale value.",
          variant: "destructive",
        });
        return null;
      }
      return calculateUnitPricing({
        sba,
        rate_per_sqft: rate,
        caic_charges: caic,
        maintenance_deposit: maintenance,
        discount_per_sqft: discountPerSqft,
        gst_rate: gstRate,
      });
    },
    [toast],
  );

  const handleCalculatePrice = useCallback(() => {
    const sba = form.getValues("sba");
    const rate = form.getValues("rate_per_sqft");
    const caic = form.getValues("caic_charges");
    const maintenance = form.getValues("maintenance_deposit");
    const gstRate = Number(form.getValues("gst_rate")) || 5;
    const discountPerSqft = Number(form.getValues("discount_per_sqft")) || 0;

    if (!sba || !rate) {
      toast({
        title: "Missing Data",
        description: "Please select a unit with master pricelist data first.",
        variant: "destructive",
      });
      return;
    }

    setIsCalculating(true);
    const data = runPricingCalculation({ sba, rate, caic, maintenance, discountPerSqft, gstRate });
    if (data) {
      applyPricingBreakdown(data);
    }
    setIsCalculating(false);
  }, [form, toast, runPricingCalculation, applyPricingBreakdown]);

  const handleUnitChange = useCallback(
    async (unitId) => {
      form.setValue("unit_id", unitId);
      setPriceBreakdown(null);

      const unitData = masterUnits.find((u) => u.id === unitId);
      if (!unitData) return;

      const pricing = unitData.unitPricing || {};
      const project = unitData.projects || {};
      const sba = parseFloat(unitData.super_built_up_area || 0);
      const rate = parseFloat(pricing.rate_per_sqft || unitData.base_price || 0);
      const caic = resolvePricingField(
        pricing.caic_charges,
        project.default_caic_charges,
        0,
        { treatZeroAsUnset: true },
      );
      const maintenance = resolvePricingField(
        pricing.maintenance_deposit,
        project.default_maintenance_deposit,
        300000,
      );
      const gstRate = resolvePricingField(pricing.gst_rate, project.default_gst_rate, 5);

      setSelectedUnitMeta({
        unit_number: unitData.unit_number,
        unit_type: unitData.unit_type,
        block: unitData.blocks?.block_name,
        sba,
        rate,
        caic,
        gst_rate: gstRate,
        maintenance,
      });

      if (unitData.project_id) {
        form.setValue("project_id", unitData.project_id);
      }

      form.setValue("sba", sba || "");
      form.setValue("rate_per_sqft", rate || "");
      form.setValue("caic_charges", caic);
      form.setValue("maintenance_deposit", maintenance);
      form.setValue("gst_rate", gstRate);
      form.setValue("discount_per_sqft", 0);
      form.setValue("basic_sale_value", 0);
      form.setValue("total_value", 0);

      if (!sba || !rate) {
        toast({
          title: "Pricing Not Configured",
          description: `Unit ${unitData.unit_number} has no master pricelist entry. Configure it in Presales Configurator.`,
          variant: "destructive",
        });
        return;
      }

      try {
        setIsCalculating(true);
        const data = runPricingCalculation({
          sba,
          rate,
          caic,
          maintenance,
          discountPerSqft: 0,
          gstRate,
        });
        if (data) {
          applyPricingBreakdown(data);
        }
      } catch (error) {
        toast({
          title: "Auto-calculation Failed",
          description: error.message || "Could not calculate pricing for this unit.",
          variant: "destructive",
        });
      } finally {
        setIsCalculating(false);
      }
    },
    [form, masterUnits, toast, runPricingCalculation, applyPricingBreakdown],
  );

  const handleProjectChange = (projectId) => {
    form.setValue("project_id", projectId);
    const currentUnitId = form.getValues("unit_id");
    if (currentUnitId) {
      const unitStillValid = masterUnits.some(
        (u) => u.id === currentUnitId && u.project_id === projectId,
      );
      if (!unitStillValid) {
        form.setValue("unit_id", "");
        form.setValue("sba", "");
        form.setValue("rate_per_sqft", "");
        form.setValue("caic_charges", 0);
        form.setValue("maintenance_deposit", 300000);
        form.setValue("gst_rate", 5);
        form.setValue("discount_per_sqft", 0);
        form.setValue("basic_sale_value", 0);
        form.setValue("total_value", 0);
        setPriceBreakdown(null);
        setSelectedUnitMeta(null);
      }
    }
  };

  const onSubmit = async (values) => {
    try {
      setIsSubmitting(true);

      const mockOrderNumber = `SO-${Math.floor(Date.now() / 1000)}`;

      const orderPayload = {
        order_number: mockOrderNumber,
        customer_id: values.customer_id,
        project_id: values.project_id,
        unit_id: values.unit_id,
        sba: values.sba,
        rate_per_sqft: values.rate_per_sqft,
        net_bsv: priceBreakdown
          ? parseFloat(priceBreakdown.net_bsv)
          : values.basic_sale_value,
        additional_value: values.caic_charges + values.maintenance_deposit,
        discount: computedDiscountTotal,
        discount_per_sqft: values.discount_per_sqft || 0,
        gst_amount: priceBreakdown ? parseFloat(priceBreakdown.gst_amount) : 0,
        booking_date: new Date(values.booking_date).toISOString(),
        status: "open_order",
      };

      const orderRes = await apiClient.post("/entities/SalesOrder", orderPayload);
      const newOrderId = orderRes.id;
      const orderTotal = Number(orderRes.total_value ?? values.total_value);

      await apiClient.post("/pricing/generate-schedule", {
        sales_order_id: newOrderId,
        total_value: orderTotal,
      });

      toast({
        title: "Order Generated Successfully",
        description: "Sales Order and 15-step payment schedule have been mapped.",
      });

      form.reset();
      setPriceBreakdown(null);
      setSelectedUnitMeta(null);
      if (onSuccess) onSuccess();
    } catch (error) {
      toast({
        title: "Submission Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-5xl mx-auto shadow-sm border-slate-200">
      <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <CardTitle className="text-2xl text-slate-800">New Sales Order</CardTitle>
            <CardDescription className="text-slate-500 mt-1">
              Configure unit pricing, link the customer, and generate billing schedules.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-8">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-10">

            {/* --- SECTION 1: ENTITY SELECTION --- */}
            <div className="space-y-5">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <UserCircle className="w-4 h-4 text-slate-400" />
                1. Order Allocation
              </h3>
              <div className="bg-white border border-slate-200 rounded-xl p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 shadow-sm">
                <FormField control={form.control} name="customer_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-600">Customer Profile</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-slate-50">
                          <SelectValue placeholder="Select a Customer" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.first_name} {c.last_name || ""} ({c.customer_code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="project_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-600">Project</FormLabel>
                    <Select onValueChange={handleProjectChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-slate-50">
                          <SelectValue placeholder="Select a Project" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.project_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="unit_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-600">Unit Allocation</FormLabel>
                    <Select
                      onValueChange={handleUnitChange}
                      value={field.value}
                      disabled={isLoadingMaster}
                    >
                      <FormControl>
                        <SelectTrigger className="bg-slate-50">
                          <SelectValue placeholder={isLoadingMaster ? "Loading units..." : "Select a Unit"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {filteredUnits.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.unit_number} - {u.status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="booking_date" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-600">Booking Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        className="bg-slate-50 h-11"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            {/* --- SECTION 2: PRICING CONFIGURATION --- */}
            <div className="space-y-5">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-400" />
                2. Pricing Configuration
              </h3>

              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                {selectedUnitMeta ? (
                  <div className="px-6 py-4 bg-emerald-50 border-b border-emerald-100 flex flex-wrap items-center gap-x-6 gap-y-1">
                    <p className="text-sm font-semibold text-emerald-900">
                      {selectedUnitMeta.unit_number}
                      {selectedUnitMeta.unit_type ? ` · ${selectedUnitMeta.unit_type}` : ""}
                      {selectedUnitMeta.block ? ` · ${selectedUnitMeta.block}` : ""}
                    </p>
                    <p className="text-xs text-emerald-700">
                      Loaded from Master Pricelist — SBA {formatArea(selectedUnitMeta.sba)} sq.ft @ {formatCurrency(selectedUnitMeta.rate)}/sq.ft
                    </p>
                  </div>
                ) : (
                  <div className="px-6 py-4 bg-slate-50 border-b border-slate-100">
                    <p className="text-sm text-slate-500">Select a unit to load pricing from the Master Pricelist.</p>
                  </div>
                )}

                <div className="p-6 space-y-8">
                  {/* Master pricelist values — read-only display */}
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Master Pricelist Values</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                      <FormField control={form.control} name="sba" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-600">Super Built-Up Area</FormLabel>
                          <div className="h-11 px-4 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 tabular-nums">
                            <span className="font-medium text-slate-800">{formatArea(field.value) || "—"}</span>
                            <span className="text-xs text-slate-400 font-medium">Sq.Ft</span>
                          </div>
                          <input type="hidden" {...field} />
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="rate_per_sqft" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-600">Applied Rate</FormLabel>
                          <div className="h-11 px-4 flex items-center rounded-md border border-slate-200 bg-slate-50 tabular-nums font-medium text-slate-800">
                            {field.value ? formatCurrency(field.value) : "—"}
                            <span className="text-xs text-slate-400 ml-1">/sq.ft</span>
                          </div>
                          <input type="hidden" {...field} />
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="caic_charges" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-600">CAIC Charges</FormLabel>
                          <div className="h-11 px-4 flex items-center rounded-md border border-slate-200 bg-slate-50 tabular-nums font-medium text-slate-800">
                            {formatCurrency(field.value)}
                          </div>
                          <input type="hidden" {...field} />
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="gst_rate" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-600">GST Rate</FormLabel>
                          <div className="h-11 px-4 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 tabular-nums font-medium text-slate-800">
                            <span>{field.value ?? 5}%</span>
                            <span className="text-xs text-slate-400">on BSV</span>
                          </div>
                          <input type="hidden" {...field} />
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="maintenance_deposit" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-600">Maint. Deposit (Fixed)</FormLabel>
                          <div className="h-11 px-4 flex items-center rounded-md border border-slate-200 bg-slate-100 tabular-nums font-medium text-slate-600">
                            {formatCurrency(field.value)}
                          </div>
                          <input type="hidden" {...field} />
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </div>

                  <Separator />

                  {/* Discount — editable, calculated on SBA */}
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Negotiated Discount</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <FormField control={form.control} name="discount_per_sqft" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-600">Discount per Sq.Ft</FormLabel>
                          <div className="relative">
                            <span className="absolute left-3 top-3 text-slate-500 text-sm">₹</span>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                step="1"
                                className="pl-7 h-11 tabular-nums"
                                placeholder="0"
                                {...field}
                                onChange={(e) => {
                                  field.onChange(e);
                                  setPriceBreakdown(null);
                                  form.setValue("basic_sale_value", 0);
                                  form.setValue("total_value", 0);
                                }}
                              />
                            </FormControl>
                          </div>
                          <p className="text-xs text-slate-400 mt-1">Rate reduction applied per sq.ft of SBA</p>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <div>
                        <p className="text-sm font-medium text-slate-600 mb-2">Total Discount Amount</p>
                        <div className="h-11 px-4 flex items-center rounded-md border border-emerald-200 bg-emerald-50 tabular-nums font-semibold text-emerald-800">
                          {computedDiscountTotal > 0 ? `− ${formatCurrency(computedDiscountTotal)}` : formatCurrency(0)}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          {watchedDiscountPerSqft > 0 && watchedSba
                            ? `${formatCurrency(watchedDiscountPerSqft)}/sq.ft × ${formatArea(watchedSba)} sq.ft`
                            : "Discount/Sq.Ft × SBA"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-600 mb-2">Effective Rate after Discount</p>
                        <div className="h-11 px-4 flex items-center rounded-md border border-slate-200 bg-slate-50 tabular-nums font-medium text-slate-800">
                          {form.watch("rate_per_sqft")
                            ? formatCurrency(Math.max(0, Number(form.watch("rate_per_sqft")) - Number(watchedDiscountPerSqft || 0)))
                            : "—"}
                          <span className="text-xs text-slate-400 ml-1">/sq.ft</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full md:w-auto px-8 bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                      onClick={handleCalculatePrice}
                      disabled={isCalculating || !form.watch("unit_id")}
                    >
                      {isCalculating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4 text-slate-500" />}
                      Calculate Final Pricing
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* --- SECTION 3: INVOICE SUMMARY --- */}
            {priceBreakdown && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-5">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-slate-400" />
                  3. Financial Summary
                </h3>

                <div className="bg-[#f8fafc] border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    {Number(priceBreakdown.discount) > 0 && (
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-slate-500">Gross BSV (Before Discount)</p>
                        <p className="text-xl font-semibold text-slate-800 tracking-tight">
                          ₹{Number(priceBreakdown.gross_bsv).toLocaleString("en-IN")}
                        </p>
                      </div>
                    )}
                    {Number(priceBreakdown.discount) > 0 && (
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-slate-500">Discount ({formatCurrency(priceBreakdown.discount_per_sqft)}/sq.ft × {formatArea(watchedSba)} sq.ft)</p>
                        <p className="text-xl font-semibold text-emerald-700 tracking-tight">
                          − {formatCurrency(priceBreakdown.discount)}
                        </p>
                      </div>
                    )}
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-500">
                        Basic Sale Value (BSV){Number(priceBreakdown.discount) > 0 ? " — after discount" : ""}
                      </p>
                      <p className="text-xl font-semibold text-slate-800 tracking-tight">
                        {formatCurrency(priceBreakdown.basic_sale_value)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-500">
                        Goods & Services Tax ({priceBreakdown.gst_rate ?? form.getValues("gst_rate") ?? 5}% on BSV)
                      </p>
                      <p className="text-xl font-semibold text-slate-800 tracking-tight">
                        {formatCurrency(priceBreakdown.gst_amount)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-500">Additional Deposits (Maint + CAIC)</p>
                      <p className="text-xl font-semibold text-slate-800 tracking-tight">
                        ₹{(Number(priceBreakdown.maintenance_deposit) + Number(priceBreakdown.caic_charges)).toLocaleString("en-IN")}
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-800 text-white p-6 flex flex-col md:flex-row md:items-center justify-between">
                    <div className="flex items-center gap-3 mb-4 md:mb-0">
                      <div className="bg-emerald-500/20 p-2 rounded-full">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-slate-300 text-sm font-medium">Total Sale Value</p>
                        <p className="text-xs text-slate-400">Including all taxes and fixed deposits</p>
                      </div>
                    </div>
                    <p className="text-3xl md:text-4xl font-bold tracking-tight">
                      ₹{Number(priceBreakdown.total_sale_value).toLocaleString("en-IN")}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <FormField control={form.control} name="basic_sale_value" render={({ field }) => <input type="hidden" {...field} />} />
            <FormField control={form.control} name="total_value" render={({ field }) => <input type="hidden" {...field} />} />

            <Separator className="bg-slate-200" />

            <div className="flex items-center justify-end gap-4 pt-2 pb-4">
              {onCancel && (
                <Button type="button" variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={() => { form.reset(); setPriceBreakdown(null); setSelectedUnitMeta(null); }}>
                Reset Form
              </Button>
              <Button
                type="submit"
                size="lg"
                className="px-8 shadow-md"
                disabled={!priceBreakdown || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating Order & Schedule...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Confirm Sales Order
                  </>
                )}
              </Button>
            </div>

          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
