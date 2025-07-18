# Use official Node image with Chromium deps
FROM node:18-slim

# Install Chromium dependencies
RUN apt-get update && \
    apt-get install -y wget ca-certificates fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 xdg-utils --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Set work dir
WORKDIR /app

# Copy files
COPY package*.json ./
COPY index.js ./

# Install deps
RUN npm install

# Default cmd
CMD ["node", "index.js"]
