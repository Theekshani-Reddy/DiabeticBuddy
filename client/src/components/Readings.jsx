import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api.js';
import { formatReadingDate, greetingInKolkata, isValidDate, recordedTime, slots, sortReadings, todayInKolkata } from '../lib/readings.js';
import ReadingForm from './ReadingForm.jsx';

export default function Readings({ user, token, onSessionExpired, today = todayInKolkata() }) {
  const [date, setDate] = useState(today);
  const [data, setData] = useState({ date, readings: [], loading: true, error: '' });
  const [editing, setEditing] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [action, setAction] = useState(null);
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  const [formVersion, setFormVersion] = useState(0);
  const loading = data.date !== date || data.loading;
  const readings = data.date === date ? data.readings : [];
  const busy = Boolean(action);

  useEffect(() => {
    const controller = new AbortController();
    setData({ date, readings: [], loading: true, error: '' });
    apiRequest(`readings?date=${encodeURIComponent(date)}`, { token, signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setData({ date, readings: result.readings, loading: false, error: '' });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.status === 401) onSessionExpired();
        else setData({ date, readings: [], loading: false, error: error.message });
      });
    return () => controller.abort();
  }, [date, token, reload, onSessionExpired]);

  function changeDate(event) {
    if (!isValidDate(event.target.value)) return;
    setDate(event.target.value);
    setEditing(null);
    setDeleteId(null);
    setDeleteError('');
    setMessage('');
  }

  async function save(body) {
    setAction('save');
    setMessage('');
    setDeleteId(null);
    setDeleteError('');
    try {
      const result = await apiRequest(editing ? `readings/${editing.id}` : 'readings', {
        method: editing ? 'PUT' : 'POST', token, body,
      });
      if (result.reading.date === date) {
        setData((current) => ({ ...current, readings: sortReadings([
          ...current.readings.filter((item) => item.id !== result.reading.id), result.reading,
        ]) }));
      } else setDate(result.reading.date);
      setMessage(editing ? 'Reading updated.' : 'Reading added.');
      setEditing(null);
      setFormVersion((value) => value + 1);
    } catch (error) {
      if (error.status === 401) onSessionExpired();
      throw error;
    } finally {
      setAction(null);
    }
  }

  async function remove(id) {
    if (busy) return;
    setAction('delete');
    setDeleteError('');
    setMessage('');
    try {
      await apiRequest(`readings/${id}`, { method: 'DELETE', token });
      setData((current) => ({ ...current, readings: current.readings.filter((item) => item.id !== id) }));
      setDeleteId(null);
      setMessage('Reading deleted.');
    } catch (error) {
      if (error.status === 401) onSessionExpired();
      else setDeleteError(error.message);
    } finally {
      setAction(null);
    }
  }

  return (
    <section className="readings-workspace" aria-label="Blood glucose readings">
      <div className="dashboard-heading">
        <div className="readings-date-row">
          <p className="dashboard-date"><time dateTime={date}>{formatReadingDate(date)}</time></p>
          <div className="date-filter"><label className="sr-only" htmlFor="view-date">View date</label>
          <input id="view-date" type="date" min="0001-01-01" max={today} value={date} onChange={changeDate} disabled={busy} /></div>
        </div>
        {user && <h1>{greetingInKolkata()}, {user.name.trim().split(/\s+/)[0]}</h1>}
        {!loading && !data.error && <div className="daily-progress">
          <span className="progress-dots" aria-hidden="true">{[0, 1, 2, 3].map((index) => <span className={index < readings.length ? 'filled' : ''} key={index} />)}</span>
          <span>{readings.length} of 4 readings{date === today ? ' today' : ''}</span>
        </div>}
      </div>
      {loading ? <p className="readings-empty" role="status">Loading readings…</p> : data.error ? (
        <div className="readings-empty"><p role="alert">{data.error}</p><button className="secondary-button" onClick={() => setReload((value) => value + 1)}>Retry</button></div>
      ) : (
        <div className="readings-grid">
          <ReadingForm key={`${date}-${editing?.id || 'new'}-${formVersion}`} date={date} today={today} reading={editing}
            readings={readings} busy={busy} saving={action === 'save'} message={message} onSave={save} onCancel={() => setEditing(null)} />
          <section className="reading-card recorded-card" aria-labelledby="reading-list-title">
            <h3 id="reading-list-title">Recorded readings</h3>
            {readings.length === 0 ? <p className="readings-empty">No readings for this date.</p> : (
              <ul className="readings-list">
                {readings.map((reading) => {
                  const label = slots.find((slot) => slot.value === reading.slot)?.label || reading.slot;
                  return <li key={reading.id}>
                    <div className="reading-row"><span className="reading-description"><span className={`slot-dot ${reading.slot}`} aria-hidden="true" />
                      <span>{label}<time dateTime={reading.created_at} title="Time recorded" aria-label={`Recorded at ${recordedTime(reading.created_at)}`}> · {recordedTime(reading.created_at)}</time></span>
                    </span>
                      <span className="reading-value">{reading.value}<small>mg/dl</small></span>
                      <div className="reading-actions">
                        <button type="button" aria-label={`Edit ${label} reading`} disabled={busy || Boolean(editing)} onClick={() => {
                          setEditing(reading); setDeleteId(null); setDeleteError(''); setMessage('');
                        }}>Edit</button>
                        <button className="delete-reading" type="button" aria-label={`Delete ${label} reading`} disabled={busy || Boolean(editing)} onClick={() => {
                          setDeleteId(reading.id); setDeleteError(''); setMessage('');
                        }}>×</button>
                      </div>
                    </div>
                    {deleteId === reading.id && <div className="delete-confirmation" role="group" aria-label={`Delete ${label} reading`} onKeyDown={(event) => {
                      if (event.key === 'Escape' && !busy) setDeleteId(null);
                    }}>
                      <p>Delete this reading?</p>
                      {deleteError && <p className="field-error" role="alert">{deleteError}</p>}
                      <div className="confirmation-actions">
                        <button className="secondary-button" disabled={busy} onClick={() => setDeleteId(null)}>Cancel</button>
                        <button className="secondary-button" autoFocus disabled={busy} onClick={() => remove(reading.id)}>{action === 'delete' ? 'Deleting…' : 'Confirm delete'}</button>
                      </div>
                    </div>}
                  </li>;
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
