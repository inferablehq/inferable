import { Inferable } from "inferable";
import process from "process";

export const inferable = new Inferable({
  apiSecret: process.env.INFERABLE_API_SECRET,
});
