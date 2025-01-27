import * as langfuse from "./langfuse";
import * as toolhouse from "./toolhouse";

export const start = () => {
  langfuse.start();
  toolhouse.start();
};

export const stop = () => {
  // do nothing
};
