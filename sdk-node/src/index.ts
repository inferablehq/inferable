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
  onStatusChangeInput,
  handleCustomAuthInput,
  ContextInput,
} from "./types";

export {
  validateDescription,
  validateServiceName,
  validateFunctionName,
  validateFunctionSchema,
  validateFunctionArgs,
  blob,
  Interrupt
} from "./util";

export { createApiClient } from "./create-client";
