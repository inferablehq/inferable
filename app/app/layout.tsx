"use client";

import { PostHogUser } from "@/components/posthog-user";
import { RollbarUser } from "@/components/rollbar-user";
import { cn } from "@/lib/utils";
import { ClerkProvider } from "@clerk/nextjs";
import { Provider as RollbarProvider } from "@rollbar/react";
import dynamic from "next/dynamic";
import { Inter as FontSans } from "next/font/google";
import posthog from "posthog-js";
import { useEffect } from "react";
import { Toaster } from "react-hot-toast";
import "./globals.css";
import { PHProvider } from "./providers";
import "@/lib/hyperdx";
import { HelpCircle, SlackIcon } from "lucide-react";
import { MobileBlockScreen } from "@/components/mobile-block-screen";

const PostHogPageView = dynamic(() => import("@/components/posthog-pageview"), {
  ssr: false,
});

const fontSans = FontSans({
  subsets: ["latin"],
  variable: "--font-sans",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  useEffect(() => {
    if (window.location.host) {
      process.env.NEXT_PUBLIC_POSTHOG_KEY &&
        posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
          api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        });
    }
  }, []);

  const rollbarConfig = process.env.NEXT_PUBLIC_ROLLBAR_CLIENT_TOKEN
    ? {
        accessToken: process.env.NEXT_PUBLIC_ROLLBAR_CLIENT_TOKEN,
        captureUncaught: true,
        captureUnhandledRejections: true,
        payload: {
          environment: process.env.NEXT_PUBLIC_ENVIRONMENT ?? "development",
        },
      }
    : {
        enabled: false,
      };

  return (
    <ClerkProvider
      allowedRedirectOrigins={[
        process.env.NEXT_PUBLIC_CLERK_ALLOWED_REDIRECT_ORIGIN ?? "",
      ]}
    >
      <RollbarProvider config={rollbarConfig}>
        <html lang="en">
          <body
            className={cn(
              "min-h-screen bg-background font-sans antialiased",
              fontSans.variable,
            )}
          >
            <Toaster
              position="top-center"
              toastOptions={{ className: "text-sm" }}
            />
            <PHProvider>
              <PostHogUser />
              <PostHogPageView />
              <MobileBlockScreen />
              {children}
              <a
                href="https://go.inferable.ai/slack"
                target="_blank"
                rel="noopener noreferrer"
                className="fixed bottom-6 right-6 z-50 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors flex items-center gap-1.5"
                aria-label="Join our Slack community"
              >
                <SlackIcon className="h-4 w-4 bg-black rounded-full" />
                Need Help?
              </a>
            </PHProvider>
          </body>
        </html>
        <RollbarUser />
        <PostHogUser />
      </RollbarProvider>
    </ClerkProvider>
  );
}
