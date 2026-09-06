#!/usr/bin/env bash
# Concatenates src/ into a single self-contained index.html, then copies it
# into dist/ for upload to Cloudflare Pages.
set -euo pipefail
cd "$(dirname "$0")"

OUT=index.html
{
  cat src/head.html
  echo '<script>'
  for f in src/js/*.js; do
    echo "/* ===== $(basename "$f") ===== */"
    cat "$f"
    echo
  done
  echo '</script>'
} > "$OUT"

mkdir -p dist
cp "$OUT" dist/index.html
cat > dist/_headers <<'HEADERS'
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
/index.html
  Cache-Control: public, max-age=0, must-revalidate
HEADERS

printf 'build ok -> %s (%s byte)\n' "$OUT" "$(wc -c < "$OUT" | tr -d ' ')"
