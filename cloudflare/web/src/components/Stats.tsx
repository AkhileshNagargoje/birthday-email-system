import type { Overview } from "../../../shared/types";

export default function Stats({ overview }: { overview: Overview | null }) {
  const lastSent = overview?.lastRun
    ? overview.lastRun.when.replace("T", " ").slice(0, 16)
    : "Never";

  return (
    <div className="stats">
      <div className="stat">
        <div className="n">{overview?.total ?? "—"}</div>
        <div className="l">Students</div>
      </div>
      <div className="stat">
        <div className="n">{overview?.todayCount ?? "—"}</div>
        <div className="l">Birthdays today</div>
      </div>
      <div className="stat">
        <div className={`n${overview?.testMode ? " flag" : ""}`} style={{ fontSize: 16, paddingTop: 7 }}>
          {overview?.testMode ? "Test" : "Live"}
        </div>
        <div className="l">Mode</div>
      </div>
      <div className="stat">
        <div className="n sm">{lastSent}</div>
        <div className="l">Last sent</div>
      </div>
    </div>
  );
}
