import React from "react";
import { cn } from "@/lib/utils";

export default function PropFinLogo({ className = "w-8 h-8", showText = false, textClassName = "text-foreground" }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={cn("relative shrink-0 flex items-center justify-center", className)}>
        <svg viewBox="0 0 100 120" className="w-full h-full drop-shadow-sm">
          <defs>
            <linearGradient id="pf-logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#EC4899" />
              <stop offset="35%" stopColor="#D946EF" />
              <stop offset="70%" stopColor="#A855F7" />
              <stop offset="100%" stopColor="#8B5CF6" />
            </linearGradient>
          </defs>
          <path d="M 3 48 C 3 23 23 3 48 3 L 48 48 Z" fill="url(#pf-logo-gradient)" />
          <path d="M 54 3 L 54 48 L 99 48 C 99 23 79 3 54 3 Z" fill="url(#pf-logo-gradient)" />
          <path d="M 54 54 L 99 54 C 99 79 79 99 54 99 Z" fill="url(#pf-logo-gradient)" />
          <path d="M 3 118 L 3 80 C 3 65 23 54 48 54 L 48 118 Z" fill="url(#pf-logo-gradient)" />
        </svg>
      </div>
      {showText && (
        <div className="flex flex-col">
          <span className={cn("text-base font-bold tracking-tight leading-none", textClassName)}>
            Prop<span className="text-pink-500">Fin</span>
          </span>
          <span className="text-[10px] text-muted-foreground font-medium tracking-wider uppercase mt-0.5">
            CRM Platform
          </span>
        </div>
      )}
    </div>
  );
}
