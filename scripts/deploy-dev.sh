#!/usr/bin/env bash
# Deploy MEW to GKE (dev environment)
# Usage: ./scripts/deploy-dev.sh
#
# Builds Docker image with git SHA tag and deploys via Helm.
# Fetches NPM_TOKEN from GCP Secret Manager for build-time dependencies.

set -e

NAMESPACE="frontend"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
DEPLOY_DIR="$REPO_ROOT/deploy"
GCR_PROJECT="gcr.io/mirador-dev"
GCP_PROJECT="mirador-dev"
GIT_SHA=$(git -C "$REPO_ROOT" rev-parse --short HEAD)

# Service configuration
SERVICE="mew"
IMAGE_NAME="mew"
CHART_PATH="$DEPLOY_DIR/apps/mew/chart"
RELEASE_NAME="mew-app-dev"
FULL_IMAGE="$GCR_PROJECT/$IMAGE_NAME:$GIT_SHA"

echo "=== Deploying $SERVICE ==="
echo "Git SHA: $GIT_SHA"
echo "Image: $FULL_IMAGE"
echo "Chart: $CHART_PATH"
echo "Release: $RELEASE_NAME"
echo ""

# Fetch NPM_TOKEN from GCP Secret Manager and write to temp file for BuildKit secret
echo ">>> Fetching NPM_TOKEN from Secret Manager..."
NPM_TOKEN_FILE=$(mktemp)
trap "rm -f $NPM_TOKEN_FILE" EXIT

gcloud secrets versions access latest --secret="npm-token" --project="$GCP_PROJECT" > "$NPM_TOKEN_FILE"
if [[ ! -s "$NPM_TOKEN_FILE" ]]; then
    echo "ERROR: Failed to fetch NPM_TOKEN from Secret Manager"
    echo "Ensure the secret 'npm-token' exists in project '$GCP_PROJECT'"
    exit 1
fi
echo ">>> NPM_TOKEN retrieved successfully"
echo ""

# Build and push Docker image using BuildKit secrets
echo ">>> Building and pushing $FULL_IMAGE..."
DOCKER_BUILDKIT=1 docker buildx build --platform linux/amd64 \
    --secret id=npm_token,src="$NPM_TOKEN_FILE" \
    -f "$DEPLOY_DIR/docker/Dockerfile" \
    -t "$FULL_IMAGE" \
    --push \
    "$REPO_ROOT"

echo ""
echo ">>> Deploying with Helm..."

# Build helm command with values files
helm upgrade --install "$RELEASE_NAME" "$CHART_PATH" \
    --namespace "$NAMESPACE" \
    --create-namespace \
    --set image.tag="$GIT_SHA" \
    --history-max 3 \
    -f "$CHART_PATH/values/dev/default.yaml"

# Wait for deployment
echo ""
echo ">>> Waiting for $SERVICE to be ready..."
kubectl rollout status "deployment/$RELEASE_NAME" --namespace "$NAMESPACE" --timeout=600s

# Show Gateway external IP
echo ""
echo ">>> Gateway status:"
kubectl get gateway "$RELEASE_NAME-gateway" --namespace "$NAMESPACE" -o wide 2>/dev/null || echo "Gateway not yet ready"

echo ""
echo "=== $SERVICE deployed successfully (git: $GIT_SHA) ==="
echo ""
echo "MEW will be available at: https://mew.dev.mirador.org"
echo "(Note: DNS and SSL certificate provisioning may take a few minutes)"
