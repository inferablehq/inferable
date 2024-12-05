import React, { useState, useEffect } from "react";

const messages = [
  "Thinking",
  "Consulting the model",
  "Processing some data",
  "Analyzing",
  "Contemplating on next steps",
  "Thinking deeply about the problem",
];

export function ThinkingIndicator() {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const changeMessage = () => {
      // Set next interval randomly between 1000ms and 5000ms
      const nextInterval = Math.floor(Math.random() * 4000) + 1000;
      setTimeout(changeMessage, nextInterval);
    };

    // Start the first interval
    const initialInterval = Math.floor(Math.random() * 4000) + 1000;
    const initialTimeout = setTimeout(changeMessage, initialInterval);

    const dotInterval = setInterval(() => {
      setDots((prev) => (prev.length < 3 ? prev + "." : ""));
    }, 500);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(dotInterval);
    };
  }, []);

  return <p className="text-muted-foreground text-xs ml-5">{dots}</p>;
}
