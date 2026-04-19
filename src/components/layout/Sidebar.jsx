import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Users, FileText, CreditCard, BarChart3, ArrowRightLeft,
  XCircle, DollarSign, Repeat, Tag, Building2, Receipt,
  Mail, Percent, Settings, TrendingUp, ChevronDown, ChevronRight,
  LayoutDashboard, Menu, X, FileCheck, Landmark, Calculator, CircleDollarSign
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

const menuGroups = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", path: "/", icon: LayoutDashboard }
    ]
  },
  {
    label: "Customers",
    icon: Users,
    items: [
      { label: "All Customers", path: "/customers", icon: Users },
      { label: "Manage Bookings", path: "/bookings", icon: FileCheck },
      { label: "All Sales Orders", path: "/sales-orders", icon: FileText }
    ]
  },
  {
    label: "Presales",
    icon: Calculator,
    items: [
      // FIXED: Properly structured as an item within a group
      { label: "Presales Configurator", path: "/presales-hub", icon: Calculator }
    ]
  },
  {
    label: "Demand Letters",
    icon: FileText,
    items: [
      { label: "Generate PRL", path: "/demand-letters/generate", icon: FileText },
      { label: "View Demand Letters", path: "/demand-letters", icon: FileText }
    ]
  },
  {
    label: "Customer Receipts",
    icon: CreditCard,
    items: [
      { label: "Payment Journal", path: "/receipts", icon: CreditCard }
    ]
  },
  {
    label: "Reports",
    icon: BarChart3,
    items: [
      { label: "CRM Ledger Report", path: "/reports/ledger", icon: BarChart3 },
      { label: "Interest Report", path: "/reports/interest", icon: Percent },
      { label: "Sales Receipt Report", path: "/reports/sales-receipt", icon: Receipt },
      { label: "Outstanding Report", path: "/reports/outstanding", icon: DollarSign },
      { label: "Provisional Statement", path: "/reports/provisional", icon: FileText }
    ]
  },
  {
    label: "Handover",
    icon: ArrowRightLeft,
    items: [
      { label: "Generate Request", path: "/handover/generate", icon: ArrowRightLeft },
      { label: "Approved Handover", path: "/handover/approved", icon: ArrowRightLeft }
    ]
  },
  {
    label: "Cancellation",
    icon: XCircle,
    items: [
      { label: "Unit Cancellation", path: "/cancellation/request", icon: XCircle },
      { label: "Approved Cancellations", path: "/cancellation/approved", icon: XCircle }
    ]
  },
  {
    label: "Refund",
    icon: DollarSign,
    items: [
      { label: "Refund Request", path: "/refund", icon: DollarSign }
    ]
  },
  {
    label: "Shifting",
    icon: Repeat,
    items: [
      { label: "Shifting Request", path: "/shifting", icon: Repeat }
    ]
  },
  {
    label: "Resale",
    icon: Tag,
    items: [
      { label: "Resale Request", path: "/resale", icon: Tag }
    ]
  },
  {
    label: "Bank Documents",
    icon: Building2,
    items: [
      { label: "Generate Documents", path: "/bank-documents/generate", icon: Building2 },
      { label: "Document Inquiry", path: "/bank-documents/inquiry", icon: Building2 }
    ]
  },
  {
    label: "Client TDS",
    icon: Receipt,
    items: [
      { label: "Generate TDS", path: "/tds/generate", icon: Receipt },
      { label: "View TDS", path: "/tds/view", icon: Receipt }
    ]
  },
  {
    label: "Payment Reminders",
    icon: Mail,
    items: [
      { label: "Generate Reminder", path: "/reminders/generate", icon: Mail },
      { label: "Reminder Inquiry", path: "/reminders/inquiry", icon: Mail }
    ]
  },
  {
    label: "Interest",
    icon: TrendingUp,
    items: [
      { label: "Interest Settlement", path: "/interest/settlement", icon: Percent },
      { label: "Interest Calculation", path: "/interest/calculation", icon: Calculator },
      { label: "Interest Summary", path: "/interest/summary", icon: TrendingUp },
      { label: "FPV Calculation", path: "/interest/fpv", icon: Calculator }
    ]
  },
  {
    label: "Other Processes",
    icon: Settings,
    items: [
      { label: "Agreement Details", path: "/agreements", icon: FileText },
      { label: "Interest Waiver", path: "/waiver/request", icon: Percent },
      { label: "Waiver Types", path: "/waiver/types", icon: Settings }
    ]
  },
  {
    label: "Setup",
    icon: Settings,
    items: [
      { label: "Document Checklist", path: "/setup/document-checklist", icon: FileCheck },
      { label: "Project Demand Numbers", path: "/setup/demand-numbers", icon: FileText },
      { label: "Bank Master", path: "/setup/bank-master", icon: Landmark },
      { label: "TDS Account Setup", path: "/setup/tds-account", icon: Receipt }
    ]
  }
];

function SidebarGroup({ group, collapsed }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const isActive = group.items.some(item => location.pathname === item.path);

  if (group.items.length === 1 && group.label === "Overview") {
    const item = group.items[0];
    const active = location.pathname === item.path;
    return (
      <Link
        to={item.path}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200",
          active
            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-primary/20"
            : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        )}
      >
        <item.icon className="w-4 h-4 shrink-0" />
        {!collapsed && <span className="font-medium">{item.label}</span>}
      </Link>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200",
          isActive
            ? "text-sidebar-foreground bg-sidebar-accent/50"
            : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/30"
        )}
      >
        {group.icon && <group.icon className="w-4 h-4 shrink-0" />}
        {!collapsed && (
          <>
            <span className="font-medium flex-1 text-left">{group.label}</span>
            {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </>
        )}
      </button>
      {open && !collapsed && (
        <div className="ml-4 mt-1 space-y-0.5 border-l border-sidebar-border pl-3">
          {group.items.map(item => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs transition-all duration-200",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
              >
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ collapsed, onToggle }) {
  return (
    <>
      {/* Mobile overlay */}
      {!collapsed && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onToggle} />
      )}
      <aside
        className={cn(
          "fixed top-0 left-0 h-screen bg-sidebar z-50 transition-all duration-300 flex flex-col",
          collapsed ? "w-16" : "w-64",
          "lg:relative"
        )}
      >
        {/* Header */}
        <div className="h-16 flex items-center px-4 border-b border-sidebar-border shrink-0">
          {!collapsed && (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
                <Building2 className="w-4 h-4 text-sidebar-primary-foreground" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-sidebar-foreground tracking-tight">SalesFinance</h1>
                <p className="text-[10px] text-sidebar-foreground/50 font-medium">CRM Platform</p>
              </div>
            </div>
          )}
          <button
            onClick={onToggle}
            className={cn(
              "p-1.5 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors",
              collapsed ? "mx-auto" : "ml-auto"
            )}
          >
            {collapsed ? <Menu className="w-4 h-4" /> : <X className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 px-3 py-4">
          <div className="space-y-1">
            {menuGroups.map((group, i) => (
              <SidebarGroup key={i} group={group} collapsed={collapsed} />
            ))}
          </div>
        </ScrollArea>
      </aside>
    </>
  );
}