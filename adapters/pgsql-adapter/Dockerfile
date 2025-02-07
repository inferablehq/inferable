FROM node:20-alpine

WORKDIR /app

# Pre-install pgsql-adapter globally
RUN npm install -g @inferable/pgsql-adapter@latest

# Entrypoint script to handle environment variables
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN addgroup -S inferable && adduser -S inferable -G inferable
USER inferable

ENTRYPOINT ["docker-entrypoint.sh"]
