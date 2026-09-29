#!/usr/bin/env bash
# Publica el sitio: commit + push a GitHub y deploy a Cloudflare Pages.
# Uso: bash deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

PROJECT=$(grep -E '^name' wrangler.toml | head -1 | sed 's/.*= *"\(.*\)"/\1/')
command -v gh  >/dev/null 2>&1 || { echo "❌ Falta gh (brew install gh)"; exit 1; }
command -v npx >/dev/null 2>&1 || { echo "❌ Falta node/npx (brew install node)"; exit 1; }

if [ ! -d .git ]; then
  git init -q -b main
fi
git add -A
git commit -q -m "deploy: $(date '+%Y-%m-%d %H:%M:%S')" || echo "ℹ️  Nada nuevo que commitear."

if git remote get-url origin >/dev/null 2>&1; then
  git push -q -u origin HEAD
else
  echo "→ Creando repo '$PROJECT' en GitHub y haciendo push…"
  gh repo create "$PROJECT" --public --source=. --remote=origin --push
fi

echo "→ Desplegando en Cloudflare Pages como '$PROJECT'…"
npx wrangler@latest pages deploy --project-name="$PROJECT" --branch=main --commit-dirty=true

echo ""
echo "✅ Listo. Producción: https://${PROJECT}.pages.dev"
