"use client";

import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";

export function MobileBlockScreen() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Check if the screen width is less than 768px (typical mobile breakpoint)
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    // Initial check
    checkMobile();

    // Add event listener for window resize
    window.addEventListener("resize", checkMobile);

    // Clean up
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  if (!isMobile) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center p-6 text-center">
      <Smartphone className="h-16 w-16 mb-4 text-primary" />
      <h2 className="text-2xl font-bold mb-2">Desktop View Required</h2>
      <p className="text-muted-foreground mb-6 max-w-md">
        This application is optimized for desktop use. Please access it from a
        larger screen for the best experience.
      </p>
      <div className="text-sm text-muted-foreground">
        <p>
          Screen width: {typeof window !== "undefined" ? window.innerWidth : 0}
          px
        </p>
      </div>
    </div>
  );
}
