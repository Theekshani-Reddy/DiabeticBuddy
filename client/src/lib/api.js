export class ApiError extends Error {
  constructor(message, status = 0, field) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

export async function authRequest(endpoint, { method = 'GET', body, token, signal } = {}) {
  const timeout = AbortSignal.timeout(15000);
  try {
    const response = await fetch(`/api/auth/${endpoint}`, {
      method,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    const data = await response.json();
    if (!response.ok) throw new ApiError(data.error || 'Something went wrong. Please try again.', response.status, data.field);
    return data;
  } catch (error) {
    if (signal?.aborted || error instanceof ApiError) throw error;
    throw new ApiError('We couldn’t connect. Please check your connection and try again.');
  }
}
