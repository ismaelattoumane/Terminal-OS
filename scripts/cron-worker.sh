#!/bin/sh
# Appelle le worker d'automatisation de Terminal OS (cron cloud).
#
# Le worker traite les jobs « pending/failed » de tous les utilisateurs
# (synchronisation Google dans le sens serveur, structuration de cours, maîtrise,
# rappels…). C'est ce cron qui garantit que le système fonctionne même quand aucun
# navigateur n'est ouvert — y compris quand le PC de l'utilisateur est éteint.
#
# Usage (toutes les 5-15 minutes) :
#   CRON_SECRET=... APP_URL=https://mon-app.example.com ./scripts/cron-worker.sh
# ou directement :
#   curl -fsS -X POST "$APP_URL/api/automation/worker" \
#     -H "Authorization: Bearer $CRON_SECRET"

set -eu

: "${CRON_SECRET:?CRON_SECRET non défini (Doit être identique à l'environnement de l'application)}"
: "${APP_URL:?APP_URL non défini (ex: https://mon-app.example.com)}"

curl -fsS -X POST "$APP_URL/api/automation/worker" \
  -H "Authorization: Bearer $CRON_SECRET" || exit 1

echo "Worker appelé avec succès à $(date -u +%Y-%m-%dT%H:%M:%SZ)"