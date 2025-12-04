# syntax=docker/dockerfile:1.4

# Development image - runs dev server instead of building
FROM node:14-bullseye

# Install system dependencies
RUN apt update && apt install -y \
    build-essential \
    zip \
    nasm \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables
ENV NODE_OPTIONS=--max-old-space-size=4096

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

# Expose dev server port
EXPOSE 8080

# Start dev server
CMD ["npm", "run", "juststart"]
