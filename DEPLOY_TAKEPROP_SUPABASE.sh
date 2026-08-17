#!/usr/bin/env bash
set -euo pipefail

test -d supabase || { echo 'Run this from the TakeProp repository root.' >&2; exit 1; }
command -v supabase >/dev/null || { echo 'Install the Supabase CLI first.' >&2; exit 1; }
: "${SUPABASE_PROJECT_REF:?Set SUPABASE_PROJECT_REF to the production project reference}"

supabase link --project-ref "$SUPABASE_PROJECT_REF"
supabase db push --include-all
for function_name in sim-trading process-active-orders verify-usdt-payments send-email-outbox kyc; do
  supabase functions deploy "$function_name" --project-ref "$SUPABASE_PROJECT_REF"
done

echo 'Supabase schema and all production Edge Functions were deployed.'
echo 'Run the production smoke test only after Vercel reports Ready.'
