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
import { Header } from "@/components/header";

const PostHogPageView = dynamic(() => import("@/components/posthog-pageview"), {
  ssr: false,
});

const CrispWithNoSSR = dynamic(() => import("@/components/crisp-chat"), {
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
    <ClerkProvider>
      <RollbarProvider config={rollbarConfig}>
        <html lang="en">
          <body
            className={cn(
              "min-h-screen bg-background font-sans antialiased",
              fontSans.variable,
            )}
          >
            <Toaster position="top-center" />
            <PHProvider>
              <PostHogUser />
              <PostHogPageView />
              {children}
            </PHProvider>
            <CrispWithNoSSR />
          </body>
        </html>
        <RollbarUser />
        <PostHogUser />
      </RollbarProvider>
    </ClerkProvider>
  );
}
