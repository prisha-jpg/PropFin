import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import { useAuth } from "@/lib/AuthContext";
import StatsCard from "../components/shared/StatsCard";
import StatusBadge from "../components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { 
  Users, FileText, AlertTriangle, RefreshCw, 
  Calculator, FileSpreadsheet, LayoutDashboard, 
  Send, StickyNote, User, Clock, Loader2, Plus,
  TrendingUp, Wallet, FileCheck, ArrowUpRight
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Link, useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const COLORS = ["#2563EB", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];

// Reusable hook for optimized data fetching
function useDashboardData(key, fetcher) {
  return useQuery({
    queryKey: [key],
    queryFn: fetcher,
    staleTime: 3 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-20 bg-slate-100 rounded-xl w-full mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="p-6">
            <Skeleton className="h-4 w-24 mb-4" />
            <Skeleton className="h-8 w-16 mb-2" />
            <Skeleton className="h-3 w-32" />
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6"><Skeleton className="h-64 w-full" /></Card>
        <Card className="p-6"><Skeleton className="h-64 w-full" /></Card>
      </div>
    </div>
  );
}

function WorkflowCard({ title, description, icon: Icon, colorClass, linkTo }) {
  const navigate = useNavigate();

  return (
    <Card 
      className={`group cursor-pointer overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border-0 ${colorClass}`}
      onClick={() => navigate(linkTo)}
      tabIndex={0}
      role="button"
    >
      <CardContent className="p-5 flex flex-col justify-between h-full relative">
        <div className="absolute right-[-10px] bottom-[-10px] opacity-10 transform transition-transform group-hover:scale-110 duration-500">
          <Icon size={110} strokeWidth={1.5} />
        </div>
        
        <div>
          <div className="w-10 h-10 rounded-lg bg-white/20 backdrop-blur-md flex items-center justify-center mb-3 shadow-sm border border-white/20">
            <Icon className="text-white" size={20} />
          </div>
          <h3 className="text-lg font-bold text-white mb-1 flex items-center justify-between">
            {title}
            <ArrowUpRight size={18} className="opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
          </h3>
          <p className="text-white/80 text-xs leading-relaxed">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickNoteForm() {
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [author, setAuthor] = useState("");
  const [priority, setPriority] = useState("medium");

  const mutation = useMutation({
    mutationFn: (newNote) => apiClient.entities.DashboardNote.create(newNote),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboardNotes"] });
      setContent("");
      setAuthor("");
      setPriority("medium");
      toast.success("Team note posted successfully");
    },
    onError: (error) => {
      toast.error(error?.message || "Could not post note.");
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    mutation.mutate({
      content,
      author: author || "Sales Team",
      priority,
      created_at: new Date().toISOString()
    });
  };

  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
        <CardTitle className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-blue-600" /> Quick Announcement
        </CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="pt-4 space-y-3">
          <Textarea
            placeholder="Type a team update or reminder..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[80px] resize-none text-xs"
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Your name"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="text-xs h-8"
            />
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="text-xs h-8">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low Priority</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High Priority</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
        <CardFooter className="pt-0 flex justify-end pb-3 px-4">
          <Button 
            type="submit" 
            size="sm"
            disabled={mutation.isPending || !content.trim()}
            className="text-xs gap-1.5 h-8 bg-blue-600 hover:bg-blue-700"
          >
            {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Post Announcement
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: customers = [], isLoading: loadingCustomers, isError: isErrorCustomers, refetch: refetchCustomers } = useDashboardData("customers", () => apiClient.entities.Customer.list("-created_date", 100));
  const { data: salesOrders = [], isLoading: loadingOrders, isError: isErrorOrders, refetch: refetchOrders } = useDashboardData("salesOrders", () => apiClient.entities.SalesOrder.list("-created_date", 100));
  const { data: receipts = [], isLoading: loadingReceipts, isError: isErrorReceipts, refetch: refetchReceipts } = useDashboardData("receipts", () => apiClient.entities.PaymentReceipt.list("-created_date", 100));
  const { data: demands = [], isLoading: loadingDemands, isError: isErrorDemands, refetch: refetchDemands } = useDashboardData("demands", () => apiClient.entities.DemandLetter.list("-created_date", 100));
  const { data: dashboardNotes = [], isLoading: loadingNotes } = useDashboardData("dashboardNotes", () => apiClient.entities.DashboardNote.list("-created_at", 10));

  const isLoading = loadingCustomers || loadingOrders || loadingReceipts || loadingDemands;
  const isError = isErrorCustomers || isErrorOrders || isErrorReceipts || isErrorDemands;

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-bold mb-2">Failed to load dashboard data</h2>
        <p className="text-muted-foreground mb-6 max-w-md">There was an error communicating with the server. Please verify your connection.</p>
        <Button onClick={() => {
          refetchCustomers();
          refetchOrders();
          refetchReceipts();
          refetchDemands();
        }} className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4" /> Retry Connection
        </Button>
      </div>
    );
  }

  const totalCollection = receipts.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalOutstanding = salesOrders.reduce((s, o) => s + Number(o.outstanding_amount || 0), 0);
  const userName = user?.full_name || user?.name || "Prisha Birla";
  const todayStr = format(new Date(), "EEEE, MMMM d, yyyy");

  const statusBreakdown = salesOrders.reduce((acc, o) => {
    const s = o.status || "open_order";
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  const pieData = Object.entries(statusBreakdown).map(([name, value]) => ({
    name: name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()), value
  }));

  const recentReceipts = receipts.slice(0, 5);

  return (
    <div className="space-y-6 pb-8">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-300 uppercase tracking-wider mb-1">
            <Clock className="w-3.5 h-3.5" /> {todayStr}
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            Welcome back, {userName}! 👋
          </h1>
          <p className="text-slate-300 text-xs md:text-sm mt-1 max-w-xl">
            Here is your real-time executive summary of customer orders, collections, and financial milestones.
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => navigate("/presales-hub")}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs gap-1.5 shadow-md border-0"
          >
            <Calculator className="w-4 h-4" /> Presales Configurator
          </Button>
          <Button 
            onClick={() => navigate("/customers")}
            variant="outline"
            className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs gap-1.5"
          >
            <Plus className="w-4 h-4" /> Add Customer
          </Button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard 
          title="Total Collections" 
          value={`₹${(totalCollection / 100000).toFixed(2)}L`} 
          icon={Wallet} 
          trendLabel="Customer Payments Received" 
          trend={1} 
        />
        <StatsCard 
          title="Outstanding Balance" 
          value={`₹${(totalOutstanding / 100000).toFixed(2)}L`} 
          icon={TrendingUp} 
          trendLabel="Pending Receivables" 
          trend={1} 
        />
        <StatsCard 
          title="Active Sales Orders" 
          value={salesOrders.length} 
          icon={FileText} 
          trendLabel="Bookings & Orders" 
          trend={1} 
        />
        <StatsCard 
          title="Registered Customers" 
          value={customers.length} 
          icon={Users} 
          trendLabel="All CRM Profiles" 
          trend={1} 
        />
      </div>

      {/* Key Workflows */}
      <section aria-label="Key Workflows">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4 text-blue-600" /> Core Modules & Workflows
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <WorkflowCard 
            title="Presales Configurator" 
            description="Manage master pricelists, unit pricing rules, and payment schedules."
            icon={Calculator}
            colorClass="bg-gradient-to-br from-blue-600 to-indigo-700"
            linkTo="/presales-hub"
          />
          <WorkflowCard 
            title="Sales Orders" 
            description="Track customer unit bookings, sales orders, and agreement values."
            icon={FileCheck}
            colorClass="bg-gradient-to-br from-indigo-600 to-purple-700"
            linkTo="/sales-orders"
          />
          <WorkflowCard 
            title="CRM Ledger Report" 
            description="Comprehensive ledger summaries with debits, credits, and net balances."
            icon={FileSpreadsheet}
            colorClass="bg-gradient-to-br from-emerald-600 to-teal-700"
            linkTo="/reports/ledger"
          />
          <WorkflowCard 
            title="FPV & Interest Engine" 
            description="Calculate delay interest and upfront payment discounts."
            icon={TrendingUp}
            colorClass="bg-gradient-to-br from-amber-500 to-orange-600"
            linkTo="/interest/fpv"
          />
        </div>
      </section>

      {/* Financial Analytics & Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-sm border-slate-200">
          <CardHeader className="pb-2 border-b border-slate-100 bg-slate-50/50 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-700">Recent Collections Trend (₹)</CardTitle>
            <Link to="/receipts" className="text-xs font-medium text-blue-600 hover:underline">View Journal</Link>
          </CardHeader>
          <CardContent className="pt-6">
            {recentReceipts.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={recentReceipts.map(r => ({ name: r.receipt_number || r.customer_name || "Receipt", amt: Number(r.amount || 0) }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-slate-200" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} dy={10} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} dx={-10} />
                  <Tooltip 
                    cursor={{ fill: 'rgba(241, 245, 249, 0.5)' }} 
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="amt" fill="#2563EB" radius={[4, 4, 0, 0]} maxBarSize={45} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-[260px] text-muted-foreground text-xs italic">
                No recent collections recorded yet.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="pb-2 border-b border-slate-100 bg-slate-50/50">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-700">Sales Order Status</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center pt-6">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value">
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-[260px] text-muted-foreground text-xs italic">
                No active orders recorded yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity & Team Notes Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-700">Recent Sales Orders</CardTitle>
              <Link to="/sales-orders" className="text-xs text-blue-600 font-medium hover:underline">View All</Link>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {salesOrders.slice(0, 5).map(o => (
                  <div key={o.id} className="flex items-center justify-between p-3.5 hover:bg-slate-50 transition-colors">
                    <div>
                      <p className="text-xs font-bold text-slate-900">{o.customer_name || "Customer"}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{o.project_name || "PropFin Residency"} · {o.unit_number || "Unit"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-slate-900 mb-1">₹{Number(o.basic_sale_value || o.total_value || 0).toLocaleString("en-IN")}</p>
                      <StatusBadge status={o.status || "open_order"} />
                    </div>
                  </div>
                ))}
                {salesOrders.length === 0 && (
                  <div className="p-6 text-center text-slate-400 text-xs italic">No sales orders found</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <QuickNoteForm />

          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-700">Team Announcements</CardTitle>
              {loadingNotes && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100 max-h-[320px] overflow-y-auto scrollbar-thin">
                {dashboardNotes.length > 0 ? (
                  dashboardNotes.map((note) => (
                    <div key={note.id} className="p-3.5 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          note.priority === 'high' ? 'bg-red-100 text-red-600' : 
                          note.priority === 'low' ? 'bg-slate-100 text-slate-600' : 
                          'bg-blue-100 text-blue-600'
                        }`}>
                          {note.priority}
                        </span>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {note.created_at ? formatDistanceToNow(new Date(note.created_at), { addSuffix: true }) : "just now"}
                        </div>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed mb-1">{note.content}</p>
                      <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                        <User className="h-3 w-3 text-blue-500" />
                        {note.author || "Sales Team"}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-slate-400 text-xs italic">
                    No announcements yet.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}