/**
 * # inferable
 *
 * ## Installation
 *
 * ```bash
 * npm install inferable
 * ```
 *
 * ```bash
 * yarn add inferable
 * ```
 *
 * ```bash
 * pnpm add inferable
 * ```
 */

export { Inferable } from "./Inferable";

export const masked = () => {
  throw new Error("masked is not implemented");
};

export {
  statusChangeSchema,
  handleCustomerAuthSchema,
  ContextInput,
} from "./types";

export {
  validateDescription,
  validateServiceName,
  validateFunctionName,
  validateFunctionSchema,
  validateFunctionArgs,
  blob,
  approvalRequest
} from "./util";

export { createApiClient } from "./create-client";
