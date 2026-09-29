#!/usr/bin/env bash
# Prueba local (sin tocar Cloudflare): http://localhost:8788
set -euo pipefail
cd "$(dirname "$0")"
[ -f .dev.vars ] || cp .dev.vars.example .dev.vars
npx wrangler@latest pages dev --local
