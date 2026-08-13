"""Reads and writes the student list through the GitHub API.

Free hosts wipe the disk on every restart, so a hosted dashboard cannot keep
the roster in a file. This keeps the repository as the single source of truth:
the dashboard commits changes back, and the scheduled workflow reads the same
file. Editing on github.com directly keeps working too.

Falls back to plain local files when GITHUB_TOKEN / GITHUB_REPO are unset, so
running on your own machine is unchanged.
"""

import base64
import json
import os
import urllib.error
import urllib.request

API = "https://api.github.com"

TOKEN = os.getenv("GITHUB_TOKEN", "").strip()
REPO = os.getenv("GITHUB_REPO", "").strip()          # "owner/name"
BRANCH = os.getenv("GITHUB_BRANCH", "main").strip()


def enabled():
    return bool(TOKEN and REPO)


def _request(method, url, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    req.add_header("User-Agent", "birthday-email-system")
    if data:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode())


def fetch(path):
    """Returns (text, sha). (None, None) if the file is not there yet."""
    url = f"{API}/repos/{REPO}/contents/{path}?ref={BRANCH}"
    try:
        info = _request("GET", url)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None, None
        raise
    text = base64.b64decode(info["content"]).decode("utf-8")
    return text, info["sha"]


def put(path, text, message):
    """Commits `text` to `path`. Re-reads the sha first so an edit made on
    github.com in the meantime does not cause a lost update."""
    _, sha = fetch(path)
    payload = {
        "message": message,
        "content": base64.b64encode(text.encode("utf-8")).decode("ascii"),
        "branch": BRANCH,
    }
    if sha:
        payload["sha"] = sha
    _request("PUT", f"{API}/repos/{REPO}/contents/{path}", payload)


def describe():
    if not enabled():
        return "local file"
    return f"{REPO} · {BRANCH}"
