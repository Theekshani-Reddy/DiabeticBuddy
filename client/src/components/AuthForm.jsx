import { useEffect, useRef, useState } from 'react';
import { authRequest } from '../lib/api.js';

function Field({ label, name, error, hint, children, ...inputProps }) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <div className={children ? 'password-input' : undefined}>
        <input id={name} name={name} aria-invalid={Boolean(error)}
          aria-describedby={error ? `${name}-error` : hint ? `${name}-hint` : undefined} {...inputProps} />
        {children}
      </div>
      {error && <p id={`${name}-error`} className="field-error" role="alert">{error}</p>}
      {!error && hint && <p id={`${name}-hint`} className="field-hint">{hint}</p>}
    </div>
  );
}

export default function AuthForm({ onSuccess, notice }) {
  const [mode, setMode] = useState('login');
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const formRef = useRef(null);
  const errorTarget = useRef(null);
  const isSignup = mode === 'register';

  useEffect(() => {
    if (errorTarget.current) {
      formRef.current?.elements.namedItem(errorTarget.current)?.focus();
      errorTarget.current = null;
    }
  }, [errors]);

  function changeMode(nextMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setErrors({});
    setValues((current) => ({ ...current, password: '' }));
    setShowPassword(false);
  }

  function changeValue(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined, form: undefined }));
  }

  function showErrors(nextErrors) {
    errorTarget.current = ['name', 'email', 'password'].find((name) => nextErrors[name]);
    setErrors(nextErrors);
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const nextErrors = {};
    if (isSignup && !values.name.trim()) nextErrors.name = 'Please enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) nextErrors.email = 'Please enter a valid email address.';
    if (!values.password) nextErrors.password = 'Please enter a password.';
    else if (isSignup && [...values.password].length < 8) nextErrors.password = 'Password must contain at least 8 characters.';
    else if (new TextEncoder().encode(values.password).length > 72) nextErrors.password = 'Password is too long. Please use a shorter password.';
    else if (isSignup && (!/[A-Z]/.test(values.password) || !/[a-z]/.test(values.password) ||
        !/[0-9]/.test(values.password) || !/[^\p{L}\p{N}\s]/u.test(values.password))) {
      nextErrors.password = 'Password must include uppercase, lowercase, a number, and a symbol.';
    }
    if (Object.keys(nextErrors).length) return showErrors(nextErrors);

    setErrors({});
    setBusy(true);
    try {
      const body = { email: values.email.trim(), password: values.password,
        ...(isSignup && { name: values.name.trim() }) };
      const session = await authRequest(mode, { method: 'POST', body });
      onSuccess(session);
    } catch (error) {
      const field = ['name', 'email', 'password'].includes(error.field) ? error.field : 'form';
      showErrors({ [field]: error.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-panel" aria-labelledby="auth-title">
      <div className="auth-switch" aria-label="Account options">
        <button type="button" aria-pressed={!isSignup} onClick={() => changeMode('login')} disabled={busy}>Log in</button>
        <button type="button" aria-pressed={isSignup} onClick={() => changeMode('register')} disabled={busy}>Create account</button>
      </div>
      <h1 id="auth-title">{isSignup ? 'Create account' : 'Log in'}</h1>
      {notice && !isSignup && <p className="notice" role="status">{notice}</p>}
      <form ref={formRef} onSubmit={submit} noValidate aria-busy={busy} aria-label={isSignup ? 'Create account' : 'Log in'}>
        {isSignup && <Field label="Your name" name="name" autoComplete="name" maxLength={100}
          value={values.name} onChange={changeValue} error={errors.name} disabled={busy} required />}
        <Field label="Email address" name="email" type="email" autoComplete="email" maxLength={254}
          placeholder="you@example.com" value={values.email} onChange={changeValue} error={errors.email} disabled={busy} required />
        <Field label="Password" name="password" type={showPassword ? 'text' : 'password'}
          autoComplete={isSignup ? 'new-password' : 'current-password'} value={values.password}
          onChange={changeValue} error={errors.password} hint={isSignup ? '8+ characters with uppercase, lowercase, a number and a symbol.' : undefined} disabled={busy} required>
          <button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword} disabled={busy} onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Hide' : 'Show'}</button>
        </Field>
        {errors.form && <p className="form-error" role="alert">{errors.form}</p>}
        <button className="primary-button" type="submit" disabled={busy} aria-label={!busy && !isSignup ? 'Log in to Sweety' : undefined}>
          {busy ? (isSignup ? 'Creating your account…' : 'Logging in…') : (isSignup ? 'Create my account' : 'Log in')}
          {!busy && <span aria-hidden="true">↗</span>}
        </button>
      </form>
    </section>
  );
}
