#!/usr/bin/env bash
# Deploy the GateCheck stack (infra/) and publish web/ to gatecheck.dengler.io.
# Needs AWS credentials for the account that holds the dengler.io zone.
#
#   scripts/deploy.sh                       # cdk deploy, then publish
#   scripts/deploy.sh --site-only           # publish only
#   scripts/deploy.sh --require-approval never
set -euo pipefail
cd "$(dirname "$0")/.."
export AWS_REGION="${AWS_REGION:-us-east-1}"
if [[ "${1:-}" == "--site-only" ]]; then
  shift
else
  (cd infra && npx --yes aws-cdk@2 deploy GateCheck "$@")
fi
scripts/publish-site.sh
