import { useState } from "react";
import { api } from "../api/client";

export default function WishAnyone() {
  const [emails, setEmails] = useState("");
  const [names, setNames] = useState("");
  const [note, setNote] = useState("");
  const [output, setOutput] = useState("");
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(dryRun: boolean) {
    if (!emails.trim()) {
      setOutput("Type an email address first.");
      return;
    }

    if (!dryRun) {
      const count = emails.split(",").filter((e) => e.trim()).length;
      if (
        !window.confirm(
          `Send a birthday email now to ${count} recipient(s)?\n\n${emails}\n\n` +
            "This cannot be undone.",
        )
      ) {
        setOutput("Cancelled. Nothing was sent.");
        return;
      }
    }

    setBusy(true);
    setPreview("");
    setOutput("Working…");

    try {
      const result = await api.wish({ emails, names, note, dryRun });
      setOutput(
        result.entries
          .map((e) => `  ${e.status.padEnd(8)} ${e.name} -> ${e.detail}`)
          .join("\n") + `\n\nsent=${result.sent} failed=${result.failed}`,
      );

      if (dryRun) {
        const who =
          names.split(",")[0]?.trim() ||
          emails.split(",")[0].trim().split("@")[0].replace(/[._]/g, " ");
        const res = await fetch(api.previewUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: who }),
          credentials: "same-origin",
        });
        setPreview(await res.text());
      }
    } catch (err) {
      setOutput(`Failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h2>Wish anyone</h2>
      <p className="lede">
        Send a greeting to any address right now, whether or not they are on the list
        and whatever today's date is.
      </p>

      <div className="fields">
        <div>
          <label>Email address</label>
          <input
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="friend@example.com"
          />
          <p className="hint">Several at once? Separate with commas.</p>
        </div>
        <div>
          <label>Name to show</label>
          <input
            value={names}
            onChange={(e) => setNames(e.target.value)}
            placeholder="blank = guessed from the address"
          />
          <p className="hint">One name per address, same order.</p>
        </div>
      </div>

      <div style={{ marginTop: 15 }}>
        <label>Your own message</label>
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Leave blank for the standard birthday wording."
        />
      </div>

      <div className="row" style={{ marginTop: 15 }}>
        <button onClick={() => submit(true)} disabled={busy}>
          Preview
        </button>
        <button className="primary" onClick={() => submit(false)} disabled={busy}>
          Send now
        </button>
      </div>

      <p className="note-line">
        The test-address safety net does not apply here — you named the recipient, so
        this reaches them.
      </p>

      {output && <pre className="out">{output}</pre>}
      {preview && <iframe className="preview" title="greeting preview" srcDoc={preview} />}
    </div>
  );
}
