"""A small local dashboard. Runs on your machine only, in your browser.

    python -m src.dashboard      (or double-click Dashboard.bat)

Actions are run as subprocesses so that a settings change takes effect
immediately, without restarting the dashboard.
"""

import subprocess
import sys
import webbrowser
from datetime import date, timedelta
from pathlib import Path
from threading import Timer

from flask import Flask, jsonify, redirect, render_template, request, url_for

from . import config, sent_log, store, students as roster

app = Flask(__name__, template_folder="../templates", static_folder=None)
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
# Without this, Flask compiles the template once and edits to it are ignored
# until the process restarts.
app.config["TEMPLATES_AUTO_RELOAD"] = True
app.jinja_env.auto_reload = True

HOST = "127.0.0.1"
PORT = 5000


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run_cli(*cli_args, timeout=300):
    """Runs src.main in a fresh process and returns its combined output."""
    proc = subprocess.run(
        [sys.executable, "-m", "src.main", *cli_args],
        cwd=str(config.ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
    )
    output = (proc.stdout or "") + (proc.stderr or "")
    return proc.returncode, output.strip() or "(no output)"


def _overview():
    today = date.today()
    try:
        students, bad = roster.load_students()
    except Exception as exc:
        return {"error": str(exc), "total": 0, "today": [], "upcoming": [],
                "problems": 0, "last_run": None}

    upcoming = []
    for offset in range(1, 61):
        day = today + timedelta(days=offset)
        for student in roster.birthdays_on(students, day):
            upcoming.append({
                "name": student.name,
                "date": day.strftime("%d %b"),
                "days": offset,
            })
        if len(upcoming) >= 6:
            break

    return {
        "error": None,
        "total": len(students),
        "today": [s.name for s in roster.birthdays_on(students, today)],
        "upcoming": upcoming,
        "problems": len(bad),
        "last_run": _last_run(),
    }


def _last_run():
    if not config.SENT_LOG.exists():
        return None
    import csv
    with open(config.SENT_LOG, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    if not rows:
        return None
    last = rows[-1]
    return {
        "when": last.get("sent_at", "").replace("T", " "),
        "count": sum(1 for r in rows if r.get("sent_at", "")[:10] == last.get("sent_at", "")[:10]
                     and r.get("status") == "sent"),
    }


def _ready_to_send():
    """What still needs doing before real wishes can go out."""
    blockers = []
    settings = store.read_settings()
    if not settings.get("EMAIL_USER") or settings["EMAIL_USER"] == "you@example.com":
        blockers.append("No sending address set in Settings.")
    if not settings.get("EMAIL_PASS") or settings["EMAIL_PASS"].startswith("xxxx"):
        blockers.append("No app password set in Settings.")
    if not Path(config.POSTER_TEMPLATE).exists():
        blockers.append("No poster template - click Rebuild template.")
    return blockers, settings


# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    blockers, settings = _ready_to_send()
    return render_template(
        "index.html",
        overview=_overview(),
        students=store.list_students(),
        settings=settings,
        blockers=blockers,
        test_mode=bool(settings.get("TEST_EMAIL")),
        source=config.SOURCE_PATH.name,
        message=request.args.get("msg"),
        error=request.args.get("err"),
    )


# ---------------------------------------------------------------------------
# Student edits
# ---------------------------------------------------------------------------

@app.post("/students/add")
def add_student():
    try:
        store.add_student(
            request.form.get("name", ""),
            request.form.get("email", ""),
            request.form.get("dob", ""),
        )
        return redirect(url_for("index", msg="Student added."))
    except Exception as exc:
        return redirect(url_for("index", err=str(exc)))


@app.post("/students/update")
def update_student():
    try:
        store.update_student(
            int(request.form["index"]),
            request.form.get("name", ""),
            request.form.get("email", ""),
            request.form.get("dob", ""),
        )
        return redirect(url_for("index", msg="Saved."))
    except Exception as exc:
        return redirect(url_for("index", err=str(exc)))


@app.post("/students/delete")
def delete_student():
    try:
        name = store.delete_student(int(request.form["index"]))
        return redirect(url_for("index", msg=f"Removed {name}."))
    except Exception as exc:
        return redirect(url_for("index", err=str(exc)))


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

@app.post("/settings")
def save_settings():
    try:
        updates = {}
        for key in store.EDITABLE:
            if key in request.form:
                updates[key] = store.validate_setting(key, request.form[key])
        store.write_settings(updates)
        return redirect(url_for("index", msg="Settings saved."))
    except Exception as exc:
        return redirect(url_for("index", err=str(exc)))


# ---------------------------------------------------------------------------
# Actions (called by fetch, return JSON)
# ---------------------------------------------------------------------------

@app.post("/action/check")
def action_check():
    code, output = _run_cli("--validate")
    return jsonify(ok=code == 0, output=output)


@app.post("/action/test")
def action_test():
    args = ["--dry-run"]
    when = (request.json or {}).get("date", "").strip()
    if when:
        args += ["--date", when]
    code, output = _run_cli(*args)
    return jsonify(ok=code == 0, output=output)


@app.post("/action/send")
def action_send():
    if (request.json or {}).get("confirm") != "SEND":
        return jsonify(ok=False, output="Not confirmed - nothing was sent."), 400
    blockers, _ = _ready_to_send()
    if blockers:
        return jsonify(ok=False, output="Cannot send yet:\n  " + "\n  ".join(blockers)), 400
    code, output = _run_cli()
    return jsonify(ok=code == 0, output=output)


@app.post("/action/wish")
def action_wish():
    data = request.json or {}
    address = (data.get("email") or "").strip()
    name = (data.get("name") or "").strip()
    dry = bool(data.get("dry"))

    if not address:
        return jsonify(ok=False, output="No address given."), 400
    # A preview needs no confirmation - nothing leaves the machine.
    if not dry and data.get("confirm") != "SEND":
        return jsonify(ok=False, output="Not confirmed - nothing was sent."), 400
    if not dry:
        blockers, _ = _ready_to_send()
        if blockers:
            return jsonify(ok=False,
                           output="Cannot send yet:\n  " + "\n  ".join(blockers)), 400

    args = ["--wish", address]
    if name:
        args += ["--wish-name", name]
    note = (data.get("note") or "").strip()
    if note:
        args += ["--wish-note", note]
    if data.get("dry"):
        args.append("--dry-run")
    code, output = _run_cli(*args)
    return jsonify(ok=code == 0, output=output)


@app.post("/action/preview")
def action_preview():
    name = (request.json or {}).get("name", "").strip() or "Student Name"
    code, output = _run_cli("--preview", name)
    if code != 0:
        return jsonify(ok=False, output=output, kind=None, url=None)

    # Read the mode from .env rather than the imported config, so switching it
    # in Settings takes effect without restarting the dashboard.
    mode = (store.read_settings().get("POSTER_MODE") or "html").lower()
    if mode == "image":
        return jsonify(ok=True, output=output, kind="image",
                       url=url_for("preview_image"))
    return jsonify(ok=True, output=output, kind="html",
                   url=url_for("preview_page"))


@app.get("/preview.html")
def preview_page():
    path = config.OUT_DIR / "preview.html"
    if not path.exists():
        return "", 404
    return path.read_text(encoding="utf-8"), 200, {"Content-Type": "text/html"}


@app.post("/action/template")
def action_template():
    proc = subprocess.run(
        [sys.executable, str(config.ROOT / "tools" / "make_template.py")],
        cwd=str(config.ROOT), capture_output=True, text=True,
        encoding="utf-8", errors="replace", timeout=120,
    )
    output = ((proc.stdout or "") + (proc.stderr or "")).strip()
    return jsonify(ok=proc.returncode == 0, output=output or "(no output)")


@app.get("/preview.png")
def preview_image():
    from flask import send_file
    path = config.OUT_DIR / "preview.png"
    if not path.exists():
        return "", 404
    return send_file(path, mimetype="image/png")


@app.get("/history")
def history():
    if not config.SENT_LOG.exists():
        return jsonify(rows=[])
    import csv
    with open(config.SENT_LOG, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    return jsonify(rows=rows[-100:][::-1])


def main():
    url = f"http://{HOST}:{PORT}/"
    print(f"\n  Birthday dashboard running at {url}")
    print("  Leave this window open while you use it. Ctrl+C to stop.\n")
    Timer(1.0, lambda: webbrowser.open(url)).start()
    app.run(host=HOST, port=PORT, debug=False)


if __name__ == "__main__":
    main()
