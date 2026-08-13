import type { Overview } from "../../../shared/types";

export default function Upcoming({ overview }: { overview: Overview | null }) {
  const today = overview?.today ?? [];
  const next = overview?.upcoming ?? [];

  return (
    <div className="panel">
      <h2>Coming up</h2>

      {today.length === 0 && next.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>
          No birthdays in the next 60 days.
        </p>
      ) : (
        <>
          {today.map((s) => (
            <div className="up" key={`t-${s.id}`}>
              <span className="now">{s.name}</span>
              <span className="when">Today</span>
            </div>
          ))}
          {next.map((u, i) => (
            <div className="up" key={`u-${i}`}>
              <span>{u.name}</span>
              <span className="when">
                {u.date} · {u.days}d
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
