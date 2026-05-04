# Build zsign from source
FROM debian:bookworm-slim AS zsign-builder
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      git \
      build-essential \
      cmake \
      zlib1g-dev \
      libssl-dev \
      libminizip-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /tmp
RUN git clone --depth=1 https://github.com/zhlynn/zsign.git \
    && cd zsign \
    && cmake . \
    && make

FROM node:20-bookworm-slim

# Runtime dependencies for signing tools and process execution
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      python3 \
      python3-pip \
      libssl3 \
      zlib1g \
      libminizip1 \
    && rm -rf /var/lib/apt/lists/*

# Install cyan CLI from pyzule-rw (not published to PyPI, install from GitHub)
RUN pip3 install --no-cache-dir --break-system-packages https://github.com/asdfzxcvbn/pyzule-rw/archive/refs/tags/v1.4.4.zip

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Add zsign binary built from source
COPY --from=zsign-builder /tmp/zsign/bin/zsign /usr/local/bin/zsign
RUN chmod +x /usr/local/bin/zsign

# Ensure writable working folders exist at build/runtime
RUN mkdir -p /app/uploads/p12 /app/uploads/mp /app/uploads/temp /app/uploads/signed /app/uploads/plist /app/logs

ENV NODE_ENV=production \
  PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
