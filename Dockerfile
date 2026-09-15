# ─── Production Dockerfile for CTF Nexus Challenge ───
FROM node:20-alpine AS runner

# Working directory inside the container
WORKDIR /app

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Copy dependency manifests from server/
COPY server/package*.json ./

# Install only production dependencies cleanly
RUN npm ci --omit=dev

# Copy all server code into the container
COPY server/ ./

# Conditionally copy optional root challenge files if present in the build context
COPY Knowledge.pd[f] ./Knowledge.pdf
COPY flag.tx[t] ./flag.txt

# Expose container port (overridden dynamically by Render at runtime)
EXPOSE 3000

# Built-in container health check using alpine's wget
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/healthz || exit 1

# Launch the application
CMD ["node", "server.js"]
