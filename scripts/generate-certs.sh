#!/bin/bash
# Generate self-signed TLS certificate for local development.
# Output: nginx/certs/server.crt and nginx/certs/server.key

set -e

CERT_DIR="$(dirname "$0")/../nginx/certs"
mkdir -p "$CERT_DIR"

if [ -f "$CERT_DIR/server.crt" ] && [ -f "$CERT_DIR/server.key" ]; then
  echo "Certificates already exist in $CERT_DIR. Skipping generation."
  echo "Delete them and re-run this script to regenerate."
  exit 0
fi

echo "Generating self-signed TLS certificate..."

openssl req -x509 -nodes -days 365 \
  -newkey rsa:2048 \
  -keyout "$CERT_DIR/server.key" \
  -out "$CERT_DIR/server.crt" \
  -subj "/C=US/ST=Dev/L=Dev/O=Timesheets/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

echo "Certificate generated:"
echo "  Certificate: $CERT_DIR/server.crt"
echo "  Private key: $CERT_DIR/server.key"
echo ""
echo "These are self-signed and suitable for local development only."
