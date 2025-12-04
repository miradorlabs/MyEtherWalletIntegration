#!/bin/bash
# Setup local environment for GKE deployment
# Usage: ./scripts/setup-gke.sh

set -e

# Configuration
GCP_PROJECT="mirador-dev"
GKE_CLUSTER="dev-k8s-cluster"
GKE_REGION="us-central1"

echo "=== Setting up GKE access for $GKE_CLUSTER ==="

# Check prerequisites
echo ""
echo ">>> Checking prerequisites..."

MISSING_DEPS=()

if ! command -v gcloud &> /dev/null; then
    MISSING_DEPS+=("gcloud - Install from: https://cloud.google.com/sdk/docs/install")
else
    echo "✓ gcloud CLI found"
fi

if ! command -v kubectl &> /dev/null; then
    MISSING_DEPS+=("kubectl - Install from: https://kubernetes.io/docs/tasks/tools/")
else
    echo "✓ kubectl found"
fi

if ! command -v helm &> /dev/null; then
    MISSING_DEPS+=("helm - Install from: https://helm.sh/docs/intro/install/")
else
    echo "✓ helm found"
fi

if ! command -v docker &> /dev/null; then
    MISSING_DEPS+=("docker - Install from: https://docs.docker.com/get-docker/")
else
    echo "✓ docker found"
fi

# Exit if missing dependencies
if [[ ${#MISSING_DEPS[@]} -gt 0 ]]; then
    echo ""
    echo "ERROR: Missing required dependencies:"
    for dep in "${MISSING_DEPS[@]}"; do
        echo "  - $dep"
    done
    exit 1
fi

# Install GKE auth plugin
echo ""
echo ">>> Installing gke-gcloud-auth-plugin..."
gcloud components install gke-gcloud-auth-plugin --quiet || {
    echo "Note: If using Homebrew, run: brew install google-cloud-sdk"
    echo "Then: gcloud components install gke-gcloud-auth-plugin"
}

# Authenticate with GCP
echo ""
echo ">>> Authenticating with GCP..."
gcloud auth login

# Configure Docker for GCR/Artifact Registry
echo ""
echo ">>> Configuring Docker for GCR authentication..."
gcloud auth configure-docker gcr.io --quiet

# Get cluster credentials
echo ""
echo ">>> Configuring kubectl for GKE cluster..."
gcloud container clusters get-credentials "$GKE_CLUSTER" \
    --region "$GKE_REGION" \
    --project "$GCP_PROJECT"

# Verify connection
echo ""
echo ">>> Verifying connection..."
kubectl cluster-info
echo ""
kubectl get nodes

echo ""
echo "=== GKE setup complete ==="
echo "You can now run: ./scripts/deploy-dev.sh"
