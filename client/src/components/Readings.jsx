import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api.js';
import { formatReadingDate, greetingInKolkata, isValidDate, sortReadings, todayInKolkata } from '../lib/readings.js';
import ReadingForm from './ReadingForm.jsx';
import ReadingList from './ReadingList.jsx';
import Reports from './Reports.jsx';

export default function Readings({ user, token, onSessionExpired, today = todayInKolkata() }) {
  const [date, setDate] = useState(today);
  const [data, setData] = useState({ date, readings: [], report: null, loaded: false, refreshing: true, error: '' });
  const [reportType, setReportType] = useState('daily');
  const [editing, setEditing] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [action, setAction] = useState(null);
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  const [formVersion, setFormVersion] = useState(0);
  const current = data.date === date;
  const loaded = current && data.loaded;
  const loading = !loaded;
  const error = current ? data.error : '';
  const readings = current ? data.readings : [];
  const busy = Boolean(action);

  useEffect(() => {
    const controller = new AbortController();
    setData((current) => current.date === date && current.loaded
      ? { ...current, report: null, refreshing: true, error: '' }
      : { date, readings: [], report: null, loaded: false, refreshing: true, error: '' });
    apiRequest(`reports/daily?date=${encodeURIComponent(date)}`, { token, signal: controller.signal })
      .then((report) => {
        if (!controller.signal.aborted) setData({ date, readings: report.readings, report, loaded: true, refreshing: false, error: '' });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.status === 401) onSessionExpired();
        else setData((current) => ({ ...current, refreshing: false, error: error.message }));
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
        setData((current) => ({ ...current, report: null, refreshing: true, readings: sortReadings([
          ...current.readings.filter((item) => item.id !== result.reading.id), result.reading,
        ]) }));
      } else setDate(result.reading.date);
      setMessage(editing ? 'Reading updated.' : 'Reading added.');
      setEditing(null);
      setFormVersion((value) => value + 1);
      setReload((value) => value + 1);
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
      setData((current) => ({ ...current, report: null, refreshing: true, readings: current.readings.filter((item) => item.id !== id) }));
      setDeleteId(null);
      setMessage('Reading deleted.');
      setReload((value) => value + 1);
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
        {!loading && !error && <div className="daily-progress">
          <span className="progress-dots" aria-hidden="true">{[0, 1, 2, 3].map((index) => <span className={index < readings.length ? 'filled' : ''} key={index} />)}</span>
          <span>{readings.length} of 4 readings{date === today ? ' today' : ''}</span>
        </div>}
      </div>
      {loading && !error ? <p className="readings-empty" role="status">Loading readings…</p> : !loaded && error ? (
        <div className="readings-empty"><p role="alert">{error}</p><button className="secondary-button" onClick={() => setReload((value) => value + 1)}>Retry</button></div>
      ) : (
        <div className="readings-grid">
          <ReadingForm key={`${date}-${editing?.id || 'new'}-${formVersion}`} date={date} today={today} reading={editing}
            readings={readings} busy={busy} saving={action === 'save'} message={message} onSave={save} onCancel={() => setEditing(null)} />
          <Reports date={date} today={today} token={token} type={reportType} onTypeChange={(type) => {
            setReportType(type); setDeleteId(null); setDeleteError('');
          }} dailyReport={current ? data.report : null} dailyLoading={!current || data.refreshing} dailyError={error}
            onRetryDaily={() => setReload((value) => value + 1)} revision={reload} onSessionExpired={onSessionExpired}
            disabled={busy || Boolean(editing)}>
            <ReadingList readings={data.report?.readings || []} busy={busy} editing={editing} deleteId={deleteId}
              deleteError={deleteError} deleting={action === 'delete'} onEdit={(reading) => {
                setEditing(reading); setDeleteId(null); setDeleteError(''); setMessage('');
              }} onStartDelete={(id) => { setDeleteId(id); setDeleteError(''); setMessage(''); }}
              onCancelDelete={() => setDeleteId(null)} onConfirmDelete={remove} />
          </Reports>
        </div>
      )}
    </section>
  );
}
