import { useEffect, useId, useRef, useState } from 'react';
import { slots } from '../lib/readings.js';

const colors = ['#b87943', '#987d26', '#4b805d', '#6a5796'];
const dashes = [undefined, '7 4', '2 4', '8 3 2 3'];
const dateLabel = (date) => new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', timeZone: 'UTC',
}).format(new Date(`${date}T00:00:00Z`));

function tickStep(span) {
  const target = Math.max(span, 40) / 3;
  const power = 10 ** Math.floor(Math.log10(target));
  return [1, 2, 5, 10].find((step) => step * power >= target) * power;
}

export default function GlucoseChart({ readings = [], startDate, endDate }) {
  const id = useId();
  const container = useRef(null);
  const [width, setWidth] = useState(600);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined' || !container.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(entry.contentRect.width);
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  if (readings.length === 0) return <p className="readings-empty">No readings in this period.</p>;

  const byDate = new Map();
  for (const reading of readings) {
    if (!byDate.has(reading.date)) byDate.set(reading.date, {});
    byDate.get(reading.date)[reading.slot] = reading.value;
  }
  const dates = [...byDate.keys()].sort();
  const values = readings.map(({ value }) => value);
  const step = tickStep(Math.max(...values) - Math.min(...values));
  const min = Math.max(0, Math.floor((Math.min(...values) - 10) / step) * step);
  const max = Math.min(600, Math.ceil((Math.max(...values) + 10) / step) * step);
  const yTicks = [];
  for (let value = min; value <= max; value += step) yTicks.push(value);

  const startDay = Number(startDate.slice(8));
  const endDay = Number(endDate.slice(8));
  const xTicks = [...new Set([startDay, Math.round((startDay + endDay) / 2), endDay])];
  const left = 35;
  const right = width - 12;
  const top = 15;
  const bottom = 190;
  const x = (day) => endDay === startDay ? (left + right) / 2 : left + (day - startDay) / (endDay - startDay) * (right - left);
  const y = (value) => bottom - (value - min) / (max - min) * (bottom - top);

  return (
    <figure className="glucose-chart">
      <figcaption id={`${id}-title`}>Glucose trend <span>mg/dl</span></figcaption>
      <div ref={container} className="chart-plot">
        <svg viewBox={`0 0 ${width} 225`} role="img" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
          <desc id={`${id}-description`}>Readings by date and time slot, {dateLabel(startDate)} to {dateLabel(endDate)}.
            Lines connect recorded readings; missing readings are not plotted. Exact values are available in View chart data.</desc>
          {yTicks.map((value) => <g key={value}>
            <line className="chart-grid" x1={left} x2={right} y1={y(value)} y2={y(value)} />
            <text className="chart-axis" x={left - 8} y={y(value) + 4} textAnchor="end">{value}</text>
          </g>)}
          {xTicks.map((day) => <text key={day} className="chart-axis" x={x(day)} y={bottom + 23} textAnchor="middle">{day}</text>)}
          {slots.map((slot, index) => {
            const points = dates.filter((date) => byDate.get(date)[slot.value] !== undefined)
              .map((date) => ({ date, value: byDate.get(date)[slot.value] }));
            return <g key={slot.value}>
              <path d={points.map((point, pointIndex) => `${pointIndex ? 'L' : 'M'} ${x(Number(point.date.slice(8)))} ${y(point.value)}`).join(' ')}
                fill="none" stroke={colors[index]} strokeWidth="2" strokeDasharray={dashes[index]} />
              {points.map((point) => <circle key={point.date} cx={x(Number(point.date.slice(8)))} cy={y(point.value)}
                r="3.5" fill={colors[index]} stroke="#fff" strokeWidth="1">
                <title>{dateLabel(point.date)} · {slot.label}: {point.value} mg/dl</title>
              </circle>)}
            </g>;
          })}
        </svg>
      </div>
      <p className="chart-axis-label">Day of month</p>
      <ul className="chart-legend" aria-label="Time slots">
        {slots.map((slot, index) => <li key={slot.value}>
          <svg viewBox="0 0 24 8" aria-hidden="true"><line x1="0" x2="24" y1="4" y2="4" stroke={colors[index]} strokeWidth="2" strokeDasharray={dashes[index]} /></svg>
          {slot.label}
        </li>)}
      </ul>
      <details className="chart-data">
        <summary>View chart data</summary>
        <div className="chart-table-scroll" role="region" aria-label="Chart readings" tabIndex={0}>
          <table>
            <caption className="sr-only">Glucose readings in mg/dl</caption>
            <thead><tr><th scope="col">Date</th>{slots.map((slot) => <th scope="col" key={slot.value}>{slot.label}</th>)}</tr></thead>
            <tbody>{dates.map((date) => <tr key={date}>
              <th scope="row"><time dateTime={date}>{dateLabel(date)}</time></th>
              {slots.map((slot) => <td key={slot.value}>{byDate.get(date)[slot.value] ?? '—'}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
