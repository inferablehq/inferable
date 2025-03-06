"use client";

import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import Image from "next/image";
import logo from "./logo.png";
import { useTheme } from "next-themes";

export function Header() {
  const { systemTheme } = useTheme();

  const clerkAppearance = {
    variables: {
      colorText: systemTheme === "dark" ? "white" : "black",
      fontSize: "14px",
    },
    elements: {
      rootBox: "flex items-center",
      userButtonBox: "flex items-center",
      organizationSwitcherTrigger:
        "flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent transition-colors duration-200",
    },
  };

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between w-full h-16 pl-7 bg-background/95 backdrop-blur-sm border-b shadow-sm">
      <div className="flex flex-row items-center gap-4">
        <a
          href="/"
          className="flex items-center space-x-4 transition-transform duration-200 hover:scale-[1.02]"
        >
          <div className="flex items-center space-x-2 -ml-2">
            <Image
              src={logo}
              width={40}
              height={40}
              alt={"logo"}
              className="rounded-lg"
            />
            <h1 className="text-2xl font-semibold bg-gradient-to-r from-foreground/60 via-foreground to-foreground/60 bg-clip-text text-transparent tracking-tight">
              Inferable
            </h1>
          </div>
        </a>
      </div>
      <div className="flex items-center gap-6">
        <UserButton
          appearance={clerkAppearance}
          afterSignOutUrl="/"
          signInUrl="/sign-in"
          showName
        />
        <div className="h-6 w-[1px] bg-border" />
        <OrganizationSwitcher
          hidePersonal={true}
          appearance={clerkAppearance}
          afterCreateOrganizationUrl="/"
          afterLeaveOrganizationUrl="/"
          afterSelectOrganizationUrl="/switch-org"
        />
      </div>
    </header>
  );
}
