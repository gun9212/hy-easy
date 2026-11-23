// Daily usage on the admin page: new sign-ups and students who opened the app, one bar per KST day.
// Two separate single-series charts (never one chart with two scales). Each bar carries a hover/focus tooltip,
// and a table view lists the same numbers.

export type UsageDay = { day: string; signups: number; active: number };

function label(day: string): string {
  const [, m, d] = day.split("-");
  return `${Number(m)}.${Number(d)}`;
}

function BarChart({
  title,
  unit,
  days,
  value,
}: {
  title: string;
  unit: string;
  days: UsageDay[];
  value: (d: UsageDay) => number;
}) {
  const values = days.map(value);
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const latest = values.at(-1) ?? 0;
  return (
    <figure className="usage-chart">
      <figcaption>
        <span>{title}</span>
        <b>
          오늘 {latest}
          {unit}
        </b>
        <small>
          {days.length}일 합계 {total}
          {unit}
        </small>
      </figcaption>
      <div className="usage-plot" role="img" aria-label={`${title}, 최근 ${days.length}일, 최댓값 ${max}${unit}`}>
        <span className="usage-max">{max}</span>
        <div className="usage-bars">
          {days.map((d, i) => (
            <span
              key={d.day}
              className="usage-bar"
              tabIndex={0}
              aria-label={`${label(d.day)} ${values[i]}${unit}`}
              style={{ "--h": `${(values[i] / max) * 100}%` } as React.CSSProperties}
            >
              <span className="usage-tip" aria-hidden="true">
                {label(d.day)} · {values[i]}
                {unit}
              </span>
            </span>
          ))}
        </div>
        <div className="usage-axis" aria-hidden="true">
          <span>{label(days[0]?.day ?? "")}</span>
          <span>{label(days.at(-1)?.day ?? "")}</span>
        </div>
      </div>
    </figure>
  );
}

export function UsageCharts({ days }: { days: UsageDay[] }) {
  if (!days.length) return <p className="admin-empty">이용 기록이 없습니다.</p>;
  return (
    <>
      <div className="usage-charts">
        <BarChart title="일별 신규 가입" unit="명" days={days} value={d => d.signups} />
        <BarChart title="일별 접속 학생" unit="명" days={days} value={d => d.active} />
      </div>
      <details className="usage-table">
        <summary>표로 보기</summary>
        <table className="admin-table">
          <thead>
            <tr>
              <th>날짜</th>
              <th>신규 가입</th>
              <th>접속 학생</th>
            </tr>
          </thead>
          <tbody>
            {[...days].reverse().map(d => (
              <tr key={d.day}>
                <td>{d.day}</td>
                <td>{d.signups}</td>
                <td>{d.active}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}
