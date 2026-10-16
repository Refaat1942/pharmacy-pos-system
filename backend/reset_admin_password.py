"""Set (or create) a pharmacy's admin login from the server shell.

Usage (on the VPS, with the same env as the service):
    cd /opt/pharmapos/backend
    sudo -E ../venv/bin/python reset_admin_password.py fratelanza            # random password
    sudo -E ../venv/bin/python reset_admin_password.py fratelanza admin 'MyNewPass123'

Prints the pharmacy code, username and password to use on the login screen.
"""
import os
import secrets
import string
import sys

sys.path.insert(0, os.path.dirname(__file__))

from platform_db import bootstrap_platform, get_tenant_by_slug, reset_tenant_admin_password  # noqa: E402


def _random_password(n: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(n))


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    slug = argv[1].strip().lower()
    username = argv[2] if len(argv) > 2 else "admin"
    password = argv[3] if len(argv) > 3 else _random_password()

    bootstrap_platform()  # also moves a legacy 'public' default tenant to its own schema
    tenant = get_tenant_by_slug(slug)
    if not tenant:
        print(f"No pharmacy with code '{slug}'")
        return 1
    result = reset_tenant_admin_password(tenant["id"], password, username)
    print("Login details")
    print(f"  Pharmacy code : {result['pharmacy_code']}")
    print(f"  Username      : {result['username']}")
    print(f"  Password      : {password}")
    print(f"  ({'new admin user created' if result['created'] else 'password updated'};"
          f" data schema: {tenant['schema_name']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
