import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import StatsCard from "@/components/shared/StatsCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { 
  UserPlus, Users, Shield, UserCheck, Edit3, Loader2, CheckCircle2 
} from "lucide-react";
import { format } from "date-fns";

const roleColors = {
  admin: "bg-purple-50 text-purple-700 border-purple-200",
  manager: "bg-blue-50 text-blue-700 border-blue-200",
  sales_exec: "bg-emerald-50 text-emerald-700 border-emerald-200",
  finance: "bg-amber-50 text-amber-700 border-amber-200",
  approver: "bg-teal-50 text-teal-700 border-teal-200",
  viewer: "bg-slate-100 text-slate-600 border-slate-200"
};

const roleLabels = {
  admin: "Administrator",
  manager: "Sales Manager",
  sales_exec: "Sales Executive",
  finance: "Finance Manager",
  approver: "Compliance Approver",
  viewer: "Read Only Viewer"
};

export default function TeamMembers() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [roleFilter, setRoleFilter] = useState("all");

  const [form, setForm] = useState({
    employee_code: "",
    full_name: "",
    email: "",
    phone: "",
    role: "sales_exec",
    password: "",
    is_active: true
  });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiClient.entities.User.list("-created_at", 200)
  });

  const createMutation = useMutation({
    mutationFn: (data) => apiClient.entities.User.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setShowModal(false);
      resetForm();
      toast.success("Team member created successfully.");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to create team member.");
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => apiClient.entities.User.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setShowModal(false);
      resetForm();
      toast.success("Team member updated successfully.");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update team member.");
    }
  });

  const resetForm = () => {
    setEditingUser(null);
    setForm({
      employee_code: "",
      full_name: "",
      email: "",
      phone: "",
      role: "sales_exec",
      password: "",
      is_active: true
    });
  };

  const handleOpenAdd = () => {
    resetForm();
    setForm(p => ({
      ...p,
      employee_code: `EMP-${Math.floor(1000 + Math.random() * 9000)}`
    }));
    setShowModal(true);
  };

  const handleOpenEdit = (user) => {
    setEditingUser(user);
    setForm({
      employee_code: user.employee_code || "",
      full_name: user.full_name || "",
      email: user.email || "",
      phone: user.phone || "",
      role: user.role || "sales_exec",
      password: "",
      is_active: user.is_active !== false
    });
    setShowModal(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.full_name || !form.email) {
      toast.error("Full name and email are required.");
      return;
    }

    if (editingUser) {
      updateMutation.mutate({ id: editingUser.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const toggleUserStatus = (user) => {
    const newStatus = !user.is_active;
    updateMutation.mutate({
      id: user.id,
      data: { is_active: newStatus }
    });
  };

  const filteredUsers = roleFilter === "all" 
    ? users 
    : users.filter(u => u.role === roleFilter);

  const activeCount = users.filter(u => u.is_active !== false).length;
  const adminCount = users.filter(u => u.role === "admin" || u.role === "manager").length;
  const salesCount = users.filter(u => u.role === "sales_exec" || u.role === "finance").length;

  const columns = [
    {
      header: "Employee",
      accessor: "full_name",
      cell: (row) => {
        const initials = (row.full_name || "TM")
          .split(" ")
          .map((n) => n[0])
          .join("")
          .substring(0, 2)
          .toUpperCase();
        return (
          <div className="flex items-center gap-3">
            <Avatar className="w-8 h-8 border border-slate-200">
              <AvatarFallback className="bg-slate-100 text-slate-700 text-xs font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-slate-900 text-xs">{row.full_name}</p>
              <p className="font-mono text-[10px] text-slate-400">{row.employee_code || "—"}</p>
            </div>
          </div>
        );
      },
    },
    {
      header: "Email & Contact",
      accessor: "email",
      cell: (row) => (
        <div className="text-xs">
          <p className="text-slate-700 font-medium">{row.email}</p>
          <p className="text-slate-400 text-[11px]">{row.phone || "—"}</p>
        </div>
      ),
    },
    {
      header: "Role / Designation",
      accessor: "role",
      cell: (row) => {
        const roleKey = row.role || "sales_exec";
        const style = roleColors[roleKey] || "bg-slate-50 text-slate-700 border-slate-200";
        const label = roleLabels[roleKey] || roleKey.replace(/_/g, " ").toUpperCase();
        return (
          <Badge variant="outline" className={`text-[11px] font-semibold border px-2 py-0.5 ${style}`}>
            {label}
          </Badge>
        );
      },
    },
    {
      header: "Status",
      accessor: "is_active",
      cell: (row) => {
        const isActive = row.is_active !== false;
        return (
          <button 
            onClick={() => toggleUserStatus(row)}
            className="focus:outline-none"
            title="Click to toggle active status"
          >
            <Badge 
              variant="outline" 
              className={`text-[11px] font-medium border px-2 py-0.5 cursor-pointer hover:opacity-80 transition-opacity ${
                isActive 
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                  : "bg-slate-100 text-slate-500 border-slate-200"
              }`}
            >
              {isActive ? "Active" : "Inactive"}
            </Badge>
          </button>
        );
      },
    },
    {
      header: "Joined Date",
      accessor: "created_at",
      cell: (row) => (
        <span className="text-xs text-slate-500">
          {row.created_at ? format(new Date(row.created_at), "dd MMM yyyy") : "—"}
        </span>
      ),
    },
    {
      header: "Actions",
      accessor: "actions",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => handleOpenEdit(row)}
            className="h-8 px-2 text-xs text-slate-600 hover:text-blue-600 hover:bg-blue-50"
          >
            <Edit3 className="w-3.5 h-3.5 mr-1" /> Edit
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team Members & User Management"
        description="Manage organizational roles, employee profiles, access permissions, and active status"
        actions={
          <Button onClick={handleOpenAdd} className="gap-2 bg-blue-600 hover:bg-blue-700">
            <UserPlus className="w-4 h-4" /> Add Team Member
          </Button>
        }
      />

      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard 
          title="Total Team Members" 
          value={users.length} 
          icon={Users} 
          trendLabel="Registered Staff" 
          trend={1} 
        />
        <StatsCard 
          title="Active Accounts" 
          value={activeCount} 
          icon={UserCheck} 
          trendLabel="Operational Users" 
          trend={1} 
        />
        <StatsCard 
          title="Managers & Admins" 
          value={adminCount} 
          icon={Shield} 
          trendLabel="Administrative Access" 
          trend={1} 
        />
        <StatsCard 
          title="Sales & Finance Staff" 
          value={salesCount} 
          icon={UserPlus} 
          trendLabel="Field & Operations" 
          trend={1} 
        />
      </div>

      {/* Main Content & Table */}
      <Card className="shadow-sm border-slate-200">
        <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="text-sm font-semibold text-slate-800">
            All Team Members ({filteredUsers.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-slate-500 font-medium">Filter Role:</Label>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[180px] h-8 text-xs bg-white">
                <SelectValue placeholder="All Roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="admin">Administrator</SelectItem>
                <SelectItem value="manager">Sales Manager</SelectItem>
                <SelectItem value="sales_exec">Sales Executive</SelectItem>
                <SelectItem value="finance">Finance Manager</SelectItem>
                <SelectItem value="approver">Compliance Approver</SelectItem>
                <SelectItem value="viewer">Read Only Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={filteredUsers}
            isLoading={isLoading}
            searchPlaceholder="Search by name, email, employee code..."
          />
        </CardContent>
      </Card>

      {/* Add / Edit User Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              {editingUser ? "Edit Team Member" : "Add New Team Member"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs font-semibold">Full Name *</Label>
                <Input
                  placeholder="e.g. Rahul Sharma"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  required
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Employee Code *</Label>
                <Input
                  placeholder="EMP-1001"
                  value={form.employee_code}
                  onChange={(e) => setForm({ ...form, employee_code: e.target.value })}
                  required
                  className="h-9 text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Role / Position *</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrator</SelectItem>
                    <SelectItem value="manager">Sales Manager</SelectItem>
                    <SelectItem value="sales_exec">Sales Executive</SelectItem>
                    <SelectItem value="finance">Finance Manager</SelectItem>
                    <SelectItem value="approver">Compliance Approver</SelectItem>
                    <SelectItem value="viewer">Read Only Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Email Address *</Label>
                <Input
                  type="email"
                  placeholder="name@company.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Phone Number</Label>
                <Input
                  placeholder="+91 9876543210"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>

              {!editingUser && (
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs font-semibold">Initial Password</Label>
                  <Input
                    type="password"
                    placeholder="Enter default login password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="h-9 text-xs"
                  />
                </div>
              )}

              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs font-semibold">Account Status</Label>
                <Select 
                  value={form.is_active ? "active" : "inactive"} 
                  onValueChange={(v) => setForm({ ...form, is_active: v === "active" })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active (Access Allowed)</SelectItem>
                    <SelectItem value="inactive">Inactive (Deactivated)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="pt-4 border-t border-slate-100 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)} className="text-xs">
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending || updateMutation.isPending}
                className="text-xs bg-blue-600 hover:bg-blue-700 gap-1.5"
              >
                {createMutation.isPending || updateMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                {editingUser ? "Save Changes" : "Create Member"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
