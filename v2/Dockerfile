FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/mcp-adapter/package.json packages/mcp-adapter/
COPY packages/cli/package.json packages/cli/
COPY demo-cards/qr-code/package.json demo-cards/qr-code/
COPY demo-cards/stock-quote/package.json demo-cards/stock-quote/
COPY demo-cards/weather/package.json demo-cards/weather/
COPY demo-cards/crypto-quote/package.json demo-cards/crypto-quote/
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "packages/cli/dist/cli.js", "start", "demo-cards"]
