/** All D1 access for the roster. Nothing else writes to the students table. */

import type { Student } from "../../shared/types";
import { celebrantKeysFor, isEmail, parseDob, tidyName } from "../../shared/dates";

interface Row {
  id: number;
  name: string;
  email: string;
  dob: string;
  active: number;
}

const toStudent = (r: Row): Student => ({
  id: r.id,
  name: r.name,
  email: r.email,
  dob: r.dob,
  active: r.active === 1,
});

export class ValidationError extends Error {}

function validate(name: string, email: string, dob: string) {
  const cleanName = tidyName(name || "");
  const cleanEmail = (email || "").trim().toLowerCase();

  if (!cleanName) throw new ValidationError("A name is required.");
  if (!cleanEmail) throw new ValidationError("An email address is required.");
  if (!isEmail(cleanEmail)) throw new ValidationError(`"${cleanEmail}" is not a valid email address.`);

  const parsed = parseDob(dob);
  if (!parsed) throw new ValidationError(`Could not read "${dob}" as a date of birth.`);

  return { cleanName, cleanEmail, parsed };
}

export async function listStudents(db: D1Database): Promise<Student[]> {
  const { results } = await db
    .prepare("SELECT id, name, email, dob, active FROM students ORDER BY name COLLATE NOCASE")
    .all<Row>();
  return (results ?? []).map(toStudent);
}

export async function countStudents(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM students WHERE active = 1")
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function addStudent(
  db: D1Database,
  name: string,
  email: string,
  dob: string,
): Promise<Student> {
  const { cleanName, cleanEmail, parsed } = validate(name, email, dob);

  const existing = await db
    .prepare("SELECT id FROM students WHERE email = ?")
    .bind(cleanEmail)
    .first();
  if (existing) throw new ValidationError(`${cleanEmail} is already on the list.`);

  const row = await db
    .prepare(
      `INSERT INTO students (name, email, dob, birth_month, birth_day)
       VALUES (?, ?, ?, ?, ?)
       RETURNING id, name, email, dob, active`,
    )
    .bind(cleanName, cleanEmail, parsed.iso, parsed.month, parsed.day)
    .first<Row>();

  return toStudent(row!);
}

export async function updateStudent(
  db: D1Database,
  id: number,
  name: string,
  email: string,
  dob: string,
): Promise<Student> {
  const { cleanName, cleanEmail, parsed } = validate(name, email, dob);

  const clash = await db
    .prepare("SELECT id FROM students WHERE email = ? AND id != ?")
    .bind(cleanEmail, id)
    .first();
  if (clash) throw new ValidationError(`${cleanEmail} belongs to another student.`);

  const row = await db
    .prepare(
      `UPDATE students
          SET name = ?, email = ?, dob = ?, birth_month = ?, birth_day = ?,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
       RETURNING id, name, email, dob, active`,
    )
    .bind(cleanName, cleanEmail, parsed.iso, parsed.month, parsed.day, id)
    .first<Row>();

  if (!row) throw new ValidationError("That student no longer exists.");
  return toStudent(row);
}

export async function deleteStudent(db: D1Database, id: number): Promise<string> {
  const row = await db
    .prepare("DELETE FROM students WHERE id = ? RETURNING name")
    .bind(id)
    .first<{ name: string }>();
  if (!row) throw new ValidationError("That student no longer exists.");
  return row.name;
}

/** Whose birthday falls on `date`, including the 29 February rule. */
export async function celebrantsOn(db: D1Database, date: Date): Promise<Student[]> {
  const keys = celebrantKeysFor(date);
  const where = keys.map(() => "(birth_month = ? AND birth_day = ?)").join(" OR ");
  const binds = keys.flatMap((k) => [k.month, k.day]);

  const { results } = await db
    .prepare(
      `SELECT id, name, email, dob, active FROM students
        WHERE active = 1 AND (${where})
        ORDER BY name COLLATE NOCASE`,
    )
    .bind(...binds)
    .all<Row>();

  return (results ?? []).map(toStudent);
}

/** The next birthdays after today, for the dashboard. */
export async function upcoming(
  db: D1Database,
  from: Date,
  days = 60,
  limit = 8,
): Promise<Array<{ name: string; date: string; days: number }>> {
  const out: Array<{ name: string; date: string; days: number }> = [];

  for (let offset = 1; offset <= days && out.length < limit; offset++) {
    const day = new Date(from.getTime() + offset * 86400000);
    for (const s of await celebrantsOn(db, day)) {
      if (out.length >= limit) break;
      out.push({
        name: s.name,
        date: day.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          timeZone: "UTC",
        }),
        days: offset,
      });
    }
  }
  return out;
}

/** Bulk import, used by the CSV migration from the Python version. */
export async function importStudents(
  db: D1Database,
  rows: Array<{ name: string; email: string; dob: string }>,
): Promise<{ added: number; skipped: Array<{ row: number; reason: string }> }> {
  const skipped: Array<{ row: number; reason: string }> = [];
  const statements: D1PreparedStatement[] = [];
  const seen = new Set<string>();

  rows.forEach((raw, i) => {
    try {
      const { cleanName, cleanEmail, parsed } = validate(raw.name, raw.email, raw.dob);
      if (seen.has(cleanEmail)) {
        skipped.push({ row: i + 1, reason: `duplicate of an earlier row: ${cleanEmail}` });
        return;
      }
      seen.add(cleanEmail);
      statements.push(
        db
          .prepare(
            `INSERT INTO students (name, email, dob, birth_month, birth_day)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(email) DO UPDATE SET
               name = excluded.name, dob = excluded.dob,
               birth_month = excluded.birth_month, birth_day = excluded.birth_day,
               updated_at = CURRENT_TIMESTAMP`,
          )
          .bind(cleanName, cleanEmail, parsed.iso, parsed.month, parsed.day),
      );
    } catch (err) {
      skipped.push({ row: i + 1, reason: (err as Error).message });
    }
  });

  if (statements.length) await db.batch(statements);
  return { added: statements.length, skipped };
}
