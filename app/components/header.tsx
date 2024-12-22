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
  const clusterId = params.clusterId as string;

  const navigationItems = NavigationItems({ clusterId });
  if (!navigationItems) return null;

  const navigationLinks = Array.isArray(navigationItems.props.children) 
    ? navigationItems.props.children 
    : [navigationItems.props.children];

  return (
    <header className="flex items-center justify-between w-full h-16 px-8">
      <div className="flex items-center space-x-8">
        <div className="flex items-center gap-4">
          {/* Mobile menu */}
          <div className="md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[240px] flex flex-col gap-2 pt-8">
                {navigationLinks.map((child, index) => (
                  <SheetClose key={index} asChild>
                    {child}
                  </SheetClose>
                ))}
              </SheetContent>
            </Sheet>
          </div>
          <a href="/" className="flex items-center space-x-4">
            <div className="flex items-center space-x-4 -ml-2">
              <Image className="hidden md:block" src={logo} width={40} height={40} alt={'logo'} />
              <h1 className="text-2xl hidden md:block">Playground</h1>
            </div>
          </a>
        </div>
      </div>
      <div className="flex items-center space-x-8">
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
    </header>
  );
}
