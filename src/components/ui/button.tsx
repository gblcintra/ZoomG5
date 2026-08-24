import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "sm" | "icon";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-ui font-bold tracking-[0.12em] uppercase transition-all disabled:opacity-40 disabled:pointer-events-none select-none",
        variant === "default"  && "bg-signal text-white hover:bg-signal-hi rounded-md",
        variant === "ghost"    && "bg-surface-hi border border-line text-muted hover:text-ink hover:border-line-hi rounded-sm",
        variant === "outline"  && "border border-line-hi bg-transparent text-ink hover:bg-surface-hhi rounded-md",
        size === "default"     && "px-4 py-2.5 text-[11.5px]",
        size === "sm"          && "px-3.5 py-2 text-[10.5px]",
        size === "icon"        && "p-2",
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { Button };
