"use client";

import React, { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Minus, Plus } from "lucide-react";
import { formatRelative } from "date-fns";

export interface Node {
  id: string;
  title: string;
  time: Date;
  label?: string;
  color?: string;
  icon?: React.ReactNode;
  interactive?: boolean;
}

export interface WorkflowTimelineProps {
  nodes: Node[];
  className?: string;
  onNodeClick?: (node: Node) => void;
  horizontalSpacing?: number;
  verticalSpacing?: number;
  initialZoom?: number;
}

const DEFAULT_HORIZONTAL_SPACING = 200;
const DEFAULT_VERTICAL_SPACING = 70;
const NODE_SIZE = 64;
const HALF_NODE_SIZE = NODE_SIZE / 2;

export function WorkflowTimeline({
  nodes,
  className,
  onNodeClick,
  horizontalSpacing = DEFAULT_HORIZONTAL_SPACING,
  verticalSpacing = DEFAULT_VERTICAL_SPACING,
  initialZoom = 1,
}: WorkflowTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(initialZoom);

  const handleZoom = (delta: number) => {
    setZoom(prev => Math.min(Math.max(0.5, prev + delta), 2));
  };

  const getPathBetweenNodes = (index: number) => {
    if (index >= nodes.length - 1) return null;

    // Calculate center points
    const node1CenterX = index * horizontalSpacing + HALF_NODE_SIZE;
    const node1Bottom = index * verticalSpacing + HALF_NODE_SIZE;

    const node2Left = (index + 1) * horizontalSpacing + HALF_NODE_SIZE;
    const node2CenterY = (index + 1) * verticalSpacing + HALF_NODE_SIZE;

    // Create path: start from bottom center, go down, then right, to left center of next node
    return `M ${node1CenterX} ${node1Bottom} L ${node1CenterX} ${node2CenterY} L ${node2Left} ${node2CenterY}`;
  };

  return (
    <div ref={containerRef} className={cn("relative w-full h-[500px] overflow-hidden", className)}>
      <div className="absolute inset-0 overflow-auto">
        <div
          className="absolute w-full h-full p-10"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {/* Draw lines first so they appear behind nodes */}
          <svg className="absolute w-full h-full pointer-events-none">
            <defs>
              <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                <path
                  d="M 50 0 L 0 0 0 50"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  className="text-muted-foreground/10"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
            {nodes.map((_, index) => {
              const path = getPathBetweenNodes(index);
              return (
                path && (
                  <path
                    key={`path-${index}`}
                    d={path}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                    className="text-muted-foreground/50"
                  />
                )
              );
            })}
          </svg>
          {/* Nodes rendered after lines */}
          {nodes
            .sort((a, b) => a.time.getTime() - b.time.getTime())
            .map((node, index) => (
            <div
              key={node.id}
              className="absolute flex items-center"
              style={{
                top: `${index * verticalSpacing + 40}px`,
                left: `${index * horizontalSpacing + 40}px`,
              }}
            >
              <div
                onClick={() => node.interactive && onNodeClick?.(node)}
                className={cn(
                  "w-16 h-16 rounded-lg flex items-center justify-center shadow-md transition-transform duration-200",
                  node.color || "bg-gray-200",
                  node.interactive && "hover:scale-110 cursor-pointer",
                  node.interactive && "active:scale-105"
                )}
              >
                {node.icon && (
                  <div className="flex items-center justify-center w-8 h-8">{node.icon}</div>
                )}
              </div>
              <div className="flex flex-col ml-3">
                <span className="text-xs font-semibold text-foreground">{node.title}</span>
                {node.label && (<span className="text-xs text-muted-foreground">{node.label}</span>)}
                <span className="text-xs text-muted-foreground">{formatRelative(node.time, new Date())}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-background to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-background to-transparent" />
      <div className="absolute bottom-6 right-6 flex gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => handleZoom(-0.1)}
          className="h-8 w-8 rounded-full bg-background"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => handleZoom(0.1)}
          className="h-8 w-8 rounded-full bg-background"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
