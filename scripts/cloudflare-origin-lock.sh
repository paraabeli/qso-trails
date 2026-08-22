#!/usr/bin/env bash
set -euo pipefail

CF4_URL="https://www.cloudflare.com/ips-v4"
CF6_URL="https://www.cloudflare.com/ips-v6"
CHAIN="QSO-TRAILS-CLOUDFLARE"

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

for command in curl iptables ip; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Missing required command: $command" >&2
    exit 1
  }
done

if ! iptables -S DOCKER-USER >/dev/null 2>&1; then
  echo "DOCKER-USER chain is unavailable. Start Docker before applying the origin lock." >&2
  exit 1
fi

EXT_IF="${EXT_IF:-$(ip route show default 2>/dev/null | awk '/default/ {print $5; exit}')}"
if [[ -z "$EXT_IF" ]]; then
  echo "Could not determine the public/default network interface. Set EXT_IF explicitly, for example EXT_IF=eth0." >&2
  exit 1
fi

if ! ip link show "$EXT_IF" >/dev/null 2>&1; then
  echo "Configured external interface does not exist: $EXT_IF" >&2
  exit 1
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "$CF4_URL" -o "$tmpdir/ips-v4"
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "$CF6_URL" -o "$tmpdir/ips-v6"

if grep -Ev '^[0-9.]+/[0-9]+$' "$tmpdir/ips-v4" | grep -q .; then
  echo "Cloudflare IPv4 feed contains an unexpected value; refusing to change firewall rules." >&2
  exit 1
fi

if grep -Ev '^[0-9A-Fa-f:]+/[0-9]+$' "$tmpdir/ips-v6" | grep -q .; then
  echo "Cloudflare IPv6 feed contains an unexpected value; refusing to change firewall rules." >&2
  exit 1
fi

if [[ $(grep -c . "$tmpdir/ips-v4") -lt 5 || $(grep -c . "$tmpdir/ips-v6") -lt 1 ]]; then
  echo "Cloudflare IP feed looks incomplete; refusing to change firewall rules." >&2
  exit 1
fi

apply_ipv4() {
  iptables -N "$CHAIN" 2>/dev/null || true
  iptables -F "$CHAIN"

  while IFS= read -r subnet; do
    [[ -n "$subnet" ]] || continue
    iptables -A "$CHAIN" -i "$EXT_IF" -s "$subnet" -p tcp -m multiport --dports 80,443 -j ACCEPT
    iptables -A "$CHAIN" -i "$EXT_IF" -s "$subnet" -p udp --dport 443 -j ACCEPT
  done < "$tmpdir/ips-v4"

  iptables -A "$CHAIN" -i "$EXT_IF" -p tcp -m multiport --dports 80,443 -j DROP
  iptables -A "$CHAIN" -i "$EXT_IF" -p udp --dport 443 -j DROP
  iptables -A "$CHAIN" -j RETURN

  iptables -C DOCKER-USER -j "$CHAIN" 2>/dev/null || iptables -I DOCKER-USER 1 -j "$CHAIN"
}

apply_ipv6() {
  command -v ip6tables >/dev/null 2>&1 || {
    echo "IPv6 firewall tooling is unavailable; skipping IPv6 rules."
    return
  }

  if ! ip6tables -S DOCKER-USER >/dev/null 2>&1; then
    echo "Docker IPv6 DOCKER-USER chain is unavailable; skipping IPv6 rules."
    return
  fi

  ip6tables -N "$CHAIN" 2>/dev/null || true
  ip6tables -F "$CHAIN"

  while IFS= read -r subnet; do
    [[ -n "$subnet" ]] || continue
    ip6tables -A "$CHAIN" -i "$EXT_IF" -s "$subnet" -p tcp -m multiport --dports 80,443 -j ACCEPT
    ip6tables -A "$CHAIN" -i "$EXT_IF" -s "$subnet" -p udp --dport 443 -j ACCEPT
  done < "$tmpdir/ips-v6"

  ip6tables -A "$CHAIN" -i "$EXT_IF" -p tcp -m multiport --dports 80,443 -j DROP
  ip6tables -A "$CHAIN" -i "$EXT_IF" -p udp --dport 443 -j DROP
  ip6tables -A "$CHAIN" -j RETURN

  ip6tables -C DOCKER-USER -j "$CHAIN" 2>/dev/null || ip6tables -I DOCKER-USER 1 -j "$CHAIN"
}

apply_ipv4
apply_ipv6

echo "QSO Trails Cloudflare origin firewall updated on $EXT_IF. Public 80/443 are Cloudflare-only; Docker egress is unaffected."
