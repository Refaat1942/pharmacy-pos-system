#!/usr/bin/env python3
"""Process pending ETA submissions for all active tenants (cron / systemd timer).

Usage:
  cd /opt/pharmapos/backend
  python3 eta/run_worker.py
"""
from __future__ import annotations

import json
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

from eta.worker import process_all_tenants


def main() -> int:
    result = process_all_tenants(limit_per_tenant=20)
    print(json.dumps(result, indent=2, default=str))
    return 0 if not result.get("errors") else 1


if __name__ == "__main__":
    raise SystemExit(main())
