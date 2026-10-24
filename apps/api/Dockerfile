FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install --global pnpm@11.25.0

FROM base AS pruner
WORKDIR /app
COPY . .
RUN pnpm dlx turbo@2.11.3 prune @repo/api --docker

FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ ./
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ ./

FROM node:24-alpine AS runner
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY --from=builder /app ./
EXPOSE 3000
CMD ["pnpm", "--filter", "@repo/api", "dev"]
