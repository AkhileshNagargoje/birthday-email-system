/**
 * Birthday emails, sent from inside Google.
 *
 * This is a port of the Python sender (src/) to Google Apps Script. The
 * difference that matters is not the language: this runs on Google's own
 * servers, as the signed-in account, through Gmail's front door. There is no
 * SMTP submission from a datacenter IP and no app password - the two things
 * that made the previous setup look like a compromised account.
 *
 * The roster is a Google Sheet, so a Form's responses sheet works directly:
 * a student submits the form, and the next morning they are in scope.
 *
 * Paste this into a Workspace account later and nothing changes - that is the
 * intended end state, and why there is no infrastructure here to migrate.
 */

// ---------------------------------------------------------------------------
// Settings. The only part you should need to edit.
// ---------------------------------------------------------------------------

const CONFIG = {
  // Leave blank to use the first sheet in the spreadsheet. For a Form, that
  // is usually "Form Responses 1".
  SHEET_NAME: '',

  // Shown as the sender's name, and used in the wording.
  FROM_NAME: 'GCOERC',

  // Where the daily summary goes. Blank = no report.
  REPORT_EMAIL: 'hymanper@gmail.com',

  // Replies land here. Blank = the account running the script.
  REPLY_TO: 'hymanper@gmail.com',

  // SAFETY NET, deliberately on. While this holds an address, every greeting
  // goes there instead of to students. Watch one real run land, then clear it
  // to '' to go live.
  TEST_EMAIL: 'hymanper@gmail.com',

  // Send the report even on days when nobody has a birthday, as proof the
  // schedule ran at all.
  REPORT_ALWAYS: true,

  // Column headings are matched loosely, in this order, so a Form export
  // works whatever the questions were called. First hit wins.
  NAME_KEYS: ['full name', 'student name', 'your name', 'name'],
  EMAIL_KEYS: ['email address', 'email', 'e-mail', 'mail id', 'mail'],
  DOB_KEYS: ['date of birth', 'birth date', 'birthday', 'birthdate', 'dob'],

  // The script adds this column itself and writes the date it last wished
  // each person. It is what stops a second run of the same day sending twice.
  WISHED_COLUMN: 'Last Wished',

  TIMEZONE: 'Asia/Kolkata'
};

// ---------------------------------------------------------------------------
// The daily job. Point the trigger at this.
// ---------------------------------------------------------------------------

function dailySend() {
  const today = todayInZone_();
  const occasion = Utilities.formatDate(today, CONFIG.TIMEZONE, 'yyyy-MM-dd');
  const sheet = rosterSheet_();
  const table = readRoster_(sheet);

  const results = [];
  let sent = 0, skipped = 0, failed = 0;

  table.students.forEach(function (student) {
    if (!isBirthday_(student.dob, today)) return;

    // Already wished today? The sheet remembers, so a repeat run is harmless.
    if (student.lastWished === occasion) {
      results.push({ name: student.name, detail: 'already wished today', status: 'skipped' });
      skipped++;
      return;
    }

    const to = CONFIG.TEST_EMAIL || student.email;
    try {
      GmailApp.sendEmail(to, subjectFor_(student.name), plainTextFor_(student.name), {
        htmlBody: htmlFor_(student.name),
        name: CONFIG.FROM_NAME,
        replyTo: CONFIG.REPLY_TO || undefined
      });
      sheet.getRange(student.row, table.wishedCol).setValue(occasion);
      results.push({ name: student.name, detail: to, status: 'sent' });
      sent++;
    } catch (err) {
      // One bad address must not stop the rest of the run.
      results.push({ name: student.name, detail: String(err), status: 'failed' });
      failed++;
    }
  });

  Logger.log('%s: sent=%s skipped=%s failed=%s among %s students',
             occasion, sent, skipped, failed, table.students.length);

  sendReport_(occasion, results, table, sent, failed);
  return { date: occasion, sent: sent, skipped: skipped, failed: failed };
}

// ---------------------------------------------------------------------------
// Manual helpers - run these from the editor's Run menu.
// ---------------------------------------------------------------------------

/** Checks the roster and sends nothing. Run this first. */
function validateRoster() {
  const table = readRoster_(rosterSheet_());
  Logger.log('Roster: %s student(s) readable', table.students.length);

  if (table.problems.length === 0) {
    Logger.log('No problems found.');
  } else {
    Logger.log('%s row(s) skipped - these people will never be wished:',
               table.problems.length);
    table.problems.forEach(function (p) {
      Logger.log('  row %s: %s', p.row, p.reason);
    });
  }

  const today = todayInZone_();
  const due = table.students.filter(function (s) { return isBirthday_(s.dob, today); });
  Logger.log('Birthdays today (%s): %s',
             Utilities.formatDate(today, CONFIG.TIMEZONE, 'yyyy-MM-dd'),
             due.length ? due.map(function (s) { return s.name; }).join(', ') : 'none');
}

/** One greeting to any address, ignoring the roster and today's date. */
function sendTestTo(email, name) {
  const to = email || Session.getActiveUser().getEmail();
  const who = name || 'Student';
  GmailApp.sendEmail(to, subjectFor_(who), plainTextFor_(who), {
    htmlBody: htmlFor_(who),
    name: CONFIG.FROM_NAME,
    replyTo: CONFIG.REPLY_TO || undefined
  });
  Logger.log('Sent a test greeting for "%s" to %s', who, to);
}

/** Sends a test to whoever is running the script. Safe to click. */
function sendTestToMyself() {
  sendTestTo(Session.getActiveUser().getEmail(), 'Test Student');
}

/** Creates the daily trigger, replacing any it already made. */
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailySend') ScriptApp.deleteTrigger(t);
  });

  // Apps Script schedules within the chosen hour rather than on the minute,
  // which is fine for a birthday wish and far more punctual than the free
  // GitHub cron this replaces.
  ScriptApp.newTrigger('dailySend')
    .timeBased()
    .atHour(0)
    .nearMinute(15)
    .everyDays(1)
    .inTimezone(CONFIG.TIMEZONE)
    .create();

  Logger.log('Daily trigger installed: dailySend, around 00:15 %s', CONFIG.TIMEZONE);
}

/** Removes the daily trigger. */
function removeTrigger() {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailySend') { ScriptApp.deleteTrigger(t); removed++; }
  });
  Logger.log('Removed %s trigger(s).', removed);
}

// ---------------------------------------------------------------------------
// Reading the sheet
// ---------------------------------------------------------------------------

function rosterSheet_() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) {
    throw new Error('This script must be bound to a spreadsheet ' +
                    '(open the Sheet, then Extensions > Apps Script).');
  }
  const sheet = CONFIG.SHEET_NAME ? book.getSheetByName(CONFIG.SHEET_NAME) : book.getSheets()[0];
  if (!sheet) throw new Error('No sheet named "' + CONFIG.SHEET_NAME + '".');
  return sheet;
}

/** Finds a column by keyword, exact match first, then contains. */
function findColumn_(headers, keys) {
  const lower = headers.map(function (h) { return String(h || '').trim().toLowerCase(); });
  for (let k = 0; k < keys.length; k++) {
    const hit = lower.indexOf(keys[k]);
    if (hit !== -1) return hit;
  }
  for (let k = 0; k < keys.length; k++) {
    for (let i = 0; i < lower.length; i++) {
      if (lower[i] && lower[i].indexOf(keys[k]) !== -1) return i;
    }
  }
  return -1;
}

function readRoster_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return { students: [], problems: [], wishedCol: 1, size: 0 };
  }

  const headers = values[0];
  const nameCol = findColumn_(headers, CONFIG.NAME_KEYS);
  const emailCol = findColumn_(headers, CONFIG.EMAIL_KEYS);
  const dobCol = findColumn_(headers, CONFIG.DOB_KEYS);

  const missing = [];
  if (nameCol < 0) missing.push('name');
  if (emailCol < 0) missing.push('email');
  if (dobCol < 0) missing.push('date of birth');
  if (missing.length) {
    throw new Error('Could not find a column for: ' + missing.join(', ') +
                    '. Headings found: ' + headers.join(', '));
  }

  // The dedupe column is ours to create if it is not there yet.
  let wishedIndex = findColumn_(headers, [CONFIG.WISHED_COLUMN.toLowerCase()]);
  if (wishedIndex < 0) {
    wishedIndex = headers.length;
    sheet.getRange(1, wishedIndex + 1).setValue(CONFIG.WISHED_COLUMN);
  }

  const students = [];
  const problems = [];
  const seen = {};

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const rowNumber = r + 1;                    // 1-based, matching the sheet
    const name = String(row[nameCol] || '').trim();
    const email = String(row[emailCol] || '').trim().toLowerCase();
    const rawDob = row[dobCol];

    if (!name && !email && !rawDob) continue;   // blank line, not an error

    if (!name)  { problems.push({ row: rowNumber, reason: 'no name' }); continue; }
    if (!email) { problems.push({ row: rowNumber, reason: 'no email address' }); continue; }
    if (!/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(email)) {
      problems.push({ row: rowNumber, reason: 'invalid email: ' + email });
      continue;
    }

    const dob = parseDob_(rawDob);
    if (!dob) {
      problems.push({ row: rowNumber, reason: 'unreadable date of birth: ' + rawDob });
      continue;
    }

    // A student who submits the form twice should be wished once. Later rows
    // win, so a correction replaces the original.
    if (seen[email] !== undefined) students[seen[email]].superseded = true;
    seen[email] = students.length;

    const lastWished = row[wishedIndex];
    students.push({
      row: rowNumber,
      name: tidyName_(name),
      email: email,
      dob: dob,
      lastWished: lastWished instanceof Date
        ? Utilities.formatDate(lastWished, CONFIG.TIMEZONE, 'yyyy-MM-dd')
        : String(lastWished || '').trim()
    });
  }

  return {
    students: students.filter(function (s) { return !s.superseded; }),
    problems: problems,
    wishedCol: wishedIndex + 1,
    size: students.length
  };
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june',
                     'july', 'august', 'september', 'october', 'november', 'december'];

/** Today's date in CONFIG.TIMEZONE, as a Date at midnight.
 *
 *  Not "new Date()": the script may run on a server in another zone, and a
 *  midnight trigger would otherwise look up the wrong day's birthdays. */
function todayInZone_() {
  const parts = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd').split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

/** Best-effort parse of whatever a human (or a Form) put in the cell.
 *  Returns {month, day, year} or null - never a guess. */
function parseDob_(value) {
  if (value === null || value === undefined || value === '') return null;

  // A real date cell: Sheets already did the work.
  if (value instanceof Date && !isNaN(value.getTime())) {
    return { year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() };
  }

  const text = String(value).trim();
  if (!text) return null;

  // ISO first - unambiguous.
  let m = text.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (m) return valid_(Number(m[1]), Number(m[2]), Number(m[3]));

  // Numeric with separators. Day-first, because Indian forms overwhelmingly
  // write DD/MM/YYYY; month-first only when day-first is impossible.
  m = text.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2}|\d{4})$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    let y = Number(m[3]);
    if (m[3].length === 2) y += (y > 30 ? 1900 : 2000);
    return valid_(y, b, a) || valid_(y, a, b);
  }

  // "13 August 2004" / "13 Aug 2004"
  m = text.match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/);
  if (m) {
    const month = monthNumber_(m[2]);
    if (month) return valid_(Number(m[3]), month, Number(m[1]));
  }

  // "August 13, 2004"
  m = text.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const month = monthNumber_(m[1]);
    if (month) return valid_(Number(m[3]), month, Number(m[2]));
  }

  return null;
}

function monthNumber_(word) {
  const w = String(word).toLowerCase();
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    if (MONTH_NAMES[i] === w || MONTH_NAMES[i].substring(0, 3) === w.substring(0, 3)) {
      return i + 1;
    }
  }
  return 0;
}

function valid_(year, month, day) {
  if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= 31)) return null;
  if (year < 1900 || year > new Date().getFullYear()) return null;
  const probe = new Date(year, month - 1, day);
  if (probe.getMonth() !== month - 1 || probe.getDate() !== day) return null;
  return { year: year, month: month, day: day };
}

function isLeapYear_(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** Whether `dob` should be wished on `today`.
 *
 *  29 February people are wished on the 28th in non-leap years - otherwise
 *  they are skipped three years out of four and nobody notices for a decade. */
function isBirthday_(dob, today) {
  const month = today.getMonth() + 1;
  const day = today.getDate();

  if (dob.month === month && dob.day === day) return true;
  if (month === 2 && day === 28 && !isLeapYear_(today.getFullYear())
      && dob.month === 2 && dob.day === 29) return true;
  return false;
}

// ---------------------------------------------------------------------------
// The message. Ported from src/message.py - keep the two in step.
// ---------------------------------------------------------------------------

function tidyName_(name) {
  const trimmed = String(name).trim().replace(/\s+/g, ' ');
  if (trimmed === trimmed.toUpperCase() || trimmed === trimmed.toLowerCase()) {
    return trimmed.split(' ').map(function (part) {
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    }).join(' ');
  }
  return trimmed;
}

function firstName_(name) {
  const parts = String(name).trim().split(/\s+/);
  return parts[0] || name;
}

function escapeHtml_(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function subjectFor_(name) {
  return 'Happy Birthday, ' + firstName_(name) + '! 🎉';
}

function plainTextFor_(name) {
  return 'Happy Birthday, ' + firstName_(name) + '!\n\n' +
         'Wishing you a wonderful year ahead filled with good health, ' +
         'great friends and plenty of success.\n\n' +
         'Have a fantastic day!\n\n' +
         '— ' + CONFIG.FROM_NAME + '\n';
}

function htmlFor_(name) {
  const safeName = escapeHtml_(name);
  const safeFirst = escapeHtml_(firstName_(name));
  const from = escapeHtml_(CONFIG.FROM_NAME);

  // Table-based with inline styles and a solid colour under the gradient:
  // Outlook ignores gradients and most modern CSS, and degrades to flat
  // purple, which still looks deliberate. No images anywhere - many clients
  // block them, and a blocked image is a grey box instead of a greeting.
  return '' +
  '<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f4f5f7;' +
  'font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a;">' +
    '<div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;' +
    'overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">' +

      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
      'bgcolor="#3b2a72" style="background-color:#3b2a72;">' +
        '<tr><td align="center" style="padding:44px 24px;background-color:#3b2a72;' +
        'background-image:linear-gradient(135deg,#232860 0%,#92347a 100%);">' +
          '<div style="font-size:30px;line-height:1;margin-bottom:16px;">' +
            '&#127881; &#127874; &#127880;</div>' +
          '<div style="font-size:17px;letter-spacing:.22em;font-weight:600;' +
          'color:#ffd166;text-transform:uppercase;">Happy Birthday</div>' +
          '<div style="font-size:38px;line-height:1.2;font-weight:700;color:#ffffff;' +
          'padding-top:10px;">' + safeName + '</div>' +
        '</td></tr>' +
      '</table>' +

      '<div style="padding:28px 32px;">' +
        '<h1 style="margin:0 0 12px;font-size:24px;">Happy Birthday, ' + safeFirst + '! 🎉</h1>' +
        '<p style="margin:0 0 14px;font-size:16px;line-height:1.6;">' +
          'Wishing you a wonderful year ahead filled with good health, ' +
          'great friends and plenty of success.</p>' +
        '<p style="margin:0 0 24px;font-size:16px;line-height:1.6;">Have a fantastic day!</p>' +
        '<p style="margin:0;font-size:14px;color:#666;">— ' + from + '</p>' +
      '</div>' +
    '</div>' +
  '</body></html>';
}

// ---------------------------------------------------------------------------
// The run report, to you rather than to students
// ---------------------------------------------------------------------------

function sendReport_(occasion, results, table, sent, failed) {
  if (!CONFIG.REPORT_EMAIL) return;
  if (!CONFIG.REPORT_ALWAYS && sent === 0 && failed === 0 && table.problems.length === 0) return;

  const subject = failed ? '[Birthday bot] ' + occasion + ': ' + failed + ' FAILED, ' + sent + ' sent'
                : sent   ? '[Birthday bot] ' + occasion + ': ' + sent + ' wish(es) sent'
                         : '[Birthday bot] ' + occasion + ': no birthdays today';

  const lines = results.map(function (r) {
    return '  ' + r.status.toUpperCase() + '  ' + r.name + '  ' + r.detail;
  });
  if (!results.length) lines.push('  No birthdays today.');

  let warning = '';
  if (CONFIG.TEST_EMAIL) {
    warning += '<p style="margin:0 0 12px;padding:10px 14px;background:#fff4e5;' +
               'border-left:4px solid #f0932b;font-size:14px;">TEST_EMAIL is set - ' +
               'these went to ' + escapeHtml_(CONFIG.TEST_EMAIL) + ', not to students.</p>';
  }
  if (table.problems.length) {
    warning += '<p style="margin:0 0 12px;padding:10px 14px;background:#fdecea;' +
               'border-left:4px solid #c0392b;font-size:14px;">' + table.problems.length +
               ' row(s) skipped because of bad data. Those students will never be ' +
               'wished until it is fixed - run validateRoster for details.</p>';
  }

  const rows = results.map(function (r) {
    return '<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;">' +
           escapeHtml_(r.name) + '</td>' +
           '<td style="padding:6px 10px;border-bottom:1px solid #eee;color:#666;">' +
           escapeHtml_(r.detail) + '</td></tr>';
  }).join('');

  const html =
    '<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f4f5f7;' +
    'font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a;">' +
    '<div style="max-width:620px;margin:0 auto;background:#fff;border-radius:10px;' +
    'padding:24px 28px;box-shadow:0 1px 6px rgba(0,0,0,.08);">' +
      '<p style="margin:0;font-size:13px;color:#888;">' + occasion + '</p>' +
      '<h2 style="margin:4px 0 18px;font-size:20px;">' +
        (failed ? failed + ' message(s) failed'
                : sent ? sent + ' birthday wish(es) sent'
                       : 'No birthdays today - all good') + '</h2>' +
      warning +
      '<p style="margin:0;font-size:14px;color:#666;">' + table.students.length +
      ' students on the list.</p>' +
      (rows ? '<table style="border-collapse:collapse;width:100%;font-size:14px;' +
              'margin-top:16px;">' + rows + '</table>' : '') +
    '</div></body></html>';

  try {
    GmailApp.sendEmail(CONFIG.REPORT_EMAIL, subject,
      'Birthday bot - ' + occasion + '\n' + table.students.length +
      ' students on the list\n\n' + lines.join('\n') + '\n',
      { htmlBody: html, name: CONFIG.FROM_NAME });
  } catch (err) {
    // A broken report must never make a successful run look like a failure.
    Logger.log('Could not send the report: %s', err);
  }
}

// ---------------------------------------------------------------------------
// Self-checks. Run selfTest from the editor; it sends nothing.
// ---------------------------------------------------------------------------

function selfTest() {
  const failures = [];

  function check(label, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures.push(label + ' -> got ' + JSON.stringify(actual) +
                           ', expected ' + JSON.stringify(expected));
    Logger.log('%s %s', ok ? 'PASS' : 'FAIL', label);
  }

  // Day-first parsing: the ambiguous case must read as 13 August.
  check('"13/08/2004" is 13 August', parseDob_('13/08/2004'), { year: 2004, month: 8, day: 13 });
  // Day-first is impossible here, so it must fall back to month-first.
  check('"03/25/2004" falls back to 25 March', parseDob_('03/25/2004'), { year: 2004, month: 3, day: 25 });
  check('ISO "2004-08-13"', parseDob_('2004-08-13'), { year: 2004, month: 8, day: 13 });
  check('"13 August 2004"', parseDob_('13 August 2004'), { year: 2004, month: 8, day: 13 });
  check('"August 13, 2004"', parseDob_('August 13, 2004'), { year: 2004, month: 8, day: 13 });
  check('a real Date cell', parseDob_(new Date(2004, 7, 13)), { year: 2004, month: 8, day: 13 });
  check('nonsense is refused, not guessed', parseDob_('sometime in august'), null);
  check('impossible date refused', parseDob_('31/02/2004'), null);

  // Leap-day handling.
  const leapling = { year: 2004, month: 2, day: 29 };
  check('29 Feb wished on 28 Feb 2027 (non-leap)',
        isBirthday_(leapling, new Date(2027, 1, 28)), true);
  check('29 Feb NOT wished on 28 Feb 2028 (leap year)',
        isBirthday_(leapling, new Date(2028, 1, 28)), false);
  check('29 Feb wished on 29 Feb 2028',
        isBirthday_(leapling, new Date(2028, 1, 29)), true);

  // Ordinary matching ignores the year.
  check('13 Aug matches 13 Aug in any year',
        isBirthday_({ year: 2004, month: 8, day: 13 }, new Date(2026, 7, 13)), true);
  check('13 Aug does not match 14 Aug',
        isBirthday_({ year: 2004, month: 8, day: 13 }, new Date(2026, 7, 14)), false);

  // Name tidying. Only all-caps or all-lower names are recased; anything
  // mixed is left exactly as typed, which is what protects "McDonald".
  check('ALL CAPS tidied', tidyName_('PRAJWAL SHETE'), 'Prajwal Shete');
  check('all lower tidied', tidyName_('prajwal shete'), 'Prajwal Shete');
  check('MixedCase left alone', tidyName_('McDonald Smith'), 'McDonald Smith');
  check('extra spaces collapsed', tidyName_('  Asha   Kulkarni '), 'Asha Kulkarni');

  Logger.log(failures.length ? 'FAILURES:\n' + failures.join('\n') : 'All self-checks passed.');
  return failures;
}
