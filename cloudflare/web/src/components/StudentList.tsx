import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Student } from "../../../shared/types";

interface Props {
  students: Student[];
  onChanged: () => void;
  onMessage: (text: string, isError?: boolean) => void;
}

export default function StudentList({ students, onChanged, onMessage }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const created = await api.addStudent(name, email, dob);
      onMessage(`Added ${created.name}.`);
      setName("");
      setEmail("");
      setDob("");
      onChanged();
    } catch (err) {
      onMessage((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  async function importCsv(file: File) {
    setBusy(true);
    try {
      const result = await api.importCsv(await file.text());
      const skipped = result.skipped.length
        ? ` ${result.skipped.length} row(s) skipped: ` +
          result.skipped.map((s) => `row ${s.row} (${s.reason})`).join("; ")
        : "";
      onMessage(`Imported ${result.added} student(s).${skipped}`, result.skipped.length > 0);
      onChanged();
    } catch (err) {
      onMessage((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h2>Students · {students.length}</h2>

      <form onSubmit={add}>
        <div className="listbar">
          <div>
            <label>Full name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Asha Kulkarni"
              required
            />
          </div>
          <div>
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="asha@gcoerc.edu"
              required
            />
          </div>
          <div style={{ flex: "0 1 170px" }}>
            <label>Date of birth</label>
            <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
          </div>
          <div style={{ flex: "0 0 auto" }}>
            <button className="primary" type="submit" disabled={busy}>
              Add
            </button>
          </div>
        </div>
      </form>

      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th style={{ width: "30%" }}>Name</th>
              <th style={{ width: "34%" }}>Email</th>
              <th style={{ width: "22%" }}>Birthday</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty">
                  Nobody on the list yet.
                </td>
              </tr>
            ) : (
              students.map((s) => (
                <StudentRow key={s.id} student={s} onChanged={onChanged} onMessage={onMessage} />
              ))
            )}
          </tbody>
        </table>
      </div>

      <details>
        <summary>Import from a CSV</summary>
        <p className="hint" style={{ marginTop: 12 }}>
          Takes the file exported from the old Python version, or any CSV with name,
          email and date-of-birth columns. Existing students are updated, not duplicated.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          style={{ marginTop: 10, background: "transparent", boxShadow: "none", border: 0, padding: 0 }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importCsv(file);
            e.target.value = "";
          }}
        />
      </details>
    </div>
  );
}

function StudentRow({
  student,
  onChanged,
  onMessage,
}: {
  student: Student;
  onChanged: () => void;
  onMessage: (text: string, isError?: boolean) => void;
}) {
  const [name, setName] = useState(student.name);
  const [email, setEmail] = useState(student.email);
  const [dob, setDob] = useState(student.dob);
  const [busy, setBusy] = useState(false);

  const dirty = name !== student.name || email !== student.email || dob !== student.dob;

  async function save() {
    setBusy(true);
    try {
      await api.updateStudent(student.id, name, email, dob);
      onMessage("Saved.");
      onChanged();
    } catch (err) {
      onMessage((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${student.name} from the list?`)) return;
    setBusy(true);
    try {
      const { name: removed } = await api.deleteStudent(student.id);
      onMessage(`Removed ${removed}.`);
      onChanged();
    } catch (err) {
      onMessage((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </td>
      <td>
        <input value={email} onChange={(e) => setEmail(e.target.value)} />
      </td>
      <td>
        <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
      </td>
      <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
        <button className="tiny" onClick={save} disabled={busy || !dirty}>
          Save
        </button>{" "}
        <button className="tiny ghost" onClick={remove} disabled={busy}>
          Delete
        </button>
      </td>
    </tr>
  );
}
