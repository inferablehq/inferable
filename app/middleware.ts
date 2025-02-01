import { authMiddleware } from "@clerk/nextjs";

export default authMiddleware({
  ignoredRoutes: ["/api/health"],
  apiRoutes: ["/api/(.*)"],
});

export const config = {
  matcher: ["/((?!_next).*)", "/", "/api/:path*"],
};
