import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import * as crypto from "crypto";
import toast from "react-hot-toast";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const unpack = (data: any): any => {
  try {
    return JSON.parse(data).value;
  } catch (e) {
    return data;
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const pack = (data: any): string => JSON.stringify(data);

export const formatServiceName = (name: string) => {
  if (name.startsWith("i_")) {
    const [, integrationType, ...rest] = name.split("_");
    return `${integrationType}:${rest.join("_")}`;
  }

  return name;
};

export const isInternalService = (name: string) => name.startsWith("i_");

/**
 * Creates an error toast from a response or a fallback if none is found.
 * Uses the hash of the error message as the toast id to avoid duplicates.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createErrorToast = (response: any, fallback: string) => {
  const errorMessage =
    response?.body?.error?.message ||
    response?.error?.message ||
    response?.body?.message ||
    fallback;

  const id = crypto.createHash("md5").update(errorMessage).digest("hex");

  toast.error(errorMessage, {
    id,
  });
};

export const pluralize = (word: string, count: number) => {
  if (count === 0) {
    return `${word}s`;
  }

  return count > 1 ? `${word}s` : word;
};

