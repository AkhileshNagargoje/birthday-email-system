"""The wording of the birthday email. This is the file to edit for tone."""

import html as _html

from . import config


class _Escaped:
    """Wraps a Student so .name / .first_name come out HTML-safe."""

    def __init__(self, student):
        self.name = _html.escape(student.name)
        self.first_name = _html.escape(student.first_name)


def subject(student):
    return f"Happy Birthday, {student.first_name} — plant a tree today \U0001f331"


def plain_text(student, note=""):
    if note.strip():
        body = note.strip()
    else:
        body = (
            "Every year on your birthday you get older, and so does everything\n"
            "around you. This year the department would like you to leave\n"
            "something behind that will outgrow you.\n\n"
            "PLANT ONE TREE TODAY.\n\n"
            f"{config.SAPLING_INFO}\n"
            "Plant it on campus or at home - your choice. It takes twenty minutes.\n\n"
            "Then reply to this email with a photo of you and your tree. We are\n"
            "collecting every one of them.\n\n"
            f"{config.INITIATIVE_NAME}. That is the whole idea."
        )
    return (
        f"Happy Birthday, {student.first_name}!\n\n"
        f"{body}\n\n"
        f"Have a wonderful year ahead,\n"
        f"{config.HOD_NAME}\n"
        f"{config.HOD_TITLE}, {config.EMAIL_FROM_NAME}\n"
    )


def banner_html(name):
    """The masthead, drawn in HTML rather than as an image.

    Table-based with inline styles and a solid background colour underneath the
    gradient, because Outlook ignores CSS gradients and most modern layout
    properties. No images anywhere: many clients block them by default, and a
    blocked image means the student opens an empty grey box.
    """
    return f"""\
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             border="0" style="background-color:#1b5e3f;">
        <tr>
          <td align="center" style="padding:40px 24px 36px;
              background-color:#1b5e3f;
              background-image:linear-gradient(160deg,#14523a 0%,#2f7d4f 100%);">
            <div style="font-size:34px;line-height:1;margin-bottom:14px;">
              &#127793;
            </div>
            <div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;
                        font-size:13px;letter-spacing:.24em;font-weight:600;
                        color:#a7e0be;text-transform:uppercase;">
              Happy Birthday
            </div>
            <div style="font-family:Georgia,'Times New Roman',serif;
                        font-size:34px;line-height:1.25;font-weight:700;
                        color:#ffffff;padding:8px 0 0;">
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
        # The ask is the point of the email, so it gets the weight: a plain
        # sentence of context, then the request set apart where the eye lands,
        # then the practical detail that makes it doable.
        body = f"""
        <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#33383a;">
          Every year on your birthday you get a little older — and so does
          everything around you. This year the department would like you to
          leave something behind that will outgrow you.
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               border="0" style="margin:0 0 20px;">
          <tr>
            <td style="background-color:#eef7f1;border-left:4px solid #2f7d4f;
                       padding:20px 22px;border-radius:0 8px 8px 0;">
              <div style="font-family:Georgia,'Times New Roman',serif;
                          font-size:22px;font-weight:700;color:#14523a;
                          line-height:1.3;">
                Plant one tree today.
              </div>
              <div style="font-size:15px;line-height:1.6;color:#3d5c4b;
                          padding-top:8px;">
                {_html.escape(config.SAPLING_INFO)} Plant it on campus or at
                home — your choice. It takes twenty minutes.
              </div>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#33383a;">
          Then <strong>reply to this email with a photo</strong> of you and your
          tree. We are collecting every one of them.
        </p>

        <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#5a6b60;
                  font-style:italic;">
          {_html.escape(config.INITIATIVE_NAME)}. That is the whole idea.
        </p>
        """

    return f"""\
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#f2f5f2;
               font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;
                overflow:hidden;box-shadow:0 2px 12px rgba(20,60,40,.10);">

      {header}

      <div style="padding:30px 32px 26px;">
        <p style="margin:0 0 18px;font-size:17px;line-height:1.5;color:#14523a;
                  font-weight:600;">
          Happy Birthday, {student.first_name}!
        </p>
        {body}

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               border="0" style="border-top:1px solid #e3ebe5;margin-top:4px;">
          <tr>
            <td style="padding-top:18px;font-size:14px;line-height:1.55;color:#5a6b60;">
              Have a wonderful year ahead,<br>
              <strong style="color:#14523a;">{_html.escape(config.HOD_NAME)}</strong><br>
              {_html.escape(config.HOD_TITLE)}, {config.EMAIL_FROM_NAME}
            </td>
          </tr>
        </table>
      </div>
    </div>

    <p style="max-width:600px;margin:16px auto 0;font-size:12px;color:#7d8a82;
              text-align:center;line-height:1.5;">
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
