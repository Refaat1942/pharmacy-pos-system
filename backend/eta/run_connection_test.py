#!/usr/bin/env python3
"""Run on VPS to diagnose ETA connection. Does not print secrets.

Usage:
  cd /opt/pharmapos/backend
  python3 eta/run_connection_test.py \\
    --base-url https://testserver.misrapp.com/api \\
    --auth-key 'PASTE_AUTH_KEY' \\
    --secret 'EtaCyrus@1234'
"""
from __future__ import annotations

import argparse
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from eta.client import EtaMiddlewareClient


def main() -> int:
    p = argparse.ArgumentParser(description="Test EtaMiddleware connection from this server")
    p.add_argument("--base-url", default="https://testserver.misrapp.com/api")
    p.add_argument("--auth-key", required=True)
    p.add_argument("--secret", required=True)
    args = p.parse_args()

    auth = args.auth_key.strip()
    secret = args.secret.strip()
    print(f"Base URL: {args.base_url.rstrip('/')}")
    print(f"Auth key length: {len(auth)} chars (sandbox key from credential.txt is 128; no leading/trailing spaces)")
    print(f"Secret length: {len(secret)} chars")
    print("---")

    client = EtaMiddlewareClient(
        base_url=args.base_url.rstrip("/"),
        auth_key=auth,
        secret_key=secret,
        timeout=30.0,
    )
    result = client.test_connection()
    print(json.dumps(result, indent=2, ensure_ascii=False, default=str))

    if result.get("auth_ok"):
        print("\nRESULT: SUCCESS — authentication OK")
        return 0
    print("\nRESULT: FAILED — send this full output to the ETA developer")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
