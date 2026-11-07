import { useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import Reports from './Reports.jsx';

const today = '2026-11-06';
const samples = (date, values) => values.map((value, index) => ({ date, slot: ['morning', 'after_breakfast', 'after_lunch', 'after_dinner'][index], value }));
const daily = { type: 'daily', date: today, startDate: today, endDate: today, highest: 148, lowest: 112, average: 134, count: 3 };
const mtd = { type: 'mtd', date: today, startDate: '2026-11-01', endDate: today, highest: 220, lowest: 90, average: 165.3, count: 12,
  readings: [...samples('2026-11-01', [90, 220, 180, 170]), ...samples('2026-11-02', [160, 170, 175, 180]), ...samples(today, [112, 180, 175, 172])] };
const monthly = { type: 'monthly', date: today, startDate: '2026-10-01', endDate: '2026-10-31', highest: 200, lowest: 100, average: 150, count: 6,
  readings: [...samples('2026-10-01', [100, 200, 150, 150]), ...samples('2026-10-31', [150, 150])] };
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const ignore = () => {};

function Harness({ date = today, report = daily, initialType = 'daily', revision = 0, expired = ignore, disabled = false }) {
  const [type, setType] = useState(initialType);
  return <Reports date={date} today={today} token="test-token" type={type} onTypeChange={setType}
    dailyReport={report} dailyLoading={false} dailyError="" onRetryDaily={ignore} revision={revision}
    onSessionExpired={expired} disabled={disabled}><p>Daily reading list</p></Reports>;
}

test('formats the API average to one decimal and shows highest, lowest, count, and range', () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  render(<Harness />);
  expect(screen.getByRole('heading', { name: 'Reports', exact: true })).toBeInTheDocument();
  expect(screen.getByText('134.0')).toBeInTheDocument();
  expect(screen.getByText('Highest').parentElement).toHaveTextContent('148');
  expect(screen.getByText('Lowest').parentElement).toHaveTextContent('112');
  expect(screen.getByText('3 readings')).toBeInTheDocument();
  expect(screen.getByText('6 Nov 2026')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByText('Daily reading list')).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

test('loads month-to-date and previous-month reports and shows the reading list only on daily', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(reply(mtd)).mockResolvedValueOnce(reply(monthly));
  vi.stubGlobal('fetch', fetchMock);
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('tab', { name: 'This month' }));
  expect(await screen.findByText('165.3')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Glucose trend mg/dl' })).toBeInTheDocument();
  expect(screen.getByText('6 Nov · Morning (fasting): 112 mg/dl')).toBeInTheDocument();
  expect(screen.getByText('1 Nov 2026 – 6 Nov 2026')).toBeInTheDocument();
  expect(screen.queryByText('Daily reading list')).not.toBeInTheDocument();
  expect(fetchMock.mock.calls[0][0]).toBe(`/api/reports/mtd?date=${today}`);
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token');
  await user.click(screen.getByRole('tab', { name: 'Last month' }));
  expect(await screen.findByText('150.0')).toBeInTheDocument();
  expect(screen.getByText('1 Oct · Morning (fasting): 100 mg/dl')).toBeInTheDocument();
  expect(screen.queryByText('6 Nov · Morning (fasting): 112 mg/dl')).not.toBeInTheDocument();
  expect(screen.getByText('1 Oct 2026 – 31 Oct 2026')).toBeInTheDocument();
  expect(fetchMock.mock.calls[1][0]).toBe(`/api/reports/monthly?date=${today}`);
  await user.click(screen.getByRole('tab', { name: 'Today' }));
  expect(screen.getByText('134.0')).toBeInTheDocument();
  expect(screen.getByText('Daily reading list')).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('empty daily and month reports show clear empty states without a false zero average', async () => {
  const empty = { ...daily, readings: [], count: 0, average: null, highest: null, lowest: null };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ ...mtd, ...empty, startDate: mtd.startDate })));
  const user = userEvent.setup();
  render(<Harness report={empty} />);
  expect(screen.getByText('No readings for this date.')).toBeInTheDocument();
  expect(screen.getByText('0 readings')).toBeInTheDocument();
  expect(screen.queryByText('0.0')).not.toBeInTheDocument();
  expect(screen.queryByText('Highest')).not.toBeInTheDocument();
  await user.click(screen.getByRole('tab', { name: 'This month' }));
  expect(await screen.findByText('No readings in this period.')).toBeInTheDocument();
  expect(screen.queryByText('Daily reading list')).not.toBeInTheDocument();
});

test('shows a request error without stale statistics and supports retry', async () => {
  const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Offline')).mockResolvedValueOnce(reply(mtd));
  vi.stubGlobal('fetch', fetchMock);
  const expired = vi.fn();
  const user = userEvent.setup();
  render(<Harness expired={expired} />);
  await user.click(screen.getByRole('tab', { name: 'This month' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t connect.');
  expect(screen.queryByText('134.0')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Retry report' }));
  expect(await screen.findByText('165.3')).toBeInTheDocument();
  expect(expired).not.toHaveBeenCalled();
});

test('ignores a late response after the user switches to another report', async () => {
  let finishMonthToDate;
  const fetchMock = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finishMonthToDate = resolve; }))
    .mockResolvedValueOnce(reply(monthly));
  vi.stubGlobal('fetch', fetchMock);
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('tab', { name: 'This month' }));
  expect(screen.getByText('Loading report…')).toBeInTheDocument();
  await user.click(screen.getByRole('tab', { name: 'Last month' }));
  expect(await screen.findByText('150.0')).toBeInTheDocument();
  await act(async () => finishMonthToDate(reply(mtd)));
  expect(screen.queryByText('165.3')).not.toBeInTheDocument();
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
});

test('refreshes the active month report and chart after reading data changes', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(reply(mtd)).mockResolvedValueOnce(reply({ ...mtd, average: 170.5, count: 13,
    readings: [...mtd.readings.map((reading) => reading.date === today && reading.slot === 'morning' ? { ...reading, value: 180 } : reading),
      ...samples('2026-11-03', [164])] }));
  vi.stubGlobal('fetch', fetchMock);
  const view = render(<Harness initialType="mtd" />);
  expect(await screen.findByText('165.3')).toBeInTheDocument();
  view.rerender(<Harness initialType="mtd" revision={1} />);
  expect(await screen.findByText('170.5')).toBeInTheDocument();
  expect(screen.getByText('6 Nov · Morning (fasting): 180 mg/dl')).toBeInTheDocument();
  expect(screen.queryByText('6 Nov · Morning (fasting): 112 mg/dl')).not.toBeInTheDocument();
  expect(screen.getByText('13 readings')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'This month' })).toHaveAttribute('aria-selected', 'true');
});

test('preserves report selection and uses accurate labels/ranges for a historical selected date', async () => {
  const previous = { ...monthly, date: '2026-10-15', startDate: '2026-09-01', endDate: '2026-09-30', average: 135.2,
    readings: monthly.readings.map((reading) => ({ ...reading, date: reading.date.endsWith('31') ? '2026-09-30' : '2026-09-01' })) };
  const fetchMock = vi.fn().mockResolvedValueOnce(reply(monthly)).mockResolvedValueOnce(reply(previous));
  vi.stubGlobal('fetch', fetchMock);
  const view = render(<Harness initialType="monthly" />);
  expect(await screen.findByText('150.0')).toBeInTheDocument();
  view.rerender(<Harness initialType="monthly" date="2026-10-15" />);
  expect(await screen.findByText('135.2')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Previous month' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tab', { name: 'Month to date' })).toBeInTheDocument();
  expect(screen.getByText('1 Sept 2026 – 30 Sept 2026')).toBeInTheDocument();
  expect(fetchMock.mock.calls[1][0]).toBe('/api/reports/monthly?date=2026-10-15');
});

test('supports arrow/Home/End keyboard navigation and blocks tab changes while disabled', async () => {
  const fetchMock = vi.fn().mockResolvedValue(reply(mtd));
  vi.stubGlobal('fetch', fetchMock);
  const user = userEvent.setup();
  const view = render(<Harness />);
  screen.getByRole('tab', { name: 'Today' }).focus();
  await user.keyboard('{ArrowRight}');
  expect(screen.getByRole('tab', { name: 'This month' })).toHaveFocus();
  expect(screen.getByRole('tab', { name: 'This month' })).toHaveAttribute('aria-selected', 'true');
  await user.keyboard('{Home}');
  expect(screen.getByRole('tab', { name: 'Today' })).toHaveFocus();
  await user.keyboard('{End}');
  expect(screen.getByRole('tab', { name: 'Last month' })).toHaveFocus();
  view.rerender(<Harness disabled />);
  expect(screen.getByRole('tab', { name: 'Today' })).toBeDisabled();
  expect(screen.getByRole('tab', { name: 'This month' })).toBeDisabled();
  expect(screen.getByRole('tab', { name: 'Last month' })).toBeDisabled();
});

test('expires the session when a month report rejects authentication', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ error: 'Expired session.' }, 401)));
  const expired = vi.fn();
  const user = userEvent.setup();
  render(<Harness expired={expired} />);
  await user.click(screen.getByRole('tab', { name: 'This month' }));
  await waitFor(() => expect(expired).toHaveBeenCalledOnce());
});
