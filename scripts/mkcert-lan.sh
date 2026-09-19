#!/bin/sh
# Cấp lại chứng chỉ HTTPS cho IP Wi‑Fi hiện tại (camera iPhone).
# Dùng CA mkcert sẵn trong certs/ — điện thoại đã tin CA thì không phải cài lại.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CA="$ROOT/certs/rootCA.pem"
KEY="$ROOT/certs/rootCA-key.pem"
OUT_CERT="$ROOT/frontend/certs/dev-cert.pem"
OUT_KEY="$ROOT/frontend/certs/dev-key.pem"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

IPS="127.0.0.1 192.168.1.99 192.168.1.97 192.168.8.203"
if command -v ipconfig >/dev/null 2>&1; then
  CUR="$(ipconfig getifaddr en0 2>/dev/null || true)"
  [ -n "$CUR" ] && IPS="$IPS $CUR"
fi

{
  echo "authorityKeyIdentifier=keyid,issuer"
  echo "basicConstraints=CA:FALSE"
  echo "keyUsage=digitalSignature,keyEncipherment"
  echo "extendedKeyUsage=serverAuth"
  echo "subjectAltName=@alt_names"
  echo ""
  echo "[alt_names]"
  echo "DNS.1=localhost"
  echo "DNS.2=MacBook-Pro-cua-Phuc.local"
  n=1
  for ip in $IPS; do
    echo "IP.$n=$ip"
    n=$((n + 1))
  done
  echo "IP.$n=0:0:0:0:0:0:0:1"
} > "$TMP/ext.cnf"

openssl req -new -newkey rsa:2048 -nodes \
  -keyout "$OUT_KEY" \
  -out "$TMP/req.csr" \
  -subj "/O=mkcert development certificate/OU=taphoa/CN=taphoa-lan"

openssl x509 -req -in "$TMP/req.csr" \
  -CA "$CA" -CAkey "$KEY" -CAcreateserial \
  -out "$OUT_CERT" -days 825 -sha256 \
  -extfile "$TMP/ext.cnf"

cp "$OUT_CERT" "$ROOT/certs/dev-cert.pem"
cp "$OUT_KEY" "$ROOT/certs/dev-key.pem"
echo "Đã cấp cert cho: $IPS"
echo "Restart frontend: docker compose restart frontend"
