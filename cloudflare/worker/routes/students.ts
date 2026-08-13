import { Hono } from "hono";
import type { Env } from "../env";
import {
  addStudent,
  deleteStudent,
  importStudents,
  listStudents,
  updateStudent,
  ValidationError,
} from "../services/students";

const students = new Hono<{ Bindings: Env }>();

/** ValidationError is the operator's mistake (400); anything else is ours (500). */
function fail(err: unknown) {
  const status = err instanceof ValidationError ? 400 : 500;
  return { body: { error: (err as Error).message }, status } as const;
}

students.get("/", async (c) => c.json(await listStudents(c.env.DB)));

students.post("/", async (c) => {
  const { name, email, dob } = await c.req.json<Record<string, string>>();
  try {
    return c.json(await addStudent(c.env.DB, name, email, dob), 201);
  } catch (err) {
    const { body, status } = fail(err);
    return c.json(body, status);
  }
});

students.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const { name, email, dob } = await c.req.json<Record<string, string>>();
  try {
    return c.json(await updateStudent(c.env.DB, id, name, email, dob));
  } catch (err) {
    const { body, status } = fail(err);
    return c.json(body, status);
  }
});

students.delete("/:id", async (c) => {
  try {
    const name = await deleteStudent(c.env.DB, Number(c.req.param("id")));
    return c.json({ ok: true, name });
  } catch (err) {
    const { body, status } = fail(err);
    return c.json(body, status);
  }
});

/**
 * Bulk import. Accepts the CSV exported from the Python version, headers and
 * all, so the existing roster moves across without retyping.
 */
students.post("/import", async (c) => {
  const { csv } = await c.req.json<{ csv?: unknown }>();
  if (typeof csv !== "string" || !csv.trim()) {
    return c.json({ error: "Send the file contents as a JSON string in `csv`." }, 400);
  }

  const lines = csv.trim().split(/\r?\n/);
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());

  const find = (candidates: string[]) =>
    headers.findIndex((h) => candidates.some((c2) => h === c2)) !== -1
      ? headers.findIndex((h) => candidates.some((c2) => h === c2))
      : headers.findIndex((h) => candidates.some((c2) => h.includes(c2)));

  const nameAt = find(["full name", "student name", "your name", "name"]);
  const emailAt = find(["email address", "email", "e-mail", "mail"]);
  const dobAt = find(["date of birth", "birth date", "birthday", "dob"]);

  if (nameAt < 0 || emailAt < 0 || dobAt < 0) {
    return c.json(
      {
        error:
          "Could not find name, email and date-of-birth columns. " +
          `Headers seen: ${headers.join(", ")}`,
      },
      400,
    );
  }

  const rows = lines.slice(1).filter((line) => line.trim()).map((line) => {
    const cells = splitCsvLine(line);
    return {
      name: cells[nameAt] ?? "",
      email: cells[emailAt] ?? "",
      dob: cells[dobAt] ?? "",
    };
  });

  return c.json(await importStudents(c.env.DB, rows));
});

/** Minimal CSV splitter - handles quoted cells containing commas. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }
  out.push(cell);
  return out.map((c) => c.trim());
}

export default students;
