#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import urllib.request


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--status", required=True, choices=["rendering", "ready", "failed"])
    parser.add_argument("--video-url")
    parser.add_argument("--error")
    args = parser.parse_args()
    payload = json.loads(os.environ["VAV_PAYLOAD"])
    body = {
        "post_id": payload["post_id"],
        "status": args.status,
        "video_url": args.video_url,
        "run_url": os.environ.get("VAV_RUN_URL"),
        "error": args.error,
    }
    request = urllib.request.Request(
        payload["callback_url"],
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {os.environ['VAV_CALLBACK_SECRET']}",
            "Content-Type": "application/json",
            "User-Agent": "VAV-Social-AI-Renderer/2.0",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status >= 300:
            raise RuntimeError(f"Callback HTTP {response.status}")


if __name__ == "__main__":
    main()
