# VidSub

VidSub is a monorepo for the video transcription workflow app. It includes an Express API and a Vite React frontend.

## Stack

- API: Express + TypeScript
- Web: React + Vite + TypeScript
- Workspace tooling: pnpm + Turbo

## Prerequisites

- Node.js 24+
- pnpm
- Docker (optional, for running the full stack locally)

## Install

```sh
corepack enable
pnpm install
```

## Run locally

### With Docker

```sh
docker compose up --build -d
```

Then open:

- Frontend: http://localhost:5173
- API health: http://localhost:3000/health

### With pnpm

```sh
pnpm dev
```

## Configuration

- The API reads optional credentials from `apps/api/.env` at runtime.
- Keep secrets out of Docker images and do not commit `.env` files.
- The frontend defaults to `http://localhost:3000` as the API origin. Override it with `VITE_API_ORIGIN` if needed.

## Useful commands

```sh
pnpm build
pnpm lint
pnpm dev
```
