"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface MultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  options: { value: string; label: string }[];
}

export function MultiSelect({ value, onChange, options }: MultiSelectProps) {
  const [search, setSearch] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const filteredOptions = options.filter(
    (option) =>
      !value.includes(option.value) &&
      option.label.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {value.map((item) => (
          <Badge key={item} variant="secondary" className="hover:bg-secondary">
            {options.find((opt) => opt.value === item)?.label || item}
            <button
              className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              onClick={() => onChange(value.filter((v) => v !== item))}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="relative">
        <Input
          ref={inputRef}
          className="w-full text-xs"
          placeholder="Search functions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && filteredOptions.length > 0 && (
          <div className="absolute w-full z-10 bg-white border rounded-md mt-1 shadow-sm max-h-[200px] overflow-y-auto">
            {filteredOptions.map((option) => (
              <button
                key={option.value}
                className={cn(
                  "w-full text-left px-2 py-1 text-xs hover:bg-secondary/40",
                  "focus:bg-secondary/40 focus:outline-none",
                )}
                onClick={() => {
                  onChange([...value, option.value]);
                  setSearch("");
                  inputRef.current?.focus();
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
