#!/usr/bin/env bash
# Prepara todo UNA sola vez: base de datos D1, bucket R2, tablas, proyecto Pages,
# secretos y primer deploy. Después de esto, cada actualización es: bash deploy.sh
# Uso: bash setup.sh
set -euo pipefail
cd "$(dirname "$0")"

PROJECT=$(grep -E '^name' wrangler.toml | head -1 | sed 's/.*= *"\(.*\)"/\1/')
DB=$(grep -E '^database_name' wrangler.toml | sed 's/.*= *"\(.*\)"/\1/')
BUCKET=$(grep -E '^bucket_name' wrangler.toml | sed 's/.*= *"\(.*\)"/\1/')

command -v gh  >/dev/null 2>&1 || { echo "❌ Falta gh (brew install gh)"; exit 1; }
command -v npx >/dev/null 2>&1 || { echo "❌ Falta node/npx (brew install node)"; exit 1; }

echo "→ 1/6 Base de datos D1 '$DB'"
if ! npx wrangler@latest d1 list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.exit(JSON.parse(s).some(d=>d.name===process.argv[1])?0:1))' "$DB"; then
  npx wrangler@latest d1 create "$DB" >/dev/null
fi
DB_ID=$(npx wrangler@latest d1 list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s).find(d=>d.name===process.argv[1]);console.log(d?d.uuid:"")})' "$DB")
[ -n "$DB_ID" ] || { echo "❌ No pude obtener el id de la base de datos"; exit 1; }
node -e 'const fs=require("fs");let t=fs.readFileSync("wrangler.toml","utf8");t=t.replace(/database_id = ".*"/,`database_id = "${process.argv[1]}"`);fs.writeFileSync("wrangler.toml",t)' "$DB_ID"
echo "   id: $DB_ID"

echo "→ 2/6 Tablas"
npx wrangler@latest d1 execute "$DB" --remote --file=schema.sql -y >/dev/null

echo "→ 3/6 Bucket R2 '$BUCKET' (fotos y música)"
if npx wrangler@latest r2 bucket list 2>/dev/null | grep -q "name: *$BUCKET\b"; then
  echo "   (ya existía, bien)"
else
  npx wrangler@latest r2 bucket create "$BUCKET" || {
    echo "❌ No pude crear el bucket R2."
    echo "   Si R2 no está activado en tu cuenta, actívalo UNA vez en dash.cloudflare.com → R2"
    echo "   (pide un método de pago, pero hasta 10 GB es gratis) y vuelve a correr: bash setup.sh"
    exit 1
  }
fi

echo "→ 4/6 Proyecto Pages '$PROJECT'"
npx wrangler@latest pages project create "$PROJECT" --production-branch=main >/dev/null 2>&1 || echo "   (ya existía, bien)"

echo "→ 5/6 Secretos"
SESSION_SECRET=$(openssl rand -hex 32)
SETUP_KEY=$(openssl rand -hex 6)
printf '%s' "$SESSION_SECRET" | npx wrangler@latest pages secret put SESSION_SECRET --project-name="$PROJECT" >/dev/null
printf '%s' "$SETUP_KEY" | npx wrangler@latest pages secret put SETUP_KEY --project-name="$PROJECT" >/dev/null
if [ ! -f .dev.vars ]; then
  printf 'SESSION_SECRET=%s\nSETUP_KEY=%s\n' "$SESSION_SECRET" "$SETUP_KEY" > .dev.vars
fi

echo "→ 6/6 GitHub + primer deploy"
bash deploy.sh

echo ""
echo "══════════════════════════════════════════════════"
echo " Clave de instalación (SETUP_KEY): $SETUP_KEY"
echo " Entra a https://${PROJECT}.pages.dev/panel y crea tu cuenta de admin con esa clave."
echo "══════════════════════════════════════════════════"
