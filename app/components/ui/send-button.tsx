"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Command } from "lucide-react";

interface SendButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  disabled?: boolean;
  children?: React.ReactNode;
  showShortcut?: boolean;
}

export function SendButton({
  className,
  disabled,
  children,
  showShortcut = true,
  ...props
}: SendButtonProps) {
  // Check if user is on Mac
  const isMac =
    typeof window !== "undefined" ? navigator.platform.toUpperCase().indexOf("MAC") >= 0 : false;

  return (
    <Button size="sm" className={cn("gap-2", className)} disabled={disabled} {...props}>
      {children || "Send"}
      {showShortcut && (
        <span className="text-xs opacity-50 hidden sm:inline-flex items-center gap-1">
          {isMac ? <>⌘</> : <Command className="h-3 w-3" />}+ Enter
        </span>
      )}
    </Button>
  );
}
