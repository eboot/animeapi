#!/bin/bash
# Setup Cloudflare WARP (WireGuard) di Oracle — AMAN untuk server remote.
# Hanya traffic ke IP Cloudflare (tempat kuramanime berada) yang lewat WARP.
# SSH, nginx, dan traffic lain tetap lewat jalur normal — VPS tidak akan "hilang".
# Cara pakai: bash warp-setup-oracle.sh
# Matikan: sudo wg-quick down warp
set -e

echo "== 0. Bersihkan setup lama (kalau ada) =="
sudo wg-quick down warp 2>/dev/null || true
sudo systemctl disable wg-quick@warp 2>/dev/null || true

echo "== 1. Install wireguard =="
sudo apt update -qq && sudo apt install -y -qq wireguard python3 curl > /dev/null
echo OK

echo "== 2. Generate keypair & register ke Cloudflare =="
WG_PRIV=$(wg genkey)
WG_PUB=$(echo "$WG_PRIV" | wg pubkey)

REG_JSON=$(python3 - "$WG_PUB" << 'PYEOF'
import json, sys, uuid, datetime, urllib.request
pub = sys.argv[1]
payload = {
    "key": pub,
    "install_id": str(uuid.uuid4()),
    "fcm_token": "",
    "tos": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
    "model": "PC",
    "serial_number": uuid.uuid4().hex[:16],
    "locale": "en_US",
}
req = urllib.request.Request(
    "https://api.cloudflareclient.com/v0a2158/reg",
    data=json.dumps(payload).encode(),
    headers={"Content-Type": "application/json", "User-Agent": "okhttp/3.12.1"},
)
d = json.load(urllib.request.urlopen(req, timeout=20))
print(json.dumps({
    "v4": d["config"]["interface"]["addresses"]["v4"],
    "v6": d["config"]["interface"]["addresses"]["v6"],
}))
PYEOF
)
IPV4=$(echo "$REG_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['v4'])")
IPV6=$(echo "$REG_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['v6'])")
echo "dapat IP: $IPV4"

echo "== 3. Script route khusus Cloudflare =="
# Diambil dari daftar resmi https://www.cloudflare.com/ips-v4 (kuramanime di belakang Cloudflare)
sudo tee /etc/wireguard/cf-routes.sh > /dev/null <<'EOF'
#!/bin/bash
# Tambah route via warp HANYA untuk IP Cloudflare.
# PENTING: kecualikan dulu IP endpoint WireGuard sendiri (engage.cloudflareclient.com
# resolve ke IP Cloudflare). Tanpa ini, paket handshake ikut ke-route masuk tunnel
# -> routing loop -> tunnel tidak pernah connect (kuramanime tetap 403).
GATEWAY=$(ip route show default | awk '/^default/ {print $3; exit}')
if [ -n "$GATEWAY" ]; then
  for ip in $(getent ahosts engage.cloudflareclient.com | awk '$1 ~ /^[0-9.]+$/ {print $1}' | sort -u); do
    ip route replace "$ip/32" via "$GATEWAY" 2>/dev/null || true
  done
fi
RANGES=$(curl -s -m 15 https://www.cloudflare.com/ips-v4)
if [ -z "$RANGES" ]; then
  # fallback kalau fetch gagal
  RANGES="173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 104.24.0.0/14 172.64.0.0/13 131.0.72.0/22"
fi
for r in $RANGES; do
  ip route replace "$r" dev warp 2>/dev/null || true
done
EOF
sudo chmod +x /etc/wireguard/cf-routes.sh

echo "== 4. Tulis /etc/wireguard/warp.conf (Table=off = routing manual, aman) =="
CF_PUB="bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo="
sudo mkdir -p /etc/wireguard
sudo tee /etc/wireguard/warp.conf > /dev/null <<EOF
[Interface]
PrivateKey = $WG_PRIV
Address = $IPV4/32
Address = $IPV6/128
Table = off
PostUp = /etc/wireguard/cf-routes.sh

[Peer]
PublicKey = $CF_PUB
AllowedIPs = 0.0.0.0/0
Endpoint = engage.cloudflareclient.com:2408
PersistentKeepalive = 25
EOF
sudo chmod 600 /etc/wireguard/warp.conf

echo "== 5. Nyalakan WARP =="
sudo wg-quick up warp
sudo systemctl enable wg-quick@warp > /dev/null 2>&1 || true

echo "== 6. Tes =="
sleep 3
echo -n "IP publik (harus tetap IP Oracle): "; curl -s -m 15 ifconfig.me; echo
echo -n "IP ke Cloudflare (harus beda/IP WARP): "; curl -s -m 15 ifconfig.me --resolve ifconfig.me:443:104.16.0.1 2>/dev/null || echo "(skip)"
echo -n "kuramanime: "; curl -s -m 20 -o /dev/null -w "%{http_code}\n" -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36" "https://v20.kuramanime.ing/"
echo "SELESAI. Matikan kapan saja: sudo wg-quick down warp"
