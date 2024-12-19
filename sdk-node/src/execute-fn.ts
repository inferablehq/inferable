import { serializeError } from "./serialize-error";
import { FunctionRegistration } from "./types";
import { extractInterrupt } from "./util";

export type Result<T = unknown> = {
  content: T;
  type: "resolution" | "rejection" | "interrupt";
  functionExecutionTime?: number;
};

export const executeFn = async (
  fn: FunctionRegistration["func"],
  args: Parameters<FunctionRegistration["func"]>,
): Promise<Result> => {
  const start = Date.now();
  try {
    const result = await fn(...args);

    const interupt = extractInterrupt(result);

    if (interupt) {
      return {
        content: interupt,
        type: "interrupt",
        functionExecutionTime: Date.now() - start,
      };
    }

    return {
      content: result,
      type: "resolution",
      functionExecutionTime: Date.now() - start,
    };
  } catch (e) {
    const interupt = extractInterrupt(e);
    if (interupt) {
      return {
        content: interupt,
        type: "interrupt",
        functionExecutionTime: Date.now() - start,
      };
    }
    const functionExecutionTime = Date.now() - start;
    if (e instanceof Error) {
      return {
        content: serializeError(e),
        type: "rejection",
        functionExecutionTime,
      };
    } else if (typeof e === "string") {
      return {
        content: serializeError(new Error(e)),
        type: "rejection",
        functionExecutionTime,
      };
    } else {
      return {
        content: new Error(
          "Inferable encountered an unexpected error type. Make sure you are throwing an Error object.",
        ),
        type: "rejection",
        functionExecutionTime,
      };
    }
  }
};
