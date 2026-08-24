import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1.5 rounded-sm bg-surface-hi border border-line text-muted font-mono text-[12px] font-bold",
        className,
      )}
      {...props}
    />
  );
}
