FROM oven/bun:1.2.15 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install

COPY src ./src
RUN bun build src/index.ts --outdir ./dist --target bun

FROM oven/bun:1.2.15-slim
WORKDIR /app

COPY --from=build /app/dist/index.js ./
COPY --from=build /app/package.json ./

EXPOSE 3000

CMD ["bun", "run", "index.js"]