'use client';

import { OrganizationSwitcher, UserButton } from '@clerk/nextjs';
import Image from 'next/image';
import logo from './logo.png';
import { Menu } from 'lucide-react';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetClose } from './ui/sheet';
import { NavigationItems } from './breadcrumbs';
import { useParams } from 'next/navigation';

export function Header() {
  const params = useParams();
  const clusterId = params?.clusterId as string;

  const navigationItems = NavigationItems({ clusterId });
  if (!navigationItems) return null;

  const navigationLinks = Array.isArray(navigationItems.props.children)
    ? navigationItems.props.children
    : [navigationItems.props.children];

  return (
    <header className="flex items-center justify-between w-full h-16 px-8">
      {/* Left section with menu */}
      <div className="flex items-center md:hidden">
        {/* Mobile menu */}
        <div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[240px] flex flex-col gap-2 pt-8">
              {/* User profile section */}
              <div className="mb-4 pb-4 border-b">
                <div className="flex justify-center mb-4">
                  <UserButton
                    appearance={{
                      variables: {
                        colorText: 'black',
                      },
                    }}
                  />
                </div>
                <OrganizationSwitcher
                  hidePersonal={true}
                  appearance={{
                    variables: {
                      colorText: 'black',
                    },
                    elements: {
                      rootBox: 'w-full',
                      organizationSwitcherTrigger: 'w-full',
                    },
                  }}
                  afterSelectOrganizationUrl="/switch-org"
                />
              </div>
              {/* Navigation section */}
              <h2 className="font-medium mb-2 text-sm">Navigation</h2>
              {navigationLinks.map(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (child: any, index: any) =>
                  child && (
                    <SheetClose key={index} asChild>
                      {child}
                    </SheetClose>
                  )
              )}
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Logo and text section - centered on mobile, left on desktop */}
      <div className="flex-1 flex justify-center md:justify-start">
        <a href="/" className="flex items-center">
          <div className="flex items-center space-x-3">
            <Image className="w-8 h-8 md:w-10 md:h-10" src={logo} width={40} height={40} alt={'logo'} />
            <h1 className="text-xl md:text-2xl">Playground</h1>
          </div>
        </a>
      </div>

      {/* Right section with desktop controls */}
      <div className="flex items-center space-x-8 md:flex-none">
        {/* Desktop user controls */}
        <div className="hidden md:flex items-center space-x-8">
          <UserButton
            appearance={{
              variables: {
                colorText: 'black',
              },
            }}
          />
          <div className="pt-2">
            <OrganizationSwitcher
              hidePersonal={true}
              appearance={{
                variables: {
                  colorText: 'black',
                },
              }}
              afterSelectOrganizationUrl="/switch-org"
            />
          </div>
        </div>
      </div>
    </header>
  );
}
