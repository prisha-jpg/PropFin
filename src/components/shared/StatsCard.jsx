import React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function StatsCard({ title, value, icon: Icon, trend, trendLabel, className }) {
  return (
    <Card className={cn("p-5 relative overflow-hidden", className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold text-foreground mt-1.5">{value}</p>
          {trendLabel && (
            <p className={cn("text-xs font-medium mt-2", trend > 0 ? "text-emerald-600" : trend < 0 ? "text-red-600" : "text-muted-foreground")}>
              {trend > 0 ? "↑" : trend < 0 ? "↓" : "—"} {trendLabel}
            </p>
          )}
        </div>
        {Icon && (
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        )}
      </div>
    </Card>
  );
}