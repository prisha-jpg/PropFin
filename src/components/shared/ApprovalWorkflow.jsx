import React from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, XCircle, Eye } from "lucide-react";

const steps = [
  { key: "pending", label: "Pending", icon: Clock },
  { key: "under_review", label: "Under Review", icon: Eye },
  { key: "approved", label: "Approved", icon: CheckCircle2 },
];

export default function ApprovalWorkflow({ status }) {
  const isRejected = status === "rejected";
  const currentIdx = steps.findIndex(s => s.key === status);

  return (
    <div className="flex items-center gap-2">
      {steps.map((step, i) => {
        const isCompleted = i < currentIdx || status === "completed";
        const isCurrent = i === currentIdx;
        const Icon = step.icon;
        return (
          <React.Fragment key={step.key}>
            {i > 0 && (
              <div className={cn("h-0.5 w-8 rounded", isCompleted ? "bg-emerald-500" : "bg-border")} />
            )}
            <div className="flex items-center gap-1.5">
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center",
                isCompleted ? "bg-emerald-100 text-emerald-600" :
                isCurrent ? "bg-primary/10 text-primary" :
                "bg-muted text-muted-foreground"
              )}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <span className={cn("text-xs font-medium", isCurrent ? "text-foreground" : "text-muted-foreground")}>
                {step.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
      {isRejected && (
        <>
          <div className="h-0.5 w-8 rounded bg-red-300" />
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-full flex items-center justify-center bg-red-100 text-red-600">
              <XCircle className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-medium text-red-600">Rejected</span>
          </div>
        </>
      )}
    </div>
  );
}