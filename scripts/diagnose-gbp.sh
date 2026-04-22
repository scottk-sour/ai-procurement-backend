#!/usr/bin/env bash
# Diagnostic: hit Places Text Search v1 three ways to see which query
# returns TendorAI's GBP. No node, no npm, curl only. Never logs the key.
#
# Usage:  bash scripts/diagnose-gbp.sh
# Needs:  GOOGLE_PLACES_API_KEY in env (already set on Render).

set -u

if [[ -z "${GOOGLE_PLACES_API_KEY:-}" ]]; then
  echo "FATAL: GOOGLE_PLACES_API_KEY is not set in env." >&2
  exit 1
fi

FIELDS='places.displayName,places.formattedAddress,places.shortFormattedAddress,places.primaryType,places.types,places.rating,places.userRatingCount'

HAS_JQ=0
if command -v jq >/dev/null 2>&1; then HAS_JQ=1; fi

run_query() {
  local label="$1"
  local query="$2"
  echo
  echo '============================================================'
  echo "QUERY $label"
  echo "textQuery: $query"
  echo '============================================================'
  local body
  body=$(curl -sS -X POST 'https://places.googleapis.com/v1/places:searchText' \
    -H 'Content-Type: application/json' \
    -H "X-Goog-Api-Key: $GOOGLE_PLACES_API_KEY" \
    -H "X-Goog-FieldMask: $FIELDS" \
    -d "{\"textQuery\":\"$query\"}")
  if [[ $HAS_JQ -eq 1 ]]; then
    echo "$body" | jq '{count:((.places // []) | length), places:[(.places // [])[] | {name:.displayName.text, formattedAddress, shortFormattedAddress, primaryType, types, rating, userRatingCount}]}'
  else
    echo "$body"
  fi
}

run_query 'A (clean)'     'TendorAI Cwmbran'
run_query 'B (with LTD)'  'TendorAI LTD Cwmbran'
run_query 'C (name only)' 'TendorAI'

echo
echo 'Done.'
