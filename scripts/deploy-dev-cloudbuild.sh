#!/usr/bin/env bash
# Deploy MEW to GKE (dev environment) using Cloud Build
# Usage: ./scripts/deploy-dev-cloudbuild.sh
#
# Builds Docker image using Google Cloud Build (much faster than local)
# and deploys via Helm.

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

echo "=== Deploying $SERVICE using Cloud Build ==="
echo "Git SHA: $GIT_SHA"
echo "Image: $FULL_IMAGE"
echo "Chart: $CHART_PATH"
echo "Release: $RELEASE_NAME"
echo ""

# Build using Google Cloud Build (much faster, no local resources used)
echo ">>> Building $FULL_IMAGE using Cloud Build..."
gcloud builds submit \
    --config="$DEPLOY_DIR/cloudbuild.yaml" \
    --project="$GCP_PROJECT" \
    --substitutions=SHORT_SHA="$GIT_SHA" \
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
