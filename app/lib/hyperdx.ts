import HyperDX from "@hyperdx/browser";

process.env.NEXT_PUBLIC_HYPERDX_API_KEY &&
  HyperDX.init({
    apiKey: process.env.NEXT_PUBLIC_HYPERDX_API_KEY,
    service: "app",
    tracePropagationTargets: [
      process.env.NEXT_PUBLIC_INFERABLE_API_URL ?? "",
      process.env.NEXT_PUBLIC_APP_URL ?? "",
    ],
    disableReplay: true,
  });
