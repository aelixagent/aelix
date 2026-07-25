#!/usr/bin/env python3
"""Local RPC proxy for Robinhood Chain, for networks whose DNS resolver hijacks
*.robinhood.com (e.g. the Indonesian TrustPositif filter, which points the host at
103.123.248.32 and refuses the connection).

Only DNS is tampered with — the real Cloudflare IPs serve the RPC fine. So we resolve the
hostname ourselves over DNS-over-HTTPS and pin the result, while still presenting the true
hostname for SNI, Host and certificate validation. TLS is verified normally: this bypasses
a broken resolver, it does not weaken transport security.

    ./rpc-proxy.py            # listens on 127.0.0.1:8545
    forge script ... --rpc-url http://127.0.0.1:8545
"""
import json
import socket
import ssl
import sys
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

UPSTREAM_HOST = "rpc.mainnet.chain.robinhood.com"
UPSTREAM_URL = f"https://{UPSTREAM_HOST}/"
LISTEN = ("127.0.0.1", 8545)
# Fallbacks in case DoH itself is unreachable; verified serving chain 4663.
FALLBACK_IPS = ["104.20.46.209", "172.66.147.70"]
# Cloudflare fronts this RPC and 403s urllib's default "Python-urllib/x.y" agent, so send a
# normal one. curl works untouched, which is why the manual probes succeeded earlier.
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
HEADERS = {"content-type": "application/json", "user-agent": UA, "accept": "*/*"}


def resolve_via_doh(name):
    """Resolve A records through Cloudflare DoH, sidestepping the local resolver."""
    url = f"https://cloudflare-dns.com/dns-query?name={name}&type=A"
    req = urllib.request.Request(
        url, headers={"accept": "application/dns-json", "user-agent": UA})
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.load(r)
    return [a["data"] for a in data.get("Answer", []) if a.get("type") == 1]


def pin(name, ips):
    """Force `name` to resolve to `ips`, leaving SNI/Host/cert checks on the real name.

    http.client takes the address from getaddrinfo but uses the URL hostname for SNI and
    certificate verification, so patching only the lookup keeps TLS fully validated.
    """
    original = socket.getaddrinfo

    def patched(host, port, *args, **kwargs):
        if host == name:
            last = None
            for ip in ips:
                try:
                    return original(ip, port, *args, **kwargs)
                except OSError as e:  # try the next pinned IP
                    last = e
            raise last
        return original(host, port, *args, **kwargs)

    socket.getaddrinfo = patched


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("content-length", 0)))
        req = urllib.request.Request(UPSTREAM_URL, data=body, headers=HEADERS)
        try:
            with urllib.request.urlopen(req, timeout=60, context=ssl.create_default_context()) as r:
                out, code = r.read(), r.status
        except Exception as e:  # surface upstream failures as a JSON-RPC error
            out = json.dumps({"jsonrpc": "2.0", "id": None,
                              "error": {"code": -32000, "message": f"proxy: {e}"}}).encode()
            code = 200
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def log_message(self, *a):
        pass  # forge is chatty; stay quiet


if __name__ == "__main__":
    try:
        ips = resolve_via_doh(UPSTREAM_HOST) or FALLBACK_IPS
    except Exception:
        ips = FALLBACK_IPS
    pin(UPSTREAM_HOST, ips)

    # Fail fast and loudly rather than let forge report a confusing mid-deploy error.
    probe = urllib.request.Request(
        UPSTREAM_URL,
        data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "eth_chainId", "params": []}).encode(),
        headers=HEADERS,
    )
    with urllib.request.urlopen(probe, timeout=20) as r:
        chain = json.load(r).get("result")
    if chain != "0x1237":
        sys.exit(f"upstream is not Robinhood Chain mainnet (chainId {chain}, expected 0x1237)")

    print(f"pinned {UPSTREAM_HOST} -> {ips}")
    print(f"chainId 0x1237 (4663) OK; listening on http://{LISTEN[0]}:{LISTEN[1]}")
    ThreadingHTTPServer(LISTEN, Handler).serve_forever()
