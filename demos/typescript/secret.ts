export const apiSecret = process.argv
  .find((arg) => arg.startsWith("--secret="))
  ?.split("=")[1];
