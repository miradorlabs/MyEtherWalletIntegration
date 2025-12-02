FROM node:14-alpine

# Install system dependencies (Alpine uses apk instead of apt)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    zip \
    nasm \
    bash \
    git \
    linux-headers \
    eudev-dev \
    libusb-dev \
    autoconf \
    automake \
    libtool \
    pkgconfig

# Set environment variables
ENV HOME=/home
ENV NODE_OPTIONS=--max-old-space-size=8192

# Upgrade npm
RUN npm install -g npm@^8.8

# Set working directory
WORKDIR /home

# Copy package files and scripts for preinstall
COPY package*.json ./
COPY .npmrc ./
COPY scripts ./scripts

# Install dependencies (requires NPM_TOKEN env var)
ARG NPM_TOKEN
RUN npm install --legacy-peer-deps

# Copy application code
COPY . .

# Expose development server port
EXPOSE 8080

# Start development server
CMD ["npm", "run", "dev"]
