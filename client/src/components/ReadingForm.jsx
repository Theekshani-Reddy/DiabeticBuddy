import { useEffect, useRef, useState } from 'react';
import { isValidDate, slots } from '../lib/readings.js';

export default function ReadingForm({ date, today, reading, readings, busy, saving, message, onDismissMessage, onSave, onCancel }) {
  const initialSlot = slots.find((slot) => !readings.some((item) => item.slot === slot.value))?.value || 'morning';
  const [values, setValues] = useState({ date: reading?.date || date, slot: reading?.slot || initialSlot, value: String(reading?.value ?? '') });
  const [errors, setErrors] = useState({});
  const formRef = useRef(null);
  const errorTarget = useRef(null);
  const full = !reading && values.date === date && readings.length >= 4;
  const hasErrors = Object.values(errors).some(Boolean);

  useEffect(() => {
    if (!reading && values.date === date && readings.some((item) => item.slot === values.slot)) {
      const available = slots.find((slot) => !readings.some((item) => item.slot === slot.value));
      if (available) setValues((current) => ({ ...current, slot: available.value }));
    }
  }, [readings, reading, date, values.date, values.slot]);

  useEffect(() => {
    if (errorTarget.current) {
      const target = errorTarget.current === 'slot'
        ? formRef.current?.querySelector('input[name="slot"]:checked:not(:disabled)') || formRef.current?.querySelector('input[name="slot"]:not(:disabled)')
        : formRef.current?.elements.namedItem(errorTarget.current);
      target?.focus?.();
      errorTarget.current = null;
    }
  }, [errors]);

  function change(event) {
    onDismissMessage();
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined, form: undefined }));
  }

  function showErrors(nextErrors) {
    errorTarget.current = ['value', 'date', 'slot'].find((field) => nextErrors[field]);
    setErrors(nextErrors);
  }

  async function submit(event) {
    event.preventDefault();
    if (busy || full) return;
    onDismissMessage();
    const nextErrors = {};
    const value = Number(values.value);
    if (!values.value.trim()) nextErrors.value = 'Please enter a glucose value.';
    else if (Number.isFinite(value) && !Number.isInteger(value)) nextErrors.value = 'Please enter a whole number.';
    else if (!Number.isInteger(value) || value < 40 || value > 600) nextErrors.value = 'Value must be between 40 and 600 mg/dl.';
    if (!isValidDate(values.date)) nextErrors.date = 'Please enter a valid date in YYYY-MM-DD format.';
    else if (values.date > today) nextErrors.date = 'Date cannot be in the future.';
    if (!slots.some((slot) => slot.value === values.slot)) nextErrors.slot = 'Please choose a valid time slot.';
    if (Object.keys(nextErrors).length) return showErrors(nextErrors);

    setErrors({});
    try {
      await onSave({ ...values, value });
    } catch (error) {
      const field = ['value', 'date', 'slot'].includes(error.field) ? error.field : 'form';
      showErrors({ [field]: error.message });
    }
  }

  function fieldError(name) {
    return errors[name] && <p className="field-error" id={`reading-${name}-error`} role="alert">{errors[name]}</p>;
  }

  return (
    <section className="reading-card entry-card" aria-labelledby="reading-form-title">
      <h3 id="reading-form-title">{reading ? 'Edit reading' : date === today ? "Add today's reading" : 'Add reading'}</h3>
      <form ref={formRef} onSubmit={submit} noValidate aria-label={reading ? 'Edit reading' : 'Add reading'} aria-busy={busy}>
        {reading && <div className="field">
          <label htmlFor="reading-date">Date</label>
          <input id="reading-date" name="date" type="date" min="0001-01-01" max={today} required value={values.date}
            onChange={change} disabled={busy} aria-invalid={Boolean(errors.date)} aria-describedby={errors.date ? 'reading-date-error' : undefined} />
          {fieldError('date')}
        </div>}
        {!reading && fieldError('date')}
        <fieldset className="slot-picker" disabled={busy} aria-describedby={errors.slot ? 'reading-slot-error' : undefined}>
          <legend className="sr-only">Time slot</legend>
            {slots.map((slot) => {
              const occupied = values.date === date && readings.some((item) => item.slot === slot.value && item.id !== reading?.id);
              return <label className={`slot-option ${slot.value}${values.slot === slot.value ? ' is-selected' : ''}${occupied ? ' is-recorded' : ''}`} key={slot.value}>
                <input className="sr-only" type="radio" name="slot" value={slot.value} checked={values.slot === slot.value}
                  onChange={change} disabled={occupied || busy} aria-invalid={Boolean(errors.slot)}
                  aria-label={`${slot.label}${occupied ? ' — recorded' : ''}`} />
                <span>{slot.value === 'morning' ? <>Morning<small>fasting</small></> : slot.label}</span>
                {occupied && <span className="slot-check" aria-hidden="true">✓</span>}
              </label>;
            })}
        </fieldset>
        {fieldError('slot')}
        <div className="reading-entry-row">
          <div className="field reading-value-field">
            <label className="sr-only" htmlFor="reading-value">Glucose (mg/dl)</label>
            <div className="glucose-input">
              <input id="reading-value" name="value" type="number" inputMode="numeric" min="40" max="600" step="1" required
                placeholder="e.g. 132" value={values.value} onChange={change} disabled={busy} autoFocus={Boolean(reading)}
                aria-invalid={Boolean(errors.value)} aria-describedby={errors.value ? 'reading-value-error' : undefined} />
              <span aria-hidden="true">mg/dl</span>
            </div>
          </div>
          <button className="primary-button" type="submit" aria-label={saving ? 'Saving…' : reading ? 'Save changes' : 'Add reading'} disabled={busy || full}>
            {saving ? 'Saving…' : reading ? 'Save' : 'Add'}
          </button>
        </div>
        <div className="reading-feedback">
          {errors.value ? fieldError('value') : errors.form ? <p className="field-error" role="alert">{errors.form}</p>
            : !hasErrors && (message ? <p className="mutation-message" role="status">{message}</p>
              : full && <p className="notice" role="status">You can add only 4 readings per day.</p>)}
        </div>
        {reading && <button className="secondary-button cancel-edit" type="button" onClick={onCancel} disabled={busy}>Cancel edit</button>}
      </form>
    </section>
  );
}
