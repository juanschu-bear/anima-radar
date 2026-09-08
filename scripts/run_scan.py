from __future__ import annotations

import argparse
import json
from urllib.request import Request, urlopen


def main() -> None:
    parser = argparse.ArgumentParser(description="Queue an AnimaRadar scan.")
    parser.add_argument("--city", required=True)
    parser.add_argument("--country", required=True)
    parser.add_argument("--category", action="append", required=True)
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--tenant-id")
    args = parser.parse_args()
    payload = json.dumps({"city": args.city, "country": args.country, "categories": args.category, "radius_m": 15000, "sources": ["google_places"]}).encode()
    headers = {"content-type": "application/json"}
    if args.tenant_id:
        headers["x-tenant-id"] = args.tenant_id
    request = Request(f"{args.api.rstrip('/')}/scans", data=payload, headers=headers, method="POST")
    with urlopen(request) as response:
        print(json.dumps(json.load(response), indent=2))


if __name__ == "__main__":
    main()
