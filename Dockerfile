# Stage 1: Build zsign from source
FROM debian:bookworm-slim AS zsign-builder

# Install build dependencies
# We add 'make' and 'build-essential' to fix the "command not found" error
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      git \
      make \
      build-essential \
      pkg-config \
      libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /tmp

# Clone and compile zsign
# 'make clean' ensures a fresh build, 'make' compiles the binary
RUN git clone https://github.com/zhlynn/zsign.git \
    && cd zsign/build/linux \
    && make clean && make \
    && ls -lah /tmp/zsign/bin \
    && test -x /tmp/zsign/bin/zsign

# Stage 2: Final Runtime Image
FROM node:20-bookworm-slim

# Runtime dependencies
# These are necessary for the compiled zsign binary and python scripts to run
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      python3 \
      python3-pip \
      binutils \
      tar \
      zip \
      unzip \
      libssl3 \
      zlib1g \
      libminizip1 \
    && rm -rf /var/lib/apt/lists/*

# Install cyan CLI for IPA processing
RUN pip3 install --no-cache-dir --break-system-packages https://github.com/asdfzxcvbn/pyzule-rw/archive/refs/tags/v1.4.4.zip
RUN cyan --help > /dev/null

WORKDIR /app

# Install Node.js dependencies separately to leverage Docker caching
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the rest of your application code
COPY . .

# Copy the zsign binary from the builder stage
# This is the "Multi-Stage" magic that keeps your final image slim
COPY --from=zsign-builder /tmp/zsign/bin/zsign /usr/local/bin/zsign
RUN chmod +x /usr/local/bin/zsign
RUN zsign -v

# Ensure required directories exist for the app logic
RUN mkdir -p /app/uploads/p12 /app/uploads/mp /app/uploads/temp /app/uploads/signed /app/uploads/plist /app/logs

# Set production environment variables
ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
