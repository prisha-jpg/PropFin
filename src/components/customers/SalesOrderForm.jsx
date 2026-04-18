import React, { useState, useEffect } from "react";
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

// Validation Schema
const formSchema = z.object({
  customer_id: z.string().min(36, "Please select a valid Customer"),
  project_id: z.string().min(36, "Please select a valid Project"),
  unit_id: z.string().min(36, "Please select a valid Unit"),
  sba: z.coerce.number().min(1, "Super Built-Up Area must be greater than 0"),
  rate_per_sqft: z.coerce.number().min(1, "Rate per sqft is required"),
  caic_charges: z.coerce.number().default(0),
  maintenance_deposit: z.coerce.number().default(300000), // Fixed per PL.xlsx
  basic_sale_value: z.coerce.number().min(1, "Please calculate the price first"),
  total_value: z.coerce.number().min(1, "Please calculate the price first"),
});

export default function SalesOrderForm({ onSuccess }) {
  const { toast } = useToast();
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Data States for Dropdowns
  const [customers, setCustomers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [units, setUnits] = useState([]);
  const [priceBreakdown, setPriceBreakdown] = useState(null);

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customer_id: "",
      project_id: "",
      unit_id: "",
      sba: "",
      rate_per_sqft: "",
      caic_charges: 0,
      maintenance_deposit: 300000,
      basic_sale_value: 0,
      total_value: 0,
    },
  });

  // Fetch dropdown data
  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const [custRes, projRes, unitRes] = await Promise.all([
          apiClient.entities.Customer.list(),
          apiClient.entities.Project.list(),
          apiClient.entities.Unit.list()
        ]);
        
        setCustomers(Array.isArray(custRes) ? custRes : custRes?.data || []);
        setProjects(Array.isArray(projRes) ? projRes : projRes?.data || []);
        setUnits(Array.isArray(unitRes) ? unitRes : unitRes?.data || []);
      } catch (error) {
        console.error("Failed to load dropdown data:", error);
      }
    };
    fetchDropdownData();
  }, []);

  // Calculate Prices
  const handleCalculatePrice = async () => {
    const sba = form.getValues("sba");
    const rate = form.getValues("rate_per_sqft");
    const caic = form.getValues("caic_charges");
    const maintenance = form.getValues("maintenance_deposit");

    if (!sba || !rate) {
      toast({
        title: "Missing Data",
        description: "Please enter both SBA and Rate per SqFt to calculate.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsCalculating(true);
      const response = await apiClient.post("/pricing/calculate-unit", {
        sba,
        rate_per_sqft: rate,
        caic_charges: caic,
        maintenance_deposit: maintenance,
      });

      const data = response.data;
      setPriceBreakdown(data);

      form.setValue("basic_sale_value", parseFloat(data.basic_sale_value), { shouldValidate: true });
      form.setValue("total_value", parseFloat(data.total_sale_value), { shouldValidate: true });

    } catch (error) {
      toast({
        title: "Calculation Failed",
        description: error.message || "Could not reach the pricing engine.",
        variant: "destructive",
      });
    } finally {
      setIsCalculating(false);
    }
  };

  // Submit Order & Schedule
  const onSubmit = async (values) => {
    try {
      setIsSubmitting(true);

      const mockOrderNumber = `SO-${Math.floor(Date.now() / 1000)}`;

      const orderPayload = {
        order_number: mockOrderNumber,
        customer_id: values.customer_id,
        project_id: values.project_id,
        unit_id: values.unit_id,
        basic_sale_value: values.basic_sale_value,
        additional_value: values.caic_charges + values.maintenance_deposit,
        total_value: values.total_value,
        booking_date: new Date().toISOString(),
        status: "open_order",
      };

      const orderRes = await apiClient.post("/entities/SalesOrder", orderPayload);
      const newOrderId = orderRes.id;

      await apiClient.post("/pricing/generate-schedule", {
        sales_order_id: newOrderId,
        total_value: values.total_value,
      });

      toast({
        title: "Order Generated Successfully",
        description: "Sales Order and 15-step payment schedule have been mapped.",
      });

      form.reset();
      setPriceBreakdown(null);
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
              <div className="bg-white border border-slate-200 rounded-xl p-6 grid grid-cols-1 md:grid-cols-3 gap-6 shadow-sm">
                <FormField control={form.control} name="customer_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-600">Customer Profile</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-slate-50">
                          <SelectValue placeholder="Select a Unit" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {units.map((u) => (
                          <SelectItem key={u.id} value={u.id}>{u.unit_number} - {u.status}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            {/* --- SECTION 2: PRICING CONFIGURATION --- */}
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-slate-400" />
                  2. Pricing Configuration
                </h3>
              </div>
              
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <FormField control={form.control} name="sba" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-600">Super Built-Up Area</FormLabel>
                      <div className="relative">
                        <FormControl><Input type="number" className="pl-4 bg-slate-50" placeholder="0" {...field} /></FormControl>
                        <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-medium">Sq.Ft</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="rate_per_sqft" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-600">Applied Rate</FormLabel>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-500">₹</span>
                        <FormControl><Input type="number" className="pl-7 bg-slate-50" placeholder="0" {...field} /></FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="caic_charges" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-600">CAIC Charges</FormLabel>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-500">₹</span>
                        <FormControl><Input type="number" className="pl-7 bg-slate-50" placeholder="0" {...field} /></FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="maintenance_deposit" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-600">Maint. Deposit (Fixed)</FormLabel>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-500">₹</span>
                        <FormControl><Input type="number" className="pl-7 bg-slate-100 text-slate-500" readOnly {...field} /></FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="mt-8 flex justify-end">
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="w-full md:w-auto px-8 bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                    onClick={handleCalculatePrice}
                    disabled={isCalculating}
                  >
                    {isCalculating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4 text-slate-500" />}
                    Calculate Final Pricing
                  </Button>
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
                  <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-500">Basic Sale Value (BSV)</p>
                      <p className="text-xl font-semibold text-slate-800 tracking-tight">
                        ₹{Number(priceBreakdown.basic_sale_value).toLocaleString('en-IN')}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-500">Goods & Services Tax (5%)</p>
                      <p className="text-xl font-semibold text-slate-800 tracking-tight">
                        ₹{Number(priceBreakdown.gst_amount).toLocaleString('en-IN')}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-500">Additional Deposits (Maint + CAIC)</p>
                      <p className="text-xl font-semibold text-slate-800 tracking-tight">
                        ₹{(Number(priceBreakdown.maintenance_deposit) + Number(priceBreakdown.caic_charges)).toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>
                  
                  {/* Total Bar */}
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
                      ₹{Number(priceBreakdown.total_sale_value).toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Hidden fields for submission validation */}
            <FormField control={form.control} name="basic_sale_value" render={({ field }) => <input type="hidden" {...field} />} />
            <FormField control={form.control} name="total_value" render={({ field }) => <input type="hidden" {...field} />} />

            <Separator className="bg-slate-200" />

            <div className="flex items-center justify-end gap-4 pt-2 pb-4">
              <Button type="button" variant="ghost" onClick={() => form.reset()}>
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