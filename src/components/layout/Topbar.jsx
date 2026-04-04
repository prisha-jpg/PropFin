import React from "react";
import { useLocation } from "react-router-dom";
import { Menu, Bell, Search, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/api/apiClient";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const pageTitles = {
  "/": "Dashboard",
  "/customers": "All Customers",
  "/bookings": "Manage Bookings",
  "/sales-orders": "All Sales Orders",
  "/demand-letters/generate": "Generate PRL Demand Letter",
  "/demand-letters": "View Demand Letters",
  "/receipts": "Customer Payment Journal",
  "/reports/ledger": "CRM Ledger Report",
  "/reports/interest": "CRM Ledger Interest Report",
  "/reports/sales-receipt": "Sales Receipt Report",
  "/reports/outstanding": "Outstanding Report",
  "/reports/provisional": "Provisional Statement Report",
  "/handover/generate": "Generate Handover Request",
  "/handover/approved": "Approved Handover Process",
  "/cancellation/request": "Unit Cancellation",
  "/cancellation/approved": "Approved Unit Cancellations",
  "/refund": "Refund Request",
  "/shifting": "Shifting Request",
  "/resale": "Resale Request",
  "/bank-documents/generate": "Generate Bank Documents",
  "/bank-documents/inquiry": "Bank Document Inquiry",
  "/tds/generate": "Generate Client TDS",
  "/tds/view": "View Client TDS",
  "/reminders/generate": "Generate Payment Reminder",
  "/reminders/inquiry": "Reminder Inquiry",
  "/interest/settlement": "Interest Settlement",
  "/interest/calculation": "Interest Calculation",
  "/interest/summary": "Interest Generation Summary",
  "/interest/fpv": "FPV Calculation",
  "/agreements": "Agreement Details",
  "/waiver/request": "Interest Waiver Request",
  "/waiver/types": "Waiver Types",
  "/setup/document-checklist": "Document Checklist Master",
  "/setup/demand-numbers": "Project Wise Demand Number",
  "/setup/bank-master": "Bank Master",
  "/setup/tds-account": "TDS Account Setup"
};

export default function Topbar({ onMenuClick }) {
  const location = useLocation();
  const title = pageTitles[location.pathname] || "Sales Finance";

  return (
    <header className="h-16 bg-card border-b border-border flex items-center px-4 lg:px-6 gap-4 shrink-0">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick}>
        <Menu className="w-5 h-5" />
      </Button>

      <div className="flex-1">
        <h2 className="text-lg font-semibold text-foreground tracking-tight">{title}</h2>
      </div>

      <div className="hidden md:flex items-center gap-2 max-w-xs">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search..."
            className="pl-8 h-8 text-xs w-48 bg-muted border-0"
          />
        </div>
      </div>

      <Button variant="ghost" size="icon" className="relative">
        <Bell className="w-4 h-4" />
        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                SF
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => apiClient.auth.logout()}>
            <LogOut className="w-4 h-4 mr-2" /> Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}