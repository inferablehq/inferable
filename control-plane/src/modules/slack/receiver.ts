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
import { FastifyInstance, FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../observability/logger';

const slackLogger: Logger = {
  debug: (message: string) => logger.debug(message),
  error: (message: string) => logger.error(message),
  info: (message: string) => logger.info(message),
  warn: (message: string) => logger.warn(message),
  getLevel: () => LogLevel.INFO,
  setLevel: () => void 0,
  setName: () => void 0,
}

type FastifySlackReceiverParams = {
  fastify: FastifyInstance
  path: string
  signingSecret: string
}

export class FastifySlackReceiver implements Receiver {
  private fastify: FastifyInstance;
  private app?: App;
  private path: string
  private signingSecret: string

  constructor({
    path,
    fastify,
    signingSecret,
  }: FastifySlackReceiverParams) {
    this.fastify = fastify;
    this.path = path
    this.signingSecret = signingSecret
  }

  init(app: App) {
    this.app = app;
  }

  async start() {
    logger.info("Registering Slack receiver")

    // Register a seperate plugin and disable the content type parsers for the route
    const slackPlugin: FastifyPluginCallback = async (instance) => {
      const contentTypes = ['application/json', 'application/x-www-form-urlencoded'];

      instance.removeContentTypeParser(contentTypes);
      instance.addContentTypeParser(contentTypes, { parseAs: 'string' }, instance.defaultTextParser);

      instance.post('', (request, reply) => this.requestHandler(request, reply));
    };

    this.fastify.register(slackPlugin, { prefix: this.path });
  }

  async stop() {
    this.fastify.server.close((err) => {
      if (err) {
        logger.error("Failed to stop Slack receiver gracefully", {
          error: err,
        })
      }
    })
  }

  async requestHandler(request: FastifyRequest, reply: FastifyReply) {

    const req = request.raw;
    const res = reply.raw;

    try {
      // Verify authenticity
      let bufferedReq: BufferedIncomingMessage;
      try {
        if (typeof request.body !== "string") {
          throw new Error("Expected Slack request body to be a string");
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (req as any).rawBody = Buffer.from(request.body);

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

      await this.app?.processEvent(event);

    } catch (error) {
      logger.error("Failed to handle Slack request", {
        error,
      })
    }
  };
}
