import jwt, { GetPublicKeyOrSecret } from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { env } from "../../utilities/env";
import { logger } from "../observability/logger";

const client = env.JWKS_URL
  ? jwksClient({
      jwksUri: env.JWKS_URL,
    })
  : null;

const getKey: GetPublicKeyOrSecret = (header, callback) => {
  if (!client) {
    return callback(
      new Error(
        "JWKS client not initialized. Probably missing JWKS_URL in env.",
      ),
    );
  }

  return client.getSigningKey(header.kid, function (err, key) {
    const signingKey = key?.getPublicKey();
    callback(err, signingKey);
  });
};

/**
 * Check the validity of a Clerk issued JWT token.
 */
export const verify = async (
  token: string,
): Promise<
  | {
      userId: string;
      orgId: string;
      orgRole: string;
    }
  | undefined
> => {
  return new Promise((resolve) => {
    jwt.verify(
      token,
      getKey,
      {
        algorithms: ["RS256"],
        ignoreExpiration: env.JWT_IGNORE_EXPIRATION,
      },
      function (err, decoded) {
        if (err instanceof jwt.TokenExpiredError) {
          logger.info("JWT token expired", {
            error: err,
          });
          return resolve(undefined);
        }
        if (err) {
          logger.info("Error verifying JWT token", {
            error: err,
          });
          return resolve(undefined);
        }

        if (!decoded) {
          logger.info("No decoded value from JWT token");
          return resolve(undefined);
        }

        if (typeof decoded.sub !== "string") {
          logger.info("No sub in decoded token");
          return resolve(undefined);
        }

        if (
          typeof (decoded as any)["org_id"] !== "string" ||
          typeof (decoded as any)["org_role"] !== "string"
        ) {
          logger.info("No org_id or org_role in decoded token");
          return resolve(undefined);
        }

        return resolve({
          userId: decoded.sub,
          orgId: (decoded as any)["org_id"],
          orgRole: (decoded as any)["org_role"],
        });
      },
    );
  });
};
