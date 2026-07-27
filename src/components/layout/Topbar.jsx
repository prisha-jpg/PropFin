import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Menu, Bell, Search, LogOut, User, Settings, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/AuthContext";
import {
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import UserProfileModal from "@/components/shared/UserProfileModal";

const pageTitles = {
  "/": "Dashboard",
  "/presales-hub": "Presales Configurator",
  "/customers": "All Customers",
  "/bookings": "Manage Bookings",
  "/sales-orders": "All Sales Orders",
  "/demand-letters/generate": "Generate PRL Demand Letter",
  "/demand-letters": "View Demand Letters",
  "/receipts": "Customer Payment Journal",
  "/reports/ledger": "CRM Ledger Report",
  "/reports/crm-ledger": "CRM Ledger Report",
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
  "/reminders/generate": "Generate Payment Reminder",
  "/reminders/inquiry": "Reminder Inquiry",
  "/interest/fpv": "FPV Calculation",
  "/setup/team": "Team Members & User Management",
  "/setup/document-checklist": "Document Checklist Master",
  "/setup/demand-numbers": "Project Wise Demand Number",
  "/setup/bank-master": "Bank Master",
  "/setup/tds-account": "TDS Account Setup",
  "/setup/settings": "System Settings"
};

export default function Topbar({ onMenuClick }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  const title = pageTitles[location.pathname] || "Sales Finance";

  const userName = user?.full_name || user?.name || "Prisha Birla";
  const userEmail = user?.email || "prishaa.birla@gmail.com";
  const userRole = (user?.role || "Admin").toUpperCase();

  const initials = userName
    .split(" ")
    .map(n => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase() || "SF";

  return (
    <>
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
            <Button variant="ghost" size="icon" className="rounded-full hover:ring-2 hover:ring-blue-500/20 transition-all">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 p-1.5 shadow-lg rounded-xl">
            <DropdownMenuLabel className="font-normal p-2">
              <div className="flex flex-col space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold leading-none text-slate-900">{userName}</p>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200">
                    {userRole}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-none">{userEmail}</p>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator className="my-1" />

            <DropdownMenuItem 
              onClick={() => setProfileOpen(true)}
              className="cursor-pointer text-xs font-medium py-2 rounded-lg text-slate-700 hover:bg-slate-100"
            >
              <User className="w-4 h-4 mr-2 text-blue-600" /> My Profile
            </DropdownMenuItem>

            <DropdownMenuItem 
              onClick={() => navigate("/setup/settings")}
              className="cursor-pointer text-xs font-medium py-2 rounded-lg text-slate-700 hover:bg-slate-100"
            >
              <Settings className="w-4 h-4 mr-2 text-slate-500" /> Settings
            </DropdownMenuItem>

            <DropdownMenuSeparator className="my-1" />

            <DropdownMenuItem 
              onClick={() => logout()}
              className="cursor-pointer text-xs font-medium py-2 rounded-lg text-red-600 hover:bg-red-50 focus:bg-red-50 focus:text-red-700"
            >
              <LogOut className="w-4 h-4 mr-2" /> Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <UserProfileModal open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
}