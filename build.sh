#!/usr/bin/env bash
# Menggabungkan src/ menjadi satu berkas index.html yang berdiri sendiri,
# lalu menyalinnya ke dist/ untuk diunggah ke Cloudflare Pages.
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
