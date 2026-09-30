#!/usr/bin/env bash
# Respaldo de la base de datos (integrantes, fechas, drops, servicios, bitácora…) a un .sql con fecha.
# Uso: bash respaldo.sh
set -euo pipefail
cd "$(dirname "$0")"
DB=$(grep -E '^database_name' wrangler.toml | sed 's/.*= *"\(.*\)"/\1/')
mkdir -p respaldos
ARCHIVO="respaldos/${DB}-$(date +%Y-%m-%d).sql"
npx wrangler@latest d1 export "$DB" --remote --output="$ARCHIVO"
echo "✅ Respaldo en $ARCHIVO"
ls -t respaldos/*.sql | tail -n +13 | xargs -r rm --
