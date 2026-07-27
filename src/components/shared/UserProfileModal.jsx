import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { apiClient } from "@/api/apiClient";
import { toast } from "sonner";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { User, Mail, Phone, Shield, KeyRound, Loader2, LogOut, CheckCircle2 } from "lucide-react";

export default function UserProfileModal({ open, onOpenChange }) {
  const { user, logout, checkAppState } = useAuth();
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    employee_code: "",
    role: "Admin"
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        full_name: user.full_name || user.name || "Prisha Birla",
        email: user.email || "prishaa.birla@gmail.com",
        phone: user.phone || "09834816412",
        employee_code: user.employee_code || "EMP-1082",
        role: (user.role || "Admin").toUpperCase()
      });
    }
  }, [user, open]);

  const initials = (formData.full_name || "SF")
    .split(" ")
    .map(n => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (apiClient.auth.updateProfile) {
        await apiClient.auth.updateProfile({
          full_name: formData.full_name,
          phone: formData.phone,
          email: formData.email
        });
      }
      await checkAppState();
      toast.success("User profile updated successfully.");
      onOpenChange(false);
    } catch (err) {
      toast.error(err.message || "Failed to update profile.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden rounded-xl border border-slate-200 shadow-xl">
        {/* Banner Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white relative">
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16 border-2 border-white/80 shadow-md">
              <AvatarFallback className="bg-white text-blue-700 text-xl font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="text-xl font-bold leading-tight">{formData.full_name}</h3>
              <p className="text-blue-100 text-xs mt-0.5">{formData.email}</p>
              <Badge className="mt-2 bg-white/20 hover:bg-white/30 text-white border-0 text-[10px] uppercase tracking-wider font-semibold">
                <Shield className="w-3 h-3 mr-1" /> {formData.role}
              </Badge>
            </div>
          </div>
        </div>

        {/* Profile Details Form */}
        <form onSubmit={handleSave} className="p-6 space-y-4 bg-white">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-blue-600" /> Full Name
            </Label>
            <Input 
              value={formData.full_name} 
              onChange={e => setFormData({ ...formData, full_name: e.target.value })} 
              required
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-blue-600" /> Email Address
            </Label>
            <Input 
              type="email"
              value={formData.email} 
              onChange={e => setFormData({ ...formData, email: e.target.value })} 
              required
              className="h-9 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-blue-600" /> Phone Number
              </Label>
              <Input 
                value={formData.phone} 
                onChange={e => setFormData({ ...formData, phone: e.target.value })} 
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-blue-600" /> Employee Code
              </Label>
              <Input 
                value={formData.employee_code} 
                disabled
                className="h-9 text-sm bg-slate-50 text-slate-500 cursor-not-allowed"
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="pt-3 flex items-center justify-between border-t border-slate-100 mt-6">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                onOpenChange(false);
                logout();
              }}
              className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 text-xs gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> Logout
            </Button>

            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="text-xs">
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving} className="text-xs gap-1.5 bg-blue-600 hover:bg-blue-700">
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Save Changes
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
