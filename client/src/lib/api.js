export class ApiError extends Error {
  constructor(message, status = 0, field) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

export async function apiRequest(endpoint, { method = 'GET', body, token, signal } = {}) {
  const timeout = AbortSignal.timeout(15000);
  try {
    const response = await fetch(`/api/${endpoint}`, {
      method,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new ApiError(data.error || 'Something went wrong. Please try again.', response.status, data.field);
    return data;
  } catch (error) {
    if (signal?.aborted || error instanceof ApiError) throw error;
    throw new ApiError('We couldn’t connect. Please check your connection and try again.');
  }
}

export function authRequest(endpoint, options) {
  return apiRequest(`auth/${endpoint}`, options);
}
