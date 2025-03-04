import { getEncoding } from "js-tiktoken";

//https://github.com/openai/openai-cookbook/blob/main/examples/How_to_count_tokens_with_tiktoken.ipynb
// gpt-4, gpt-3.5-turbo, text-embedding-ada-002, text-embedding-3-small, text-embedding-3-large
export const estimateTokenCount = async (input?: string) =>
  getEncoding("cl100k_base").encode(input ?? "").length;
