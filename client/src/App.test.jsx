import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import App from './App.jsx';

// Authentication behavior is tested separately from the readings workspace.
vi.mock('./components/Readings.jsx', () => ({ default: () => null }));

const patient = { id: 1, name: 'Test Patient', email: 'patient@example.test' };
const password = ' Patientpass!42 ';
const makeToken = () => `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.signature`;
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

async function fillLogin(user) {
  await user.type(screen.getByLabelText('Email address'), patient.email);
  await user.type(screen.getByLabelText('Password', { exact: true }), password);
  await user.click(screen.getByRole('button', { name: 'Log in to Sweety' }));
}

test('logs in, preserves password whitespace, stores the token, and logs out', async () => {
  const token = makeToken();
  const fetchMock = vi.fn().mockResolvedValue(reply({ user: patient, token }));
  vi.stubGlobal('fetch', fetchMock);
  const user = userEvent.setup();
  render(<App />);
  await fillLogin(user);
  expect(await screen.findByRole('img', { name: 'Signed in as Test Patient' })).toBeInTheDocument();
  expect(sessionStorage.getItem('sweety.token')).toBe(token);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).password).toBe(password);
  await user.click(screen.getByRole('button', { name: 'Log out' }));
  expect(screen.getByRole('heading', { name: 'Log in', exact: true })).toBeInTheDocument();
  expect(sessionStorage.getItem('sweety.token')).toBeNull();
});

test('creates an account and signs in with the returned identity', async () => {
  const fetchMock = vi.fn().mockResolvedValue(reply({ user: patient, token: makeToken() }, 201));
  vi.stubGlobal('fetch', fetchMock);
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Create account', exact: true }));
  await user.type(screen.getByLabelText('Your name'), patient.name);
  await user.type(screen.getByLabelText('Email address'), patient.email);
  await user.type(screen.getByLabelText('Password', { exact: true }), password);
  await user.click(screen.getByRole('button', { name: 'Create my account' }));
  expect(await screen.findByRole('img', { name: 'Signed in as Test Patient' })).toBeInTheDocument();
  expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/register');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ name: patient.name, email: patient.email, password });
});

test('shows required-field errors, focuses the first field, and makes no request', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Log in to Sweety' }));
  expect(screen.getByText('Please enter a valid email address.')).toBeInTheDocument();
  expect(screen.getByText('Please enter a password.')).toBeInTheDocument();
  expect(screen.getByLabelText('Email address')).toHaveFocus();
  expect(fetchMock).not.toHaveBeenCalled();
});

test('validates signup password length and each required character category before sending data', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Create account', exact: true }));
  await user.type(screen.getByLabelText('Your name'), patient.name);
  await user.type(screen.getByLabelText('Email address'), patient.email);
  const input = screen.getByLabelText('Password', { exact: true });
  for (const [value, message] of [
    ['Abcd1!x', 'Password must contain at least 8 characters.'],
    ['patientpass!42', 'Password must include uppercase, lowercase, a number, and a symbol.'],
    ['PATIENTPASS!42', 'Password must include uppercase, lowercase, a number, and a symbol.'],
    ['Patientpassword!', 'Password must include uppercase, lowercase, a number, and a symbol.'],
    ['Patientpass42', 'Password must include uppercase, lowercase, a number, and a symbol.'],
    ['Patientpass42 ', 'Password must include uppercase, lowercase, a number, and a symbol.'],
    ['Patientpass42é', 'Password must include uppercase, lowercase, a number, and a symbol.'],
    ['A'.repeat(70) + 'b1!', 'Password is too long. Please use a shorter password.'],
    ['€'.repeat(25), 'Password is too long. Please use a shorter password.'],
  ]) {
    fireEvent.change(input, { target: { value } });
    await user.click(screen.getByRole('button', { name: 'Create my account' }));
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(input).toHaveFocus();
  }
  expect(fetchMock).not.toHaveBeenCalled();
});

test('keeps entered values after failed login and lets the user reveal the password', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ error: 'Invalid email or password.' }, 401)));
  const user = userEvent.setup();
  render(<App />);
  await fillLogin(user);
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
  expect(screen.getByLabelText('Email address')).toHaveValue(patient.email);
  expect(screen.getByLabelText('Password', { exact: true })).toHaveValue(password);
  await user.click(screen.getByRole('button', { name: 'Show password' }));
  expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'text');
  expect(sessionStorage.getItem('sweety.token')).toBeNull();
});

test('shows and focuses an API field error without clearing the signup form', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ field: 'email', error: 'An account with this email already exists.' }, 409)));
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Create account', exact: true }));
  await user.type(screen.getByLabelText('Your name'), patient.name);
  await user.type(screen.getByLabelText('Email address'), patient.email);
  await user.type(screen.getByLabelText('Password', { exact: true }), password);
  await user.click(screen.getByRole('button', { name: 'Create my account' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email already exists.');
  expect(screen.getByLabelText('Email address')).toHaveFocus();
  expect(screen.getByLabelText('Your name')).toHaveValue(patient.name);
});

test('prevents double submission while a request is pending', async () => {
  let resolveRequest;
  const fetchMock = vi.fn(() => new Promise((resolve) => { resolveRequest = resolve; }));
  vi.stubGlobal('fetch', fetchMock);
  const user = userEvent.setup();
  render(<App />);
  await fillLogin(user);
  expect(screen.getByRole('button', { name: 'Logging in…' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Logging in…' }));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(async () => resolveRequest(reply({ error: 'Please try again.' }, 500)));
  expect(screen.getByRole('button', { name: 'Log in to Sweety' })).toBeEnabled();
});

test('verifies the stored token before showing the protected home screen', async () => {
  const token = makeToken();
  sessionStorage.setItem('sweety.token', token);
  let resolveRequest;
  const fetchMock = vi.fn(() => new Promise((resolve) => { resolveRequest = resolve; }));
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  expect(screen.getByText('Checking your session.')).toBeInTheDocument();
  expect(screen.queryByRole('img', { name: 'Signed in as Test Patient' })).not.toBeInTheDocument();
  expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/me');
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${token}`);
  await act(async () => resolveRequest(reply({ user: patient })));
  expect(screen.getByRole('img', { name: 'Signed in as Test Patient' })).toBeInTheDocument();
});

test('clears a rejected stored session and returns to login with an explanation', async () => {
  sessionStorage.setItem('sweety.token', makeToken());
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ error: 'Expired session.' }, 401)));
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Log in', exact: true })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Your session has expired. Please log in again.');
  expect(sessionStorage.getItem('sweety.token')).toBeNull();
});

test('preserves the session during a connection failure and offers a working retry', async () => {
  const token = makeToken();
  sessionStorage.setItem('sweety.token', token);
  const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Network unavailable'))
    .mockResolvedValueOnce(reply({ user: patient }));
  vi.stubGlobal('fetch', fetchMock);
  const user = userEvent.setup();
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Connection error' })).toBeInTheDocument();
  expect(sessionStorage.getItem('sweety.token')).toBe(token);
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('img', { name: 'Signed in as Test Patient' })).toBeInTheDocument();
});

test('logs out automatically when the verified token expires', async () => {
  vi.useFakeTimers();
  sessionStorage.setItem('sweety.token', makeToken());
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ user: patient })));
  await act(async () => { render(<App />); });
  expect(screen.getByRole('img', { name: 'Signed in as Test Patient' })).toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(3600001); });
  expect(screen.getByRole('heading', { name: 'Log in', exact: true })).toBeInTheDocument();
  expect(sessionStorage.getItem('sweety.token')).toBeNull();
});

test('still permits login if the browser blocks session storage', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked'); });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ user: patient, token: makeToken() })));
  const user = userEvent.setup();
  render(<App />);
  await fillLogin(user);
  await waitFor(() => expect(screen.getByRole('img', { name: 'Signed in as Test Patient' })).toBeInTheDocument());
});
