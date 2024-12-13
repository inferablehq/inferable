import {
  App,
  Receiver,
  ReceiverEvent,
  BufferedIncomingMessage,
  HTTPModuleFunctions as boltHelpers,
  HTTPResponseAck,
  Logger,
  LogLevel,
} from '@slack/bolt'
import { FastifyInstance } from 'fastify';
import { createServer } from 'http';
import { logger } from '../observability/logger';

const slackLogger: Logger = {
  debug: (message: string) => logger.debug(message),
  error: (message: string) => logger.error(message),
  info: (message: string) => logger.info(message),
  warn: (message: string) => logger.warn(message),
  getLevel: () => LogLevel.INFO,
  setLevel: (level: string) => void 0,
  setName: (name: string) => void 0,
}

export class FastifySlackReceiver implements Receiver {
  fastify: FastifyInstance;
  app?: App;
  path: string
  signingSecret: string

  constructor({
    path = '/slack/events',
    fastify,
    signingSecret,
  }: {
      path?: string
      fastify: FastifyInstance
      signingSecret: string
    }) {
    this.fastify = fastify;
    this.path = path
    this.signingSecret = signingSecret
  }

  init(app: App) {
    this.app = app;
  }

  start() {
    logger.info("Starting Slack receiver")

    return new Promise((resolve, reject) => {
      try {
        // Bind request handler
        this.fastify.post(this.path, (request, reply) => this.requestHandler(request, reply));
        resolve(void 0);
      } catch (error) {
        reject(error);
      }
    });
  }

  stop() {
    logger.info("Stopping Slack receiver")

    return new Promise((resolve, reject) => {
      this.fastify.server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(void 0);
      })
    })
  }

  async requestHandler(request: any, response: any) {
    const req = request.raw;
    const res = response.raw;
    try {
      // Verify authenticity
      let bufferedReq: BufferedIncomingMessage;
      try {
        const bodyString = typeof request.body === "string"
            ? request.body
            : JSON.stringify(request.body);


        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (req as any).rawBody = Buffer.from(bodyString);

        bufferedReq = await boltHelpers.parseAndVerifyHTTPRequest(
          {
            enabled: true,
            signingSecret: this.signingSecret,
          },
          req,
        );
      } catch (error) {
        logger.warn("Failed to parse and verify Slack request", {
          error,
        });
        boltHelpers.buildNoBodyResponse(res, 401);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let body: any;
      try {
        body = boltHelpers.parseHTTPRequestBody(bufferedReq);
      } catch (error) {
        logger.warn("Malformed Slack request", {
          error,
        });
        boltHelpers.buildNoBodyResponse(res, 400);
        return;
      }

      if (body.ssl_check) {
        boltHelpers.buildSSLCheckResponse(res);
        return;
      }

      if (body.type === 'url_verification') {
        boltHelpers.buildUrlVerificationResponse(res, body);
        return;
      }

      const ack = new HTTPResponseAck({
        logger: slackLogger,
        processBeforeResponse: false,
        unhandledRequestHandler: () => {
          logger.warn("Unhandled Slack request");
        },
        httpRequest: bufferedReq,
        httpResponse: res,
      });

      const event: ReceiverEvent = {
        body,
        ack: ack.bind(),
        retryNum: boltHelpers.extractRetryNumFromHTTPRequest(req),
        retryReason: boltHelpers.extractRetryReasonFromHTTPRequest(req),
      };

      try {
        logger.info("Processing Slack request", {
          event,
        });
        await this.app?.processEvent(event);
      } catch (error) {
        logger.error("Failed to process Slack request", {
          error,
        })
      }
    } catch (error) {
      logger.error("Failed to process Slack request", {
        error,
      })
    }
  };
}
