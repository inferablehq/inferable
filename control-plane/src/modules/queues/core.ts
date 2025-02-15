import { Queue, Worker, QueueOptions, JobsOptions } from "bullmq";
import { BullMQOtel } from "bullmq-otel";
import { env } from "../../utilities/env";
import IORedis from "ioredis";
import { BaseMessage, withObservability } from "./observability";

export type QueueHandler<T> = (data: T) => Promise<void>;

const defaultConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

const telemetry = new BullMQOtel("bullmq");

const defaultQueueOptions: Partial<QueueOptions> = {
  telemetry,
  defaultJobOptions: {
    removeOnComplete: {
      age: 300,
    },
    removeOnFail: {
      age: 24 * 3600,
    }
  }
};

export class QueueWrapper<T extends BaseMessage> {
  private queue: Queue;
  private worker?: Worker;

  constructor(
    private name: string,
    private handler: QueueHandler<T>,
    private options: Omit<QueueOptions, "connection"> & {
      concurrency?: number;
    } = {},
    private jobIdKey?: (data: T) => string
  ) {
    this.queue = new Queue(name, {
      connection: defaultConnection,
      ...defaultQueueOptions,
      ...options,
    });
  }

  async send(data: T, options?: JobsOptions): Promise<ReturnType<Queue["add"]>> {
    return this.queue.add(this.name, data, {
      ...options,
      attempts: options?.attempts ?? 3,
      jobId: this.jobIdKey ? this.jobIdKey(data) : undefined,
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
      withObservability<T>(this.name, this.handler),
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

export function createQueue<T extends BaseMessage>(
  name: (typeof QueueNames)[keyof typeof QueueNames],
  handler: QueueHandler<T>,
  options?: Omit<QueueOptions, "connection"> & {
    concurrency?: number;
  },
  jobIdKey?: (data: T) => string
): QueueWrapper<T> {
  if (queueMap.has(name)) {
    return queueMap.get(name) as QueueWrapper<T>;
  }

  const queue = new QueueWrapper<T>(name, handler, options, jobIdKey);
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
  resumeRun: "resumeRun",
} as const;
