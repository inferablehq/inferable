import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import Image from "next/image";
import logo from "./logo.png";

export function Header() {
  return (
    <header className="flex items-center justify-between w-full h-16 px-8">
      <div className="flex items-center space-x-8">
        <a href="/" className="flex items-center space-x-4">
          <div className="flex items-center space-x-4 -ml-2">
            <Image src={logo} width={40} height={40} alt={"logo"} />
            <h1 className="text-2xl">Playground</h1>
          </div>
        </a>
      </div>
      <div className="flex items-center space-x-8">
        <UserButton
          appearance={{
            variables: {
              colorText: "black",
            },
          }}
        />
        <div className="pt-2">
          <OrganizationSwitcher
            hidePersonal={true}
            appearance={{
              variables: {
                colorText: "black",
              },
            }}
            afterSelectOrganizationUrl="/switch-org"
          />
        </div>
      </div>
    </header>
  );
}
