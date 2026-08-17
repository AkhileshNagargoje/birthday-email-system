"""The wording of the birthday email. This is the file to edit for tone."""

import html as _html

from . import config


class _Escaped:
    """Wraps a Student so .name / .first_name come out HTML-safe."""

    def __init__(self, student):
        self.name = _html.escape(student.name)
        self.first_name = _html.escape(student.first_name)


def subject(student):
    return f"Happy Birthday, {student.first_name}! \U0001f389"


def plain_text(student, note=""):
    body = note.strip() or (
        "Wishing you a wonderful year ahead filled with good health, "
        "great friends and plenty of success.\n\nHave a fantastic day!"
    )
    return (
        f"Happy Birthday, {student.first_name}!\n\n"
        f"{body}\n\n"
        f"— {config.EMAIL_FROM_NAME}\n"
    )


def banner_html(name):
    """The birthday banner drawn in HTML instead of as an image.

    Table-based with inline styles and a solid background colour, because
    Outlook ignores CSS gradients and most layout properties. The gradient is
    layered on top for the clients that do support it.
    """
    return f"""\
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             border="0" style="background-color:#3b2a72;">
        <tr>
          <td align="center" style="padding:44px 24px;
              background-color:#3b2a72;
              background-image:linear-gradient(135deg,#232860 0%,#92347a 100%);">
            <div style="font-size:30px;line-height:1;margin-bottom:16px;">
              &#127881; &#127874; &#127880;
            </div>
            <div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;
                        font-size:17px;letter-spacing:.22em;font-weight:600;
                        color:#ffd166;text-transform:uppercase;">
              Happy Birthday
            </div>
            <div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;
                        font-size:38px;line-height:1.2;font-weight:700;
                        color:#ffffff;padding-top:10px;">
              {name}
            </div>
          </td>
        </tr>
      </table>"""


def html(student, image_cid, note=""):
    # A name with & or < would otherwise break the markup.
    student = _Escaped(student)

    if image_cid:
        header = (f'<img src="cid:{image_cid}" alt="Happy Birthday {student.name}" '
                  f'style="display:block;width:100%;height:auto;" />')
    else:
        header = banner_html(student.name)

    if note.strip():
        # Keep the writer's line breaks without letting them inject markup.
        body = "".join(
            f'<p style="margin:0 0 14px;font-size:16px;line-height:1.6;">'
            f'{_html.escape(para)}</p>'
            for para in note.strip().split("\n") if para.strip()
        )
    else:
        body = (
            '<p style="margin:0 0 14px;font-size:16px;line-height:1.6;">'
            'Wishing you a wonderful year ahead filled with good health, '
            'great friends and plenty of success.</p>'
            '<p style="margin:0 0 24px;font-size:16px;line-height:1.6;">'
            'Have a fantastic day!</p>'
        )

    return f"""\
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#f4f5f7;
               font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;
                overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">

      {header}

      <div style="padding:28px 32px;">
        <h1 style="margin:0 0 12px;font-size:24px;">
          Happy Birthday, {student.first_name}! 🎉
        </h1>
        {body}
        <p style="margin:0;font-size:14px;color:#666;">
          — {config.EMAIL_FROM_NAME}
        </p>
      </div>
    </div>

    <p style="max-width:640px;margin:16px auto 0;font-size:12px;color:#8a8a8a;
              text-align:center;">
      You are receiving this because your birthday is recorded with
      {config.EMAIL_FROM_NAME}.
    </p>
  </body>
</html>
"""


# ---------------------------------------------------------------------------
# The daily report that goes to you, not to students
# ---------------------------------------------------------------------------

def report_subject(run_date, sent, failed):
    if failed:
        return f"[Birthday bot] {run_date}: {failed} FAILED, {sent} sent"
    if sent:
        return f"[Birthday bot] {run_date}: {sent} wish(es) sent"
    return f"[Birthday bot] {run_date}: no birthdays today"


def report_html(run_date, results, roster_size, bad_rows, test_mode):
    sent = [r for r in results if r["status"] == "sent"]
    failed = [r for r in results if r["status"] == "failed"]
    skipped = [r for r in results if r["status"] == "skipped"]

    if failed:
        banner, colour = f"{len(failed)} message(s) failed", "#c0392b"
    elif sent:
        banner, colour = f"{len(sent)} birthday wish(es) sent", "#1e8449"
    else:
        banner, colour = "No birthdays today - all good", "#555555"

    def rows(items, label):
        if not items:
            return ""
        cells = "".join(
            f"<tr><td style='padding:6px 10px;border-bottom:1px solid #eee;'>"
            f"{_html.escape(r['name'])}</td>"
            f"<td style='padding:6px 10px;border-bottom:1px solid #eee;color:#666;'>"
            f"{_html.escape(r['detail'])}</td></tr>"
            for r in items
        )
        return (
            f"<h3 style='margin:22px 0 8px;font-size:15px;'>{label}</h3>"
            f"<table style='border-collapse:collapse;width:100%;font-size:14px;'>"
            f"{cells}</table>"
        )

    warning = ""
    if test_mode:
        warning += (
            "<p style='margin:0 0 12px;padding:10px 14px;background:#fff4e5;"
            "border-left:4px solid #f0932b;font-size:14px;'>"
            "TEST_EMAIL is set - these went to you, not to students.</p>"
        )
    if bad_rows:
        warning += (
            f"<p style='margin:0 0 12px;padding:10px 14px;background:#fdecea;"
            f"border-left:4px solid #c0392b;font-size:14px;'>"
            f"{bad_rows} row(s) in the student list were skipped because of bad "
            f"data. Those students will never be wished until it is fixed.</p>"
        )

    return f"""\
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#f4f5f7;
               font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:10px;
                padding:24px 28px;box-shadow:0 1px 6px rgba(0,0,0,.08);">
      <p style="margin:0;font-size:13px;color:#888;">{run_date}</p>
      <h2 style="margin:4px 0 18px;font-size:20px;color:{colour};">{banner}</h2>
      {warning}
      <p style="margin:0;font-size:14px;color:#666;">
        {roster_size} students on the list.
      </p>
      {rows(sent, "Sent")}
      {rows(failed, "Failed")}
      {rows(skipped, "Skipped (already wished)")}
    </div>
    <p style="max-width:620px;margin:14px auto 0;font-size:12px;color:#8a8a8a;
              text-align:center;">
      Automatic report from your birthday email system.
    </p>
  </body>
</html>
"""


def report_text(run_date, results, roster_size):
    lines = [f"Birthday bot - {run_date}", f"{roster_size} students on the list", ""]
    for r in results:
        lines.append(f"  {r['status'].upper():<8} {r['name']}  {r['detail']}")
    if not results:
        lines.append("  No birthdays today.")
    return "\n".join(lines) + "\n"
