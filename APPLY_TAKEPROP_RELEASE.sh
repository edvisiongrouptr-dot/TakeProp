#!/usr/bin/env bash
set -euo pipefail

patches=(
  01-takeprop-brand-identity.patch
  02-advanced-orders-and-protection.patch
  03-challenge-lifecycle-and-progression.patch
  04-admin-operations-and-audit.patch
  05-notifications-support-and-email.patch
  06-security-automation-and-release-verification.patch
  07-automatic-payment-verification.patch
  08-kyc-provider-integration.patch
  09-support-operations-and-runbooks.patch
  10-nextjs-16-security-upgrade.patch
  11-worker-health-monitoring.patch
  12-legal-consent-and-payout-validation.patch
  13-production-launch-gates.patch
  14-production-domain-and-seo.patch
  15-compliance-and-payout-operations.patch
)

test -d .git || { echo 'Run this from the TakeProp repository root.' >&2; exit 1; }
test "$(git branch --show-current)" = main || { echo 'Switch to the main branch first.' >&2; exit 1; }
test -z "$(git status --porcelain)" || { echo 'Working tree must be clean. Commit or stash existing work first.' >&2; exit 1; }
for patch in "${patches[@]}"; do test -f "$patch" || { echo "Missing $patch" >&2; exit 1; }; done
test -f RELEASE_SHA256SUMS || { echo 'Missing RELEASE_SHA256SUMS' >&2; exit 1; }
sha256sum --check RELEASE_SHA256SUMS

backup="backup/pre-takeprop-release-$(date -u +%Y%m%dT%H%M%SZ)"
git branch "$backup"
git pull --rebase origin main
for patch in "${patches[@]}"; do git am "$patch"; done

pnpm install --no-frozen-lockfile
git add pnpm-lock.yaml
if ! git diff --cached --quiet; then git commit -m 'Regenerate lockfile for production release'; fi
pnpm verify:release
pnpm --filter web build
git push origin main

echo "Code release pushed. Recovery branch: $backup"
echo 'Next: configure environment variables, then run DEPLOY_TAKEPROP_SUPABASE.sh.'
