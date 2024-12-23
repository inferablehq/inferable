import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import Image from "next/image";
import logo from "./logo.png";

// Common appearance settings for Clerk components
const clerkAppearance = {
  variables: {
    colorText: "black",
  },
  elements: {
    rootBox: "flex items-center",
    userButtonBox: "flex items-center",
    organizationSwitcherTrigger: "flex items-center"
  }
};

export function Header() {
  return (
    <header className="sticky top-0 z-50 flex items-center justify-between w-full h-16 px-8 bg-white/95 backdrop-blur-sm border-b">
      <div className="flex items-center gap-8">
        <a href="/" className="flex items-center space-x-4">
          <div className="flex items-center space-x-4 -ml-2">
            <Image src={logo} width={40} height={40} alt={"logo"} />
            <h1 className="text-2xl">Inferable</h1>
          </div>
        </a>
      </div>
      <div className="flex items-center gap-4">
        <UserButton
          appearance={clerkAppearance}
        />
        <OrganizationSwitcher
          hidePersonal={true}
          appearance={clerkAppearance}
          afterSelectOrganizationUrl="/switch-org"
        />
      </div>
    </header>
  );
}
