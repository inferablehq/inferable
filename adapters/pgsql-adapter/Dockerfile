FROM node:20-alpine

WORKDIR /app

# Pre-install pgsql-adapter globally
RUN npm install -g @inferable/pgsql-adapter@0.0.8

# Entrypoint script to handle environment variables
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Add health-check script
COPY health-check.sh /usr/local/bin/health-check
RUN chmod +x /usr/local/bin/health-check

RUN addgroup -S inferable && adduser -S inferable -G inferable
USER inferable

ENTRYPOINT ["docker-entrypoint.sh"]
