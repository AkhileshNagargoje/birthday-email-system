import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api/client";
import type { Overview, Student } from "../../shared/types";
import Login from "./components/Login";
import Stats from "./components/Stats";
import ActionsPanel from "./components/ActionsPanel";
import Upcoming from "./components/Upcoming";
import StudentList from "./components/StudentList";
import WishAnyone from "./components/WishAnyone";

type Session = "checking" | "out" | "in" | "unconfigured";

export default function App() {
  const [session, setSession] = useState<Session>("checking");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [notice, setNotice] = useState<{ text: string; isError: boolean } | null>(null);

  const checkSession = useCallback(async () => {
    try {
      const me = await api.me();
      if (!me.configured) setSession("unconfigured");
      else setSession(me.signedIn ? "in" : "out");
    } catch {
      setSession("out");
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [o, s] = await Promise.all([api.overview(), api.students()]);
      setOverview(o);
      setStudents(s);
    } catch (err) {
      // An expired cookie should return you to the login screen, not to an
      // error message you cannot act on.
      if (err instanceof ApiError && err.status === 401) setSession("out");
      else setNotice({ text: (err as Error).message, isError: true });
    }
  }, []);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (session === "in") void refresh();
  }, [session, refresh]);

  const message = useCallback((text: string, isError = false) => {
    setNotice({ text, isError });
    if (!isError) window.setTimeout(() => setNotice(null), 4000);
  }, []);

  if (session === "checking") {
    return <p className="center-note">Loading…</p>;
  }

  if (session === "unconfigured") {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Not set up yet</h1>
          <p className="sub">This dashboard has no login configured.</p>
          <pre className="out" style={{ margin: 0 }}>
            {`wrangler secret put DASH_USER
wrangler secret put DASH_PASS
wrangler secret put SESSION_SECRET`}
          </pre>
        </div>
      </div>
    );
  }

  if (session === "out") {
    return <Login onSignedIn={() => setSession("in")} />;
  }

  return (
    <>
      <header>
        <div className="head-in">
          <div className="brand">
            Birthday Email System <span>· {overview?.appName ?? ""}</span>
          </div>
          <div className="head-right">
            <span className="pill">{overview?.provider ?? "…"}</span>
            <button
              className="ghost"
              onClick={async () => {
                await api.logout();
                setSession("out");
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="wrap">
        {notice && (
          <div className={`banner${notice.isError ? " loud" : ""}`}>
            {notice.isError && <strong>Problem. </strong>}
            {notice.text}
          </div>
        )}

        {overview?.testMode ? (
          <div className="banner loud">
            <strong>Test mode.</strong> Every scheduled greeting goes to{" "}
            {overview.testEmail}, not to students. Clear the TEST_EMAIL variable in
            wrangler.jsonc to go live.
          </div>
        ) : (
          <div className="banner">
            <strong>Live.</strong> Scheduled greetings go to real recipients.
          </div>
        )}

        <Stats overview={overview} />

        <div className="split" style={{ marginBottom: 20 }}>
          <ActionsPanel onChanged={refresh} />
          <Upcoming overview={overview} />
        </div>

        <StudentList students={students} onChanged={refresh} onMessage={message} />
        <WishAnyone />
      </div>
    </>
  );
}
