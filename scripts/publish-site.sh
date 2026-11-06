#!/usr/bin/env bash
# Upload web/ to the site bucket and invalidate CloudFront. The bucket and the
# distribution come from the GateCheck stack's outputs.
set -euo pipefail
cd "$(dirname "$0")/.."
export AWS_REGION="${AWS_REGION:-us-east-1}"
[[ -f web/index.html ]] || { echo "no web/index.html" >&2; exit 1; }

output() {
  aws cloudformation describe-stacks --stack-name GateCheck \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
bucket="$(output SiteBucketName)"
distribution="$(output DistributionId)"
url="$(output SiteUrl)"

# Lean's compiled files have hashed names, so they keep for a year and go up first.
# Everything else keeps its name, so it is revalidated on every load. Files that
# are gone are removed last.
aws s3 sync web "s3://$bucket" --exclude '*' --include 'lean/app.*.js' \
  --content-type text/javascript --cache-control 'public, max-age=31536000, immutable' --only-show-errors
aws s3 sync web "s3://$bucket" --exclude '*' --include 'lean/*.wasm' \
  --content-type application/wasm --cache-control 'public, max-age=31536000, immutable' --only-show-errors
aws s3 sync web "s3://$bucket" --exclude 'lean/app.*.js' --exclude 'lean/*.wasm' --exclude '.DS_Store' \
  --cache-control 'no-cache' --only-show-errors
aws s3 sync web "s3://$bucket" --delete --exclude '.DS_Store' --only-show-errors
aws cloudfront create-invalidation --distribution-id "$distribution" --paths '/*' >/dev/null
echo "published $url"
