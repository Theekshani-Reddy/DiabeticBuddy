import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import Readings from './Readings.jsx';

const today = '2026-11-06';
const morning = { id: 1, date: today, slot: 'morning', value: 112, created_at: '2026-11-06T07:00:00Z' };
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

function daily(readings, date = today) {
  const values = readings.map((reading) => reading.value);
  return {
    type: 'daily', date, startDate: date, endDate: date, readings, count: readings.length,
    average: readings.length ? Math.round(values.reduce((sum, value) => sum + value, 0) * 10 / readings.length) / 10 : null,
    highest: readings.length ? Math.max(...values) : null,
    lowest: readings.length ? Math.min(...values) : null,
  };
}

function setup(fetchMock) {
  vi.stubGlobal('fetch', fetchMock);
  const expired = vi.fn();
  render(<Readings token="test-token" today={today} onSessionExpired={expired} />);
  return expired;
}

async function ready() {
  await screen.findByRole('form', { name: 'Add reading' });
}

const list = () => screen.getByRole('region', { name: 'Recorded readings' });

test('adds a numeric reading, updates the list/count, and selects the next available slot', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(reply(daily([])))
    .mockResolvedValueOnce(reply({ reading: morning }, 201)).mockResolvedValueOnce(reply(daily([morning])));
  setup(fetchMock);
  const user = userEvent.setup();
  await ready();
  expect(await screen.findByText('No readings for this date.')).toBeInTheDocument();
  await user.type(screen.getByLabelText('Glucose (mg/dl)'), '112');
  await user.click(screen.getByRole('button', { name: 'Add reading', exact: true }));
  expect(await screen.findByText('Reading added.')).toBeInTheDocument();
  await waitFor(() => expect(within(list()).getByText('112')).toBeInTheDocument());
  expect(screen.getByText('1 of 4 readings today')).toBeInTheDocument();
  expect(screen.getByLabelText('Glucose (mg/dl)')).toHaveValue(null);
  expect(screen.getByRole('radio', { name: 'After breakfast', exact: true })).toBeChecked();
  expect(fetchMock.mock.calls[1][0]).toBe('/api/readings');
  expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer test-token');
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ date: today, slot: 'morning', value: 112 });
});

test('shows required, range, whole-number, and future-date messages before sending data', async () => {
  const fetchMock = vi.fn().mockResolvedValue(reply(daily([])));
  setup(fetchMock);
  const user = userEvent.setup();
  await ready();
  await user.click(screen.getByRole('button', { name: 'Add reading', exact: true }));
  expect(screen.getByRole('alert')).toHaveTextContent('Please enter a glucose value.');
  expect(screen.getByLabelText('Glucose (mg/dl)')).toHaveFocus();
  for (const value of ['39', '601']) {
    await user.clear(screen.getByLabelText('Glucose (mg/dl)'));
    await user.type(screen.getByLabelText('Glucose (mg/dl)'), value);
    await user.click(screen.getByRole('button', { name: 'Add reading', exact: true }));
    expect(screen.getByRole('alert')).toHaveTextContent('Value must be between 40 and 600 mg/dl.');
  }
  for (const value of ['112.5', '39.5', '600.1']) {
    await user.clear(screen.getByLabelText('Glucose (mg/dl)'));
    await user.type(screen.getByLabelText('Glucose (mg/dl)'), value);
    await user.click(screen.getByRole('button', { name: 'Add reading', exact: true }));
    expect(screen.getByRole('alert')).toHaveTextContent('Please enter a whole number.');
  }
  await user.clear(screen.getByLabelText('Glucose (mg/dl)'));
  await user.type(screen.getByLabelText('Glucose (mg/dl)'), '112');
  fireEvent.change(screen.getByLabelText('View date'), { target: { value: '2026-11-07' } });
  await ready();
  await user.type(screen.getByLabelText('Glucose (mg/dl)'), '112');
  await user.click(screen.getByRole('button', { name: 'Add reading', exact: true }));
  expect(screen.getByRole('alert')).toHaveTextContent('Date cannot be in the future.');
  expect(fetchMock.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
});

test('clears success feedback when starting a new draft or submitting a client-side validation error', async () => {
  const breakfast = { ...morning, id: 2, slot: 'after_breakfast', value: 148 };
  const fetchMock = vi.fn().mockResolvedValueOnce(reply(daily([])))
    .mockResolvedValueOnce(reply({ reading: morning })).mockResolvedValueOnce(reply(daily([morning])))
    .mockResolvedValueOnce(reply({ reading: breakfast })).mockResolvedValueOnce(reply(daily([morning, breakfast])));
  setup(fetchMock);
  const user = userEvent.setup();
  await ready();
  await user.type(screen.getByLabelText('Glucose (mg/dl)'), '112');
  await user.click(screen.getByRole('button', { name: 'Add reading', exact: true }));
  expect(await screen.findByText('Reading added.')).toBeInTheDocument();
  await user.type(screen.getByLabelText('Glucose (mg/dl)'), '148');
  expect(screen.queryByText('Reading added.')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Add reading', exact: true }));
  expect(await screen.findByText('Reading added.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Add reading', exact: true }));
  expect(screen.getByRole('alert')).toHaveTextContent('Please enter a glucose value.');
  expect(screen.queryByText('Reading added.')).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(5);
});

test('expires success messages after five seconds and resets the timer for a later successful save', async () => {
  const breakfast = { ...morning, id: 2, slot: 'after_breakfast', value: 148 };
  const fetchMock = vi.fn().mockResolvedValueOnce(reply(daily([])))
    .mockResolvedValueOnce(reply({ reading: morning })).mockResolvedValueOnce(reply(daily([morning])))
    .mockResolvedValueOnce(reply({ reading: breakfast })).mockResolvedValueOnce(reply(daily([morning, breakfast])));
  setup(fetchMock);
  await ready();
  vi.useFakeTimers();
  fireEvent.change(screen.getByLabelText('Glucose (mg/dl)'), { target: { value: '112' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add reading', exact: true })));
  expect(screen.getByText('Reading added.')).toBeInTheDocument();
  await act(async () => vi.advanceTimersByTime(4000));
  fireEvent.change(screen.getByLabelText('Glucose (mg/dl)'), { target: { value: '148' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add reading', exact: true })));
  await act(async () => vi.advanceTimersByTime(1000));
  expect(screen.getByText('Reading added.')).toBeInTheDocument();
  await act(async () => vi.advanceTimersByTime(3999));
  expect(screen.getByText('Reading added.')).toBeInTheDocument();
  await act(async () => vi.advanceTimersByTime(1));
  expect(screen.queryByText('Reading added.')).not.toBeInTheDocument();
  expect(within(list()).getByText('148')).toBeInTheDocument();
});

test('preserves the form values and displays the exact API duplicate-slot error', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(reply(daily([])))
    .mockResolvedValueOnce(reply({ field: 'slot', error: 'You already have an After lunch reading for this date.' }, 409));
  setup(fetchMock);
  const user = userEvent.setup();
  await ready();
  await user.click(screen.getByRole('radio', { name: 'After lunch', exact: true }));
  await user.type(screen.getByLabelText('Glucose (mg/dl)'), '142');
  await user.click(screen.getByRole('button', { name: 'Add reading', exact: true }));
  expect(await screen.findByRole('alert')).toHaveTextContent('You already have an After lunch reading for this date.');
  expect(screen.getByRole('radio', { name: 'After lunch', exact: true })).toHaveFocus();
  expect(screen.getByRole('radio', { name: 'After lunch', exact: true })).toBeChecked();
  expect(screen.getByLabelText('View date')).toHaveValue(today);
  expect(screen.getByLabelText('Glucose (mg/dl)')).toHaveValue(142);
});

test('shows the four-per-day limit while still allowing an existing reading to be edited', async () => {
  const full = ['morning', 'after_breakfast', 'after_lunch', 'after_dinner'].map((slot, index) => ({ ...morning, id: index + 1, slot }));
  const fetchMock = vi.fn().mockResolvedValueOnce(reply(daily(full)))
    .mockResolvedValueOnce(reply({ reading: { ...morning, value: 130 } }))
    .mockResolvedValueOnce(reply(daily(full.map((item) => item.id === morning.id ? { ...item, value: 130 } : item))));
  setup(fetchMock);
  const user = userEvent.setup();
  await ready();
  expect(screen.getByText('You can add only 4 readings per day.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add reading', exact: true })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Edit Morning (fasting) reading' }));
  await user.clear(screen.getByLabelText('Glucose (mg/dl)'));
  await user.type(screen.getByLabelText('Glucose (mg/dl)'), '130');
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText('Reading updated.')).toBeInTheDocument();
  await waitFor(() => expect(within(list()).getByText('130')).toBeInTheDocument());
  expect(screen.getByText('116.5')).toBeInTheDocument();
  expect(fetchMock.mock.calls[1][1].method).toBe('PUT');
  expect(screen.getByText('4 of 4 readings today')).toBeInTheDocument();
});

test('cancels edits without a write, and follows a saved reading moved to another date', async () => {
  const moved = { ...morning, date: '2026-11-05', value: 140 };
  const fetchMock = vi.fn().mockResolvedValueOnce(reply(daily([morning])))
    .mockResolvedValueOnce(reply({ reading: moved })).mockResolvedValueOnce(reply(daily([moved], moved.date)));
  setup(fetchMock);
  const user = userEvent.setup();
  await ready();
  await user.click(screen.getByRole('button', { name: 'Edit Morning (fasting) reading' }));
  await user.clear(screen.getByLabelText('Glucose (mg/dl)'));
  await user.type(screen.getByLabelText('Glucose (mg/dl)'), '140');
  await user.click(screen.getByRole('button', { name: 'Cancel edit' }));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(within(list()).getByText('112')).toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: 'Edit Morning (fasting) reading' }));
  fireEvent.change(screen.getByLabelText('Date', { exact: true }), { target: { value: moved.date } });
  await user.clear(screen.getByLabelText('Glucose (mg/dl)'));
  await user.type(screen.getByLabelText('Glucose (mg/dl)'), '140');
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(screen.getByLabelText('View date')).toHaveValue(moved.date));
  await ready();
  expect(within(list()).getByText('140')).toBeInTheDocument();
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ date: moved.date, slot: 'morning', value: 140 });
  expect(fetchMock.mock.calls[2][0]).toBe('/api/reports/daily?date=2026-11-05');
});

test('requires delete confirmation, handles an empty 204 response, and preserves an unsaved draft', async () => {
  const emptyResponse = { ok: true, status: 204, json: vi.fn() };
  const fetchMock = vi.fn().mockResolvedValueOnce(reply(daily([morning]))).mockResolvedValueOnce(emptyResponse).mockResolvedValueOnce(reply(daily([])));
  setup(fetchMock);
  const user = userEvent.setup();
  await ready();
  await user.type(screen.getByLabelText('Glucose (mg/dl)'), '145');
  await user.click(screen.getByRole('button', { name: 'Delete Morning (fasting) reading' }));
  expect(screen.getByText('Delete this reading?')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  expect(screen.queryByText('Delete this reading?')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Delete Morning (fasting) reading' }));
  await user.click(screen.getByRole('button', { name: 'Confirm delete' }));
  expect(await screen.findByText('Reading deleted.')).toBeInTheDocument();
  expect(await screen.findByText('No readings for this date.')).toBeInTheDocument();
  expect(screen.getByLabelText('Glucose (mg/dl)')).toHaveValue(145);
  expect(emptyResponse.json).not.toHaveBeenCalled();
  expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');
});

test('keeps a reading visible after a failed delete and supports retry', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(reply(daily([morning])))
    .mockResolvedValueOnce(reply({ error: 'Something went wrong. Please try again.' }, 500))
    .mockResolvedValueOnce({ ok: true, status: 204 }).mockResolvedValueOnce(reply(daily([])));
  setup(fetchMock);
  const user = userEvent.setup();
  await ready();
  await user.click(screen.getByRole('button', { name: 'Delete Morning (fasting) reading' }));
  await user.click(screen.getByRole('button', { name: 'Confirm delete' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
  await waitFor(() => expect(within(list()).getByText('112')).toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: 'Confirm delete' }));
  expect(await screen.findByText('No readings for this date.')).toBeInTheDocument();
});

test('offers retry for a failed list request without discarding the session', async () => {
  const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Offline')).mockResolvedValueOnce(reply(daily([])));
  const expired = setup(fetchMock);
  const user = userEvent.setup();
  expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t connect.');
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  await ready();
  expect(await screen.findByText('No readings for this date.')).toBeInTheDocument();
  expect(expired).not.toHaveBeenCalled();
});

test('ignores stale responses when the selected date changes during loading', async () => {
  let finishOldRequest;
  const other = { ...morning, id: 2, date: '2026-11-05', slot: 'after_lunch', value: 148 };
  const fetchMock = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finishOldRequest = resolve; }))
    .mockResolvedValueOnce(reply(daily([other], other.date)));
  setup(fetchMock);
  fireEvent.change(screen.getByLabelText('View date'), { target: { value: other.date } });
  await ready();
  expect(within(list()).getByText('148')).toBeInTheDocument();
  await act(async () => finishOldRequest(reply(daily([morning]))));
  expect(within(list()).queryByText('112')).not.toBeInTheDocument();
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
});

test('prevents repeat submissions and date changes while saving', async () => {
  let finishSave;
  const fetchMock = vi.fn().mockResolvedValueOnce(reply(daily([])))
    .mockImplementationOnce(() => new Promise((resolve) => { finishSave = resolve; })).mockResolvedValueOnce(reply(daily([morning])));
  setup(fetchMock);
  const user = userEvent.setup();
  await ready();
  await user.type(screen.getByLabelText('Glucose (mg/dl)'), '112');
  await user.click(screen.getByRole('button', { name: 'Add reading', exact: true }));
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  expect(screen.getByLabelText('View date')).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Saving…' }));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await act(async () => finishSave(reply({ reading: morning }, 201)));
  expect(screen.getByText('Reading added.')).toBeInTheDocument();
});

test('expires the session when reading access is rejected', async () => {
  const expired = setup(vi.fn().mockResolvedValue(reply({ error: 'Please log in to continue.' }, 401)));
  await waitFor(() => expect(expired).toHaveBeenCalledOnce());
});

test('expires the session when a save is rejected', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(reply(daily([])))
    .mockResolvedValueOnce(reply({ error: 'Your session is invalid or expired. Please log in again.' }, 401));
  const expired = setup(fetchMock);
  const user = userEvent.setup();
  await ready();
  await user.type(screen.getByLabelText('Glucose (mg/dl)'), '112');
  await user.click(screen.getByRole('button', { name: 'Add reading', exact: true }));
  await waitFor(() => expect(expired).toHaveBeenCalledOnce());
});

test('keeps an unsaved draft when a successful deletion is followed by a failed report refresh', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(reply(daily([morning])))
    .mockResolvedValueOnce({ ok: true, status: 204 })
    .mockRejectedValueOnce(new TypeError('Offline'))
    .mockResolvedValueOnce(reply(daily([])));
  setup(fetchMock);
  const user = userEvent.setup();
  await ready();
  await user.type(screen.getByLabelText('Glucose (mg/dl)'), '145');
  await user.click(screen.getByRole('button', { name: 'Delete Morning (fasting) reading' }));
  await user.click(screen.getByRole('button', { name: 'Confirm delete' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t connect.');
  expect(screen.getByLabelText('Glucose (mg/dl)')).toHaveValue(145);
  await user.click(screen.getByRole('button', { name: 'Retry report' }));
  expect(await screen.findByText('No readings for this date.')).toBeInTheDocument();
  expect(screen.getByLabelText('Glucose (mg/dl)')).toHaveValue(145);
});
