# syntax=docker/dockerfile:1.4

# Build stage
FROM node:14-bullseye AS builder

# Install system dependencies
RUN apt update && apt install -y \
    build-essential \
    zip \
    nasm \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables for build
ENV NODE_OPTIONS=--max-old-space-size=8192

# Set working directory
WORKDIR /app

# Upgrade npm
RUN npm install -g npm@^8.8

# Copy package files and scripts needed for preinstall
COPY package*.json ./
COPY .npmrc ./
COPY scripts/ ./scripts/

# Install dependencies using BuildKit secret for NPM_TOKEN
RUN --mount=type=secret,id=npm_token \
    NPM_TOKEN=$(cat /run/secrets/npm_token) npm install --legacy-peer-deps

# Copy application code
COPY . .

# Build the application (skip update steps to avoid external fetches)
RUN WEBPACK_INTEGRITY=false ROUTER_MODE=hash npx vue-cli-service build

# Production stage
FROM nginx:alpine

# Copy built files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose HTTP port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/index.html || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
