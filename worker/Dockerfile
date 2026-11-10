FROM mcr.microsoft.com/playwright:v1.61.1-noble
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund
COPY tsconfig.json ./
COPY src/lib ./src/lib
COPY worker ./worker
USER pwuser
CMD ["./node_modules/.bin/tsx", "worker/run.ts"]
