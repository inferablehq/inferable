/**
 * A service class that provides a server for handling function registration and execution.
 * It supports optional authentication and provides metadata about registered functions.
 *
 * @example
 * ```ts
 * const service = new InferableService({
 *   description: "My functions",
 *   token: "optional-auth-token"
 * });
 *
 * service.registerFunction({
 *   name: "sum",
 *   description: "Sum two numbers",
 *   handler: async (input) => input.a + input.b,
 *   input: {
 *     type: "object",
 *     properties: {
 *       a: { type: "number" },
 *       b: { type: "number" },
 *     },
 *     required: ["a", "b"],
 *   },
 * });
 * ```
 */
export class InferableService {
  /** Array of registered functions with their metadata and handlers */
  private functions: Parameters<InferableService["registerFunction"]>[0][] = [];

  constructor(
    private options: {
      /**
       * A description of the service.
       */
      description: string;

      /**
       * A token to authenticate requests to the service. If not provided, authentication is disabled.
       */
      token?: string;
    },
  ) {}

  /**
   * Register a new function with the service.
   *
   * @param options The configuration options for the function
   * @param options.name The name of the function to register
   * @param options.description A human-readable description of what the function does
   * @param options.handler An async function that handles the execution
   * @param options.input JSON Schema object describing the expected input format
   */
  registerFunction(options: {
    name: string;
    description: string;
    handler: (input: any) => Promise<any>;
    input: {
      type: "object";
      properties: {
        [key: string]: any;
      };
      required: string[];
    };
  }): void {
    this.functions.push(options);
  }

  /**
   * Checks if the provided token matches the configured authentication token.
   *
   * @param token The authentication token to verify
   * @returns True if authentication is successful or disabled, false otherwise
   */
  private isAuthenticated(token: string | null): boolean {
    if (!this.options.token) {
      return true; // If no token is configured, authentication is disabled
    }
    return token === this.options.token;
  }

  /**
   * Creates and returns a server request handler function.
   * The server supports the following endpoints:
   * - GET /meta: Returns metadata about the service and registered functions
   * - POST /exec/functions/{functionName}: Executes a registered function
   *
   * @returns A function that handles incoming HTTP requests
   */
  getServer(): (request: Request) => Promise<Response> {
    const server = async (request: Request): Promise<Response> => {
      console.log(`[Inferable Adapter] Incoming request to: ${request.url}`);

      const url = new URL(request.url);
      const path = url.pathname;

      const hasToken = this.options.token !== undefined;
      const authHeader = request.headers.get("Authorization");
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

      console.log(`[Inferable Adapter] Authentication status: hasToken=${hasToken}, token=${token ? 'provided' : 'not provided'}`);

      if (!hasToken) {
        console.warn("[Inferable Adapter] No token provided. Authentication is disabled. See https://docs.inferable.ai/valtown to learn how to enable it.");
      }

      // Metadata route
      if (path === "/meta") {
        console.log("[Inferable Adapter] Handling /meta request");
        if (hasToken && !this.isAuthenticated(token)) {
          console.log("[Inferable Adapter] /meta request unauthorized");
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        const metadata = {
          description: this.options.description,
          functions: Object.values(this.functions).map(func => ({
            name: func.name,
            description: func.description,
            input: func.input,
          })),
        };
        console.log("[Inferable Adapter] Returning metadata:", metadata);
        return new Response(JSON.stringify(metadata), {
          headers: { "content-type": "application/json" },
        });
      }

      // Execution route
      if (path.startsWith("/exec/functions/")) {
        console.log("[Inferable Adapter] Handling function execution request");
        if (hasToken && !this.isAuthenticated(token)) {
          console.log("[Inferable Adapter] Function execution unauthorized");
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        const functionName = path.split("/")[3];
        console.log(`[Inferable Adapter] Attempting to execute function: ${functionName}`);

        if (request.method !== "POST") {
          console.log(`[Inferable Adapter] Invalid method ${request.method} for function execution`);
          return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers: { "content-type": "application/json" },
          });
        }

        try {
          const input = await request.json();
          console.log(`[Inferable Adapter] Function input:`, input);

          const handler = this.functions.find(func => func.name === functionName);

          if (!handler) {
            console.log(`[Inferable Adapter] Function ${functionName} not found`);
            return new Response(JSON.stringify({ error: `Function ${functionName} not found` }), {
              status: 404,
              headers: { "content-type": "application/json" },
            });
          }

          console.log(`[Inferable Adapter] Executing function ${functionName}`);
          const result = await handler.handler(input);
          console.log(`[Inferable Adapter] Function ${functionName} result:`, result);

          return new Response(JSON.stringify({ result }));
        } catch (error) {
          console.error(`[Inferable Adapter] Error executing function:`, error);
          return new Response(JSON.stringify({ error: `Error occurred during execution: ${error}` }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
      }

      // Default route
      console.log(`[Inferable Adapter] Route not found: ${path}`);
      return new Response(
        JSON.stringify({
          error: `Route not found: ${path}`,
        }),
        {
          status: 404,
          headers: { "content-type": "application/json" },
        },
      );
    };

    return server;
  }
}

//
// Usage
//

// const service = new InferableService({
//   description: "My functions",
// });

// service.registerFunction({
//   name: "sum",
//   description: "Sum two numbers",
//   handler: (input: { a: number; b: number }) => Promise.resolve(input.a + input.b),
//   input: {
//     type: "object",
//     properties: {
//       a: { type: "number" },
//       b: { type: "number" },
//     },
//     required: ["a", "b"],
//   },
// });

// const server = service.getServer();

// export default server;
