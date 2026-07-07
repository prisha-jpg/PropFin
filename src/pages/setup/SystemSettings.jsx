import React, { useState, useEffect } from "react";
import PageHeader from "../../components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Percent, ShieldAlert, Check } from "lucide-react";

export default function SystemSettings() {
  const [settings, setSettings] = useState({
    cancellation_charge_percent: 5,
    cancellation_gst_rate: 18,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      setIsLoading(true);
      try {
        const res = await fetch("/api/system-settings");
        if (res.ok) {
          const data = await res.json();
          setSettings({
            cancellation_charge_percent: data.cancellation_charge_percent ?? 5,
            cancellation_gst_rate: data.cancellation_gst_rate ?? 18,
          });
        }
      } catch (err) {
        toast.error("Failed to load system settings");
      } finally {
        setIsLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/system-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token") || ""}`
        },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        toast.success("System settings updated successfully");
      } else {
        const data = await res.json();
        throw new Error(data.message || "Failed to save settings");
      }
    } catch (err) {
      toast.error(err.message || "Failed to update system settings");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="System Settings"
        description="Configure system-wide parameters, charge thresholds, and tax configurations"
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8">Loading configuration settings...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <Card className="border-slate-200 shadow-sm transition-all hover:shadow-md">
              <CardHeader className="border-b bg-slate-50/50">
                <CardTitle className="text-base font-semibold flex items-center gap-2 text-slate-800">
                  <ShieldAlert className="w-5 h-5 text-amber-500" />
                  Unit Cancellation Configuration
                </CardTitle>
                <CardDescription>
                  Configure policy parameters for unit cancellation charges and taxation
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-slate-700 font-medium flex items-center gap-1.5">
                      <Percent className="w-4 h-4 text-slate-400" />
                      Agreement Cancellation Charges (% of Agreement Value)
                    </Label>
                    <Input
                      type="number"
                      value={settings.cancellation_charge_percent}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          cancellation_charge_percent: Number(e.target.value),
                        }))
                      }
                      min="0"
                      max="100"
                      step="0.01"
                      className="focus:ring-2 focus:ring-amber-500 transition-all font-mono"
                    />
                    <p className="text-xs text-muted-foreground">
                      Charges calculated as a percentage of the total Agreement Value.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-700 font-medium flex items-center gap-1.5">
                      <Percent className="w-4 h-4 text-slate-400" />
                      Cancellation Charges GST Rate (%)
                    </Label>
                    <Input
                      type="number"
                      value={settings.cancellation_gst_rate}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          cancellation_gst_rate: Number(e.target.value),
                        }))
                      }
                      min="0"
                      max="100"
                      step="0.01"
                      className="focus:ring-2 focus:ring-amber-500 transition-all font-mono"
                    />
                    <p className="text-xs text-muted-foreground">
                      Tax rate applied to cancellation charges (Administrative charges).
                    </p>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t">
                  <Button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-amber-600 hover:bg-amber-700 text-white transition-all duration-200 shadow-sm flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    Save Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="bg-gradient-to-br from-amber-500 to-amber-600 text-white border-0 shadow-md">
              <CardHeader>
                <CardTitle className="text-base text-white">Cancellation Policy</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-amber-50/90 leading-relaxed">
                <p>
                  Once approved, all ledger postings (demands, interest, payments) are offset using ledger reversal credits and debits.
                </p>
                <p className="font-semibold text-white">
                  Current Cancellation Charge: {settings.cancellation_charge_percent}%
                </p>
                <p className="font-semibold text-white">
                  Current GST rate: {settings.cancellation_gst_rate}%
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
