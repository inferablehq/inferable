import {
  Attributes,
  SpanOptions,
  Context,
  Span,
  trace,
  propagation,
  context,
} from "@opentelemetry/api";
import { logContext } from "./logger";

// https://www.w3.org/TR/trace-context/
export interface TraceContextCarrier {
  traceparent?: string;
  tracestate?: string;
}

export const extractTraceContext = (carrier: TraceContextCarrier): Context | undefined => {
  return propagation.extract(context.active(), carrier);
};

export const injectTraceContext = (): TraceContextCarrier => {
  const output = {};
  propagation.inject(context.active(), output);
  return output;
};

export const addAttributes = (attributes: Attributes) => {
  const currentSpan = trace.getActiveSpan();
  if (!currentSpan) {
    return;
  }

  currentSpan.setAttributes(attributes);
};

export const withSpan = async <T>(
  spanName: string,
  fn: () => Promise<T>,
  options?: SpanOptions,
  context?: Context
): Promise<T> => {
  const handler = async (span: Span) => {
    let result: T;
    try {
      // Wrap the span in a new log context with the attributes
      result = await logContext.run(
        {
          ...(logContext.getStore() ?? {}),
          ...(options?.attributes ?? {}),
        },
        () => fn()
      );
    } catch (error) {
      if (error instanceof Error) {
        span.recordException(error);
      }
      throw error;
    } finally {
      span.end();
    }
    return result;
  };

  if (!!context) {
    return trace
      .getTracer("inferable-tracer")
      .startActiveSpan(spanName, options ?? {}, context, handler);
  }

  return trace.getTracer("inferable-tracer").startActiveSpan(spanName, options ?? {}, handler);
};
