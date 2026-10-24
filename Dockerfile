FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install --global pnpm@11.25.0

FROM base AS pruner
WORKDIR /app
COPY . .
RUN pnpm dlx turbo@2.11.3 prune @repo/web --docker

FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ ./
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ ./
ARG VITE_API_ORIGIN=http://localhost:3000
ENV VITE_API_ORIGIN=${VITE_API_ORIGIN}
RUN pnpm exec turbo run build --filter=@repo/web

FROM nginx:alpine AS runner
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
