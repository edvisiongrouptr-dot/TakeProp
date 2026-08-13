# TakeProp

This repository is an MVP scaffold for TakeProp — a crypto proprietary simulated trading evaluation platform.

This initial branch (mvp/init-scaffold) contains a minimal monorepo layout and seed for local development.

Quick start (development):

1. Install pnpm (https://pnpm.io/installation) and Node 20+
2. Copy .env.example to .env and adjust values
3. Start postgres and redis (docker-compose.yml) or run locally
   docker compose up -d
4. Install dependencies:
   pnpm install
5. Run dev servers (apps will provide their own dev scripts):
   pnpm -w run dev

See /docs for architecture notes and next steps.
