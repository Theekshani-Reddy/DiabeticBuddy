import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import GlucoseChart from './GlucoseChart.jsx';

test('shows the empty state without plotting zero readings', () => {
  render(<GlucoseChart readings={[]} startDate="2026-11-01" endDate="2026-11-07" />);
  expect(screen.getByText('No readings in this period.')).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

test('plots individual slot readings and exposes sorted exact values with missing slots left blank', async () => {
  render(<GlucoseChart startDate="2026-10-01" endDate="2026-10-31" readings={[
    { date: '2026-10-31', slot: 'morning', value: 123 },
    { date: '2026-10-01', slot: 'after_lunch', value: 157 },
    { date: '2026-10-01', slot: 'morning', value: 101 },
  ]} />);
  const chart = screen.getByRole('img', { name: 'Glucose trend mg/dl' });
  expect(chart).toHaveAccessibleDescription(/missing readings are not plotted/);
  expect(within(chart).getByText('1 Oct · Morning (fasting): 101 mg/dl')).toBeInTheDocument();
  expect(within(chart).getByText('1 Oct · After lunch: 157 mg/dl')).toBeInTheDocument();
  expect(within(chart).getByText('31 Oct · Morning (fasting): 123 mg/dl')).toBeInTheDocument();
  expect(chart.querySelectorAll('circle')).toHaveLength(3);
  await userEvent.setup().click(screen.getByText('View chart data'));
  const rows = within(screen.getByRole('table')).getAllByRole('row');
  expect(rows).toHaveLength(3);
  expect(rows[1]).toHaveTextContent('1 Oct');
  expect(within(rows[1]).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['101', '—', '157', '—']);
  expect(rows[2]).toHaveTextContent('31 Oct');
});

test('single-day reports and boundary values render visible points without invalid coordinates', () => {
  const view = render(<GlucoseChart startDate="2026-11-01" endDate="2026-11-01"
    readings={[{ date: '2026-11-01', slot: 'morning', value: 600 }]} />);
  let chart = screen.getByRole('img');
  expect(within(chart).getByText('1 Nov · Morning (fasting): 600 mg/dl')).toBeInTheDocument();
  expect(chart.innerHTML).not.toMatch(/NaN|Infinity/);
  view.rerender(<GlucoseChart startDate="2026-11-01" endDate="2026-11-01"
    readings={[{ date: '2026-11-01', slot: 'morning', value: 40 }]} />);
  chart = screen.getByRole('img');
  expect(within(chart).getByText('1 Nov · Morning (fasting): 40 mg/dl')).toBeInTheDocument();
  expect(chart.innerHTML).not.toMatch(/NaN|Infinity/);
});

test('uses calendar positions across a leap-year month and clears old data on range changes', () => {
  const view = render(<GlucoseChart startDate="2024-02-01" endDate="2024-02-29" readings={[
    { date: '2024-02-01', slot: 'morning', value: 100 },
    { date: '2024-02-15', slot: 'morning', value: 110 },
    { date: '2024-02-29', slot: 'morning', value: 120 },
  ]} />);
  const points = [...screen.getByRole('img').querySelectorAll('circle')];
  expect(Number(points[1].getAttribute('cx'))).toBeCloseTo((Number(points[0].getAttribute('cx')) + Number(points[2].getAttribute('cx'))) / 2);
  view.rerender(<GlucoseChart startDate="2024-03-01" endDate="2024-03-31" readings={[
    { date: '2024-03-01', slot: 'after_dinner', value: 130 },
  ]} />);
  expect(screen.queryByText(/Feb/)).not.toBeInTheDocument();
  expect(screen.getByText('1 Mar · After dinner: 130 mg/dl')).toBeInTheDocument();
});
