FROM node:20-slim

RUN apt-get update && apt-get install -y \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY src ./src
COPY config.json ./config.json

# Expose DEBUG traces
ENV DEBUG=inferable:*

EXPOSE 4985

ARG INFERABLE_API_SECRET

ENV INFERABLE_API_SECRET=$INFERABLE_API_SECRET

CMD ["npm", "start"]
