import { useState } from "react";
import { api, isQueued, type Queued } from "../api/client";
import type { RunResult } from "../../../shared/types";

function describe(result: RunResult | Queued): string {
  if (isQueued(result)) {
    return `${result.message}\n\nWatch it run: ${result.actionsUrl}`;
  }
  const head = `${result.date}: ${result.entries.length} birthday(s).` +
    (result.dryRun ? "  DRY RUN - nothing sent." : "");
  const lines = result.entries.map(
    (e) => `  ${e.status.padEnd(8)} ${e.name} -> ${e.detail}`,
  );
  const tail = `\nsent=${result.sent} skipped=${result.skipped} failed=${result.failed}`;
  return [head, ...lines, tail].join("\n");
}

export default function ActionsPanel({ onChanged }: { onChanged: () => void }) {
  const [output, setOutput] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [busy, setBusy] = useState(false);

  async function guard(work: () => Promise<string>) {
    setBusy(true);
    setPreviewing(false);
    setOutput("Working…");
    try {
      setOutput(await work());
    } catch (err) {
      setOutput(`Failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  const testRun = () => {
    const date = window.prompt(
      "Pretend it is which date? (YYYY-MM-DD, or blank for today)",
      "",
    );
    if (date === null) return;
    void guard(async () =>
      describe(await api.run({ date: date.trim() || undefined, dryRun: true })),
    );
  };

  const sendToday = () => {
    if (
      !window.confirm(
        "Send real birthday emails now to everyone with a birthday today?\n\n" +
          "This runs on GitHub Actions and cannot be undone.",
      )
    )
      return;
    void guard(async () => describe(await api.run({ dryRun: false })));
  };

  const checkEmail = () =>
    void guard(async () => (await api.checkEmail()).message);

  async function preview() {
    const name = window.prompt("Whose name should the greeting show?", "Student Name");
    if (name === null) return;
    setBusy(true);
    setOutput("");
    try {
      const res = await fetch(api.previewUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
        credentials: "same-origin",
      });
      setPreviewHtml(await res.text());
      setPreviewing(true);
    } catch (err) {
      setOutput(`Failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h2>Actions</h2>
      <div className="row">
        <button onClick={checkEmail} disabled={busy}>
          Check email setup
        </button>
        <button onClick={testRun} disabled={busy}>
          Test run
        </button>
        <button onClick={preview} disabled={busy}>
          Preview greeting
        </button>
        <button className="primary" onClick={sendToday} disabled={busy}>
          Send today's wishes
        </button>
      </div>

      {output && <pre className="out">{output}</pre>}
      {previewing && (
        <iframe className="preview" title="greeting preview" srcDoc={previewHtml} />
      )}
    </div>
  );
}
