#!/bin/bash
# Setup Cloudflare WARP (WireGuard) di Oracle — biar outbound IP jadi IP Cloudflare
# yang dipercaya, tembus blokir Cloudflare saat scraping.
# Cara pakai: bash warp-setup-oracle.sh
# Matikan: sudo wg-quick down warp
set -e

echo "== 1. Install wireguard =="
sudo apt update -qq && sudo apt install -y -qq wireguard python3 > /dev/null
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

echo "== 3. Tulis /etc/wireguard/warp.conf =="
# PublicKey milik Cloudflare (well-known, sama untuk semua)
CF_PUB="bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo="
sudo mkdir -p /etc/wireguard
sudo tee /etc/wireguard/warp.conf > /dev/null <<EOF
[Interface]
PrivateKey = $WG_PRIV
Address = $IPV4/32
Address = $IPV6/128
DNS = 1.1.1.1

[Peer]
PublicKey = $CF_PUB
AllowedIPs = 0.0.0.0/0
AllowedIPs = ::/0
Endpoint = engage.cloudflareclient.com:2408
PersistentKeepalive = 25
EOF
sudo chmod 600 /etc/wireguard/warp.conf

echo "== 4. Nyalakan WARP =="
sudo wg-quick up warp
sudo systemctl enable wg-quick@warp > /dev/null 2>&1 || true

echo "== 5. Tes =="
sleep 3
echo -n "IP publik sekarang: "; curl -s -m 15 ifconfig.me; echo
echo -n "kuramanime: "; curl -s -m 20 -o /dev/null -w "%{http_code}\n" -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36" "https://v20.kuramanime.ing/"
echo "SELESAI. Matikan kapan saja: sudo wg-quick down warp"
