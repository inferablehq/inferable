/** @type {import('next').NextConfig} */

const nextConfig = {
  output: "standalone",
  productionBrowserSourceMaps: true,
  experimental: {
    instrumentationHook: true,
  },
  // Ignore otel pkgs warnings
  // https://github.com/open-telemetry/opentelemetry-js/issues/4173#issuecomment-1822938936
  webpack: (
    config,
    { isServer },
  ) => {
    if (isServer) {
      config.ignoreWarnings = [{ module: /opentelemetry/ }];
    }
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_INFERABLE_API_URL || "https://api.inferable.ai"}/:path*`, // Proxy to Backend
      },
    ];
  },
};

export default nextConfig;
