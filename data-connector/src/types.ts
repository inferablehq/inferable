import type { ContextInput, Inferable } from "inferable";

export interface DataConnector {
  initialize(): Promise<void>;
  createService(client: Inferable): any;
}
