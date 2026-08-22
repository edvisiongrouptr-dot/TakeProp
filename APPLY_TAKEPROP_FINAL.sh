#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ! -f package.json || ! -d apps/web || ! -d supabase ]]; then
  echo "Run this file from the TakeProp repository root." >&2
  exit 1
fi

command -v pnpm >/dev/null || { echo "pnpm is required." >&2; exit 1; }

echo "[1/5] Synchronizing the dependency lockfile"
pnpm install --no-frozen-lockfile

echo "[2/5] Running every internal release verifier"
pnpm verify:all

echo "[3/5] Running the production Next.js build"
pnpm --filter web build

echo "[4/5] Checking the final diff"
git diff --check
git add -A

if git diff --cached --quiet; then
  echo "No source changes need committing."
else
  git commit -m "Complete TakeProp production hardening"
fi

echo "[5/5] Publishing main"
git push origin main

echo "TakeProp source release completed. Wait for Vercel to report Ready, then follow docs/FINAL_DEPLOYMENT.md."
