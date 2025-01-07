'use client';

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

interface HeaderProps {
  onGenerateClick: () => void;
}

export function Header({ onGenerateClick }: HeaderProps) {
  const router = useRouter();

  const handleClick = () => {
    router.push("?showSelect=true");
  };

  return (
    <div className="flex justify-between items-center mb-2">
      <h1 className="text-2xl font-bold">Email Integration</h1>
      <Button 
        onClick={handleClick}
        className="bg-[#18181B] text-white hover:bg-[#27272A]"
      >
        <Plus className="w-4 h-4 mr-2" />
        Generate New Email
      </Button>
    </div>
  );
}
