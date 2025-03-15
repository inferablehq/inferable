# syntax = docker/dockerfile:1

ARG NODE_VERSION=20.11.1

FROM node:${NODE_VERSION}-slim AS base
WORKDIR /app

FROM base AS build
WORKDIR /build
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3

COPY --link ./ /build/

RUN npm ci

ARG NEXT_PUBLIC_INFERABLE_API_URL
ENV NEXT_PUBLIC_INFERABLE_API_URL=$NEXT_PUBLIC_INFERABLE_API_URL

ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

ARG NEXT_PUBLIC_CLERK_ALLOWED_REDIRECT_ORIGIN
ENV NEXT_PUBLIC_CLERK_ALLOWED_REDIRECT_ORIGIN=$NEXT_PUBLIC_CLERK_ALLOWED_REDIRECT_ORIGIN

ARG NEXT_PUBLIC_HYPERDX_API_KEY
ENV NEXT_PUBLIC_HYPERDX_API_KEY=$NEXT_PUBLIC_HYPERDX_API_KEY

ARG NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_POSTHOG_HOST="https://www.inferable.ai/ingest"


RUN npm run build
RUN npm prune --omit=dev

FROM base AS run

# Install curl for healthchecks
RUN apt-get update -qq && \
    apt-get install -y curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

ARG VERSION
ENV VERSION=$VERSION

ARG SHORT_VERSION
ENV SHORT_VERSION=$SHORT_VERSION

COPY --from=build /build/ /app
COPY --from=build /build/package.json /app/package.json
COPY --from=build /build/node_modules /app/node_modules

COPY --from=build /build/.next/standalone /app
COPY --from=build /build/.next/static /app/.next/static

ENV NODE_ENV=production

EXPOSE 3001
CMD [ "node", "server.js" ]
