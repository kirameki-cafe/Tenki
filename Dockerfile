FROM oven/bun:1.2.15
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install

COPY src ./src

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]