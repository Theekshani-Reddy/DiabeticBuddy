export function validateCredentials(body, { registration = false } = {}) {
  if (registration) {
    if (typeof body?.name !== 'string' || !body.name.trim()) {
      return { field: 'name', error: 'Please enter your name.' };
    }
    if (body.name.trim().length > 100) {
      return { field: 'name', error: 'Name must be no more than 100 characters.' };
    }
  }

  if (typeof body?.email !== 'string' || body.email.trim().length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    return { field: 'email', error: 'Please enter a valid email address.' };
  }

  if (typeof body?.password !== 'string' || !body.password.length) {
    return { field: 'password', error: 'Please enter a password.' };
  }
  if (registration && [...body.password].length < 8) {
    return { field: 'password', error: 'Password must contain at least 8 characters.' };
  }
  // bcrypt ignores bytes after the first 72, so reject longer inputs explicitly.
  if (Buffer.byteLength(body.password, 'utf8') > 72) {
    return { field: 'password', error: 'Password is too long. Please use a shorter password.' };
  }

  return null;
}
