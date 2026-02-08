FROM node:20-slim

# Install Chromium for card screenshot rendering + emoji/sans-serif fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-noto-color-emoji \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/screenshot/package.json packages/screenshot/
COPY packages/mcp-adapter/package.json packages/mcp-adapter/
COPY packages/cli/package.json packages/cli/
COPY demo-cards/qr-code/package.json demo-cards/qr-code/
COPY demo-cards/stock-quote/package.json demo-cards/stock-quote/
COPY demo-cards/weather/package.json demo-cards/weather/
COPY demo-cards/crypto-quote/package.json demo-cards/crypto-quote/
COPY demo-cards/city-explorer/package.json demo-cards/city-explorer/
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "packages/cli/dist/cli.js", "start", "demo-cards"]
