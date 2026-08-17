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
    """The masthead, drawn entirely in HTML.

    No image files anywhere, deliberately. Gmail and Outlook block images by
    default from senders you have not corresponded with, and a blocked image
    means the student opens a grey box instead of a message. Everything here -
    the gradient, the rules, the ornament - is markup that always renders.

    Table-based with inline styles, a `bgcolor` attribute and a solid colour
    beneath the gradient, because Outlook ignores gradients and most modern
    CSS. It degrades to flat forest green, which still looks intentional.
    """
    return f"""\
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             border="0" bgcolor="#14523a" style="background-color:#14523a;">
        <tr>
          <td align="center" class="hero" style="padding:14px 20px 0;background-color:#14523a;
              background-image:linear-gradient(165deg,#0f4230 0%,#1b5e3f 55%,#2b7a4e 100%);">
            <div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;
                        font-size:10.5px;letter-spacing:.26em;font-weight:600;
                        color:#7fc59b;text-transform:uppercase;">
              {_html.escape(config.EMAIL_FROM_NAME)}
            </div>
          </td>
        </tr>
        <tr>
          <td align="center" class="hero" style="padding:20px 20px 6px;background-color:#14523a;
              background-image:linear-gradient(165deg,#0f4230 0%,#1b5e3f 55%,#2b7a4e 100%);">
            <div style="font-size:44px;line-height:1;">&#127795;</div>
          </td>
        </tr>
        <tr>
          <td align="center" class="hero" style="padding:10px 20px 0;background-color:#1b5e3f;
              background-image:linear-gradient(165deg,#0f4230 0%,#1b5e3f 55%,#2b7a4e 100%);">
            <div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;
                        font-size:11.5px;letter-spacing:.3em;font-weight:600;
                        color:#a7e0be;text-transform:uppercase;">
              Happy Birthday
            </div>
          </td>
        </tr>
        <tr>
          <td align="center" class="hero" style="padding:6px 20px 4px;background-color:#1b5e3f;
              background-image:linear-gradient(165deg,#0f4230 0%,#1b5e3f 55%,#2b7a4e 100%);">
            <div style="font-family:Georgia,'Times New Roman',serif;
                        font-size:33px;line-height:1.2;font-weight:700;
                        color:#ffffff;letter-spacing:-0.01em;" class="name">
              {name}
            </div>
          </td>
        </tr>
        <tr>
          <td align="center" class="hero" style="padding:14px 20px 28px;background-color:#2b7a4e;
              background-image:linear-gradient(165deg,#0f4230 0%,#1b5e3f 55%,#2b7a4e 100%);">
            <!-- A short rule instead of a divider line: quieter, and it reads
                 as ornament rather than a seam. -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr><td width="46" height="2" bgcolor="#7fc59b"
                      style="background-color:#7fc59b;font-size:0;line-height:0;">&nbsp;</td></tr>
            </table>
          </td>
        </tr>
      </table>"""


def steps_html():
    """The three things to actually do, as numbered steps.

    Prettier than a paragraph, and more effective: an instruction someone can
    picture themselves completing gets done far more often than an appeal.
    """
    steps = [
        ("1", "Collect", "a free sapling"),
        ("2", "Plant", "on campus or at home"),
        ("3", "Reply", "with a photo"),
    ]
    cells = "".join(f"""
            <td width="33%" align="center" valign="top" class="step" style="padding:0 6px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                     align="center">
                <tr>
                  <td width="30" height="30" align="center" valign="middle"
                      bgcolor="#14523a" style="background-color:#14523a;
                      border-radius:15px;font-family:Georgia,serif;font-size:14px;
                      font-weight:700;color:#ffffff;line-height:30px;">{n}</td>
                </tr>
              </table>
              <div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;
                          font-size:14px;font-weight:600;color:#14523a;
                          padding-top:10px;">{title}</div>
              <div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;
                          font-size:12.5px;line-height:1.45;color:#6a7d70;
                          padding-top:3px;">{sub}</div>
            </td>""" for n, title, sub in steps)

    return f"""
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               border="0" style="margin:0 0 26px;">
          <tr>{cells}
          </tr>
        </table>"""


def html(student, image_src, note=""):
    """`image_src` is the full src for the banner - "cid:..." when the image
    travels with the email, or a data: URI when previewing. None means draw
    the header in HTML instead."""
    # A name with & or < would otherwise break the markup.
    student = _Escaped(student)

    if image_src:
        # The banner sits on a green cell with pale alt text, so a client that
        # blocks images shows a green band saying "Happy Birthday, <name>"
        # rather than a broken-image icon on white.
        header = f"""
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             border="0" bgcolor="#14523a" style="background-color:#14523a;">
        <tr>
          <td align="center" style="background-color:#14523a;line-height:0;">
            <img src="{image_src}" width="600"
                 alt="Happy Birthday, {student.name} — {_html.escape(config.INITIATIVE_NAME)}"
                 style="display:block;width:100%;max-width:600px;height:auto;
                        border:0;outline:none;text-decoration:none;
                        font-family:Georgia,serif;font-size:20px;color:#ffffff;" />
          </td>
        </tr>
      </table>"""
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
        <p class="body-t" style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#33383a;">
          Every year on your birthday you get a little older — and so does
          everything around you. This year the department would like you to
          leave something behind that will outgrow you.
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               border="0" style="margin:0 0 24px;">
          <tr>
            <td bgcolor="#f0f7f2" class="ask" style="background-color:#f0f7f2;
                       border:1px solid #d7e8de;border-left:4px solid #2b7a4e;
                       padding:20px 22px;border-radius:0 10px 10px 0;">
              <div class="ask-h" style="font-family:Georgia,'Times New Roman',serif;
                          font-size:24px;font-weight:700;color:#14523a;
                          line-height:1.25;letter-spacing:-0.01em;">
                Plant one tree today.
              </div>
              <div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;
                          font-size:14.5px;line-height:1.6;color:#4a6153;
                          padding-top:9px;">
                {_html.escape(config.SAPLING_INFO)} It takes twenty minutes.
              </div>
            </td>
          </tr>
        </table>

        {steps_html()}

        <p class="body-t" style="margin:0 0 22px;font-size:15.5px;line-height:1.65;color:#3a4a40;
                  text-align:center;">
          Send us the photo and we will add your tree to the count.<br>
          <span style="color:#6a7d70;font-size:14.5px;">
            Every student gets this email on their birthday. By the time you
            graduate, your batch will have planted hundreds.
          </span>
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               border="0" style="margin:0 0 22px;">
          <tr>
            <td align="center" style="font-family:Georgia,'Times New Roman',serif;
                       font-size:15px;font-style:italic;color:#2b7a4e;
                       letter-spacing:.01em;">
              &#127807; {_html.escape(config.INITIATIVE_NAME)}
            </td>
          </tr>
        </table>
        """

    return f"""\
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      /* Phones. Gmail, Apple Mail and Outlook mobile all honour this; the
         clients that ignore it fall back to the inline styles, which are
         already sized to fit a narrow screen. */
      @media only screen and (max-width:480px) {{
        .wrap    {{ padding:10px !important; }}
        .card    {{ border-radius:10px !important; }}
        .pad     {{ padding:20px 18px 22px !important; }}
        .hero    {{ padding-left:16px !important; padding-right:16px !important; }}
        .name    {{ font-size:27px !important; }}
        .ask     {{ padding:16px 16px !important; }}
        .ask-h   {{ font-size:20px !important; }}
        .body-t  {{ font-size:15px !important; }}
        /* Three steps side by side become three stacked rows: 90px columns
           are unreadable, and stacking is what a phone wants anyway. */
        .step    {{ display:block !important; width:100% !important;
                    padding:0 0 14px !important; }}
      }}
    </style>
  </head>
  <body class="wrap" style="margin:0;padding:20px;background:#f2f5f2;
               font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <div class="card" style="max-width:600px;margin:0 auto;background:#ffffff;
                border-radius:12px;overflow:hidden;
                box-shadow:0 2px 12px rgba(20,60,40,.10);">

      {header}

      <div class="pad" style="padding:28px 30px 26px;">
        <p style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;
                  font-size:19px;line-height:1.45;color:#14523a;">
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

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="padding:18px 24px 0;">
          <div style="max-width:600px;font-family:Segoe UI,Helvetica,Arial,sans-serif;
                      font-size:11.5px;line-height:1.55;color:#7d8a82;">
            You are receiving this because your birthday is recorded with
            {config.EMAIL_FROM_NAME}.
          </div>
        </td>
      </tr>
    </table>
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
