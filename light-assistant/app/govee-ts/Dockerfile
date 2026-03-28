FROM public.ecr.aws/docker/library/node:22-slim AS builder

WORKDIR /app

# Install all dependencies (including dev for TypeScript compilation)
COPY package.json ./
RUN npm install

# Build TypeScript
COPY tsconfig.json main.ts ./
RUN npx tsc

# ── Production stage ──
FROM public.ecr.aws/docker/library/node:22-slim

WORKDIR /app

# Install production dependencies only
COPY package.json ./
RUN npm install --omit=dev

# Patch Strands SDK: fix falsy check that drops empty string toolUse.input
# See: https://github.com/strands-agents/sdk-typescript/issues/373
RUN sed -i 's/if (!toolUse?.input)/if (toolUse?.input == null)/' \
    node_modules/@strands-agents/sdk/dist/src/models/bedrock.js

# Copy compiled JS from builder
COPY --from=builder /app/dist ./dist

# Non-root user (node image already has uid 1000 as 'node')
USER node

# AgentCore Runtime service contract ports
EXPOSE 8080 8000 9000

CMD ["node", "dist/main.js"]
