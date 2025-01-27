import { Queue, Worker, QueueOptions, JobsOptions } from "bullmq";
import { BullMQOtel } from "bullmq-otel";
import { env } from "../../utilities/env";
import IORedis from "ioredis";
import { logger } from "../observability/logger";
import { isRetryableError } from "../../utilities/errors";
import { hdx } from "../observability/hyperdx";
import { BaseMessage } from "../sqs";

export type QueueHandler<T> = (data: T) => Promise<void>;

const defaultConnection = new IORedis(env.REDIS_URL);

const telemetry = new BullMQOtel("bullmq");

const defaultQueueOptions: Partial<QueueOptions> = {
  telemetry,
};

export class QueueWrapper<T extends BaseMessage = BaseMessage> {
  private queue: Queue;
  private worker?: Worker;

  constructor(
    private name: string,
    private handler: QueueHandler<T>,
    private options: Omit<QueueOptions, "connection"> & {
      concurrency?: number;
    } = {}
  ) {
    this.queue = new Queue(name, {
      connection: defaultConnection,
      ...defaultQueueOptions,
      ...options,
    });
  }

  async send(data: T, options?: JobsOptions) {
    return this.queue.add(this.name, data, {
      ...options,
      attempts: options?.attempts ?? 3,
    });
  }

  async stop() {
    await this.queue.close();
    await this.worker?.close();
  }

  async inspect() {
    return {
      name: this.name,
      size: await this.queue.getJobCounts(),
      handler: this.handler,
      options: this.options,
    };
  }

  async start() {
    this.worker = new Worker(
      this.name,
      async job => {
        try {
          await this.handler(job.data);
        } catch (e) {
          if (isRetryableError(e)) {
            logger.error("Job failed with retryable error", { error: e });
            throw e;
          }
          hdx?.recordException(e);
          logger.error("Job failed", { error: e, data: job.data });
        }
      },
      {
        connection: defaultConnection,
        telemetry,
        concurrency: this.options.concurrency,
      }
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const queueMap = new Map<string, QueueWrapper<any>>();

export function createQueue<T extends BaseMessage = BaseMessage>(
  name: (typeof QueueNames)[keyof typeof QueueNames],
  handler: QueueHandler<T>,
  options?: Omit<QueueOptions, "connection"> & {
    concurrency?: number;
  }
): QueueWrapper<T> {
  if (queueMap.has(name)) {
    return queueMap.get(name) as QueueWrapper<T>;
  }

  const queue = new QueueWrapper<T>(name, handler, options);
  queueMap.set(name, queue);
  return queue;
}

export const QueueNames = {
  base: "base",
  runProcess: "runProcess",
  generateName: "generateName",
  customerTelemetry: "customerTelemetry",
  externalToolCall: "externalToolCall",
  emailIngestion: "emailIngestion",
  emailIngestionQueue: "emailIngestionQueue",
  externalToolCallQueue: "externalToolCallQueue",
  customerTelemetryQueue: "customerTelemetryQueue",
  runProcessQueue: "runProcessQueue",
} as const;
