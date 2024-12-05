"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useEffect, useState } from "react";
import {
  DeadGrayCircle,
  DeadRedCircle,
  LiveGreenCircle,
  SmallDeadGrayCircle,
  SmallDeadRedCircle,
  SmallLiveGreenCircle,
} from "./circles";

import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "./ui/button";

export class ServerConnectionStatus {
  static events: {
    type: string;
    success: boolean;
    timestamp: Date;
  }[] = [];

  static addEvent(event: { type: string; success: boolean }) {
    this.events.push({
      ...event,
      timestamp: new Date(),
    });

    this.events = this.events.slice(-20);
  }

  static getLastEvent() {
    return this.events[this.events.length - 1];
  }

  static getRecentEvents(count: number = 10) {
    return this.events.slice(-count).reverse();
  }
}

export function ServerConnectionPane() {
  const [lastEvent, setLastEvent] = useState(
    ServerConnectionStatus.getLastEvent()
  );
  const [recentEvents, setRecentEvents] = useState(
    ServerConnectionStatus.getRecentEvents()
  );

  useEffect(() => {
    // Update the status every second
    const interval = setInterval(() => {
      setLastEvent(ServerConnectionStatus.getLastEvent());
      setRecentEvents(ServerConnectionStatus.getRecentEvents());
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const getStatusDisplay = () => {
    if (!lastEvent) {
      return (
        <>
          <DeadGrayCircle />
          <span className="ml-2">Waiting for connection...</span>
        </>
      );
    }

    if (lastEvent.success) {
      return (
        <>
          <LiveGreenCircle />
          <span className="ml-2">Connected to server</span>
        </>
      );
    }

    return (
      <>
        <DeadRedCircle />
        <span className="ml-2">Connection failed</span>
      </>
    );
  };

  const circle = lastEvent?.success ? (
    <SmallLiveGreenCircle />
  ) : lastEvent ? (
    <SmallDeadRedCircle />
  ) : (
    <SmallDeadGrayCircle />
  );

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="w-full text-xs justify-between">
          <span className="mr-2 flex">API</span>
          {circle}
        </Button>
      </SheetTrigger>
      <SheetContent
        style={{ minWidth: "80%" }}
        className="overflow-scroll h-screen"
      >
        <div className="space-y-6">
          <div className="p-4 border rounded-lg">
            <h2 className="text-2xl font-bold mb-2">Server Connection</h2>
            <div className="flex items-center">{getStatusDisplay()}</div>
          </div>

          <div className="border rounded-lg p-4">
            <h2 className="text-2xl font-bold mb-4">Recent Events</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentEvents.length > 0 ? (
                  recentEvents.map((event, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        {event.success ? (
                          <SmallLiveGreenCircle />
                        ) : (
                          <SmallDeadRedCircle />
                        )}
                      </TableCell>
                      <TableCell>{event.type}</TableCell>
                      <TableCell>
                        {event.timestamp.toLocaleTimeString()}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center">
                      <SmallDeadGrayCircle />
                      No events recorded
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
