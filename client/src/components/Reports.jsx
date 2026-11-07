import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/api.js';
import GlucoseChart from './GlucoseChart.jsx';

const periods = ['daily', 'mtd', 'monthly'];

function formatRange(startDate, endDate) {
  const formatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const start = formatter.format(new Date(`${startDate}T12:00:00Z`));
  return startDate === endDate ? start : `${start} – ${formatter.format(new Date(`${endDate}T12:00:00Z`))}`;
}

export default function Reports({ date, today, token, type, onTypeChange, dailyReport, dailyLoading,
  dailyError, onRetryDaily, revision, onSessionExpired, disabled, children }) {
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState({ key: '', report: null, loading: true, error: '' });
  const buttons = useRef([]);
  const section = useRef(null);
  const panel = useRef(null);
  const content = useRef(null);
  const dimensions = useRef({ date, width: 0, height: 0, panel: 0 });
  const [heights, setHeights] = useState({ panel: 0, section: 0 });
  const key = `${date}:${type}:${revision}:${retry}`;
  const labels = date === today ? ['Today', 'This month', 'Last month'] : ['Daily', 'Month to date', 'Previous month'];

  useEffect(() => {
    if (type === 'daily') return;
    const controller = new AbortController();
    setResult({ key, report: null, loading: true, error: '' });
    apiRequest(`reports/${type}?date=${encodeURIComponent(date)}`, { token, signal: controller.signal })
      .then((report) => {
        if (!controller.signal.aborted) setResult({ key, report, loading: false, error: '' });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.status === 401) onSessionExpired();
        else setResult({ key, report: null, loading: false, error: error.message });
      });
    return () => controller.abort();
  }, [date, type, token, revision, retry, key, onSessionExpired]);

  const report = type === 'daily' ? dailyReport : result.key === key ? result.report : null;
  const loading = type === 'daily' ? dailyLoading : result.key !== key || result.loading;
  const error = type === 'daily' ? dailyError : result.key === key ? result.error : '';
  const heading = type === 'daily' ? (date === today ? 'Today' : 'Daily') : type === 'mtd' ? 'Month to date' : 'Previous month';

  useLayoutEffect(() => {
    const element = panel.current;
    function measure() {
      const width = element.getBoundingClientRect().width;
      if (dimensions.current.date !== date || Math.abs(dimensions.current.width - width) >= 1) {
        dimensions.current = { date, width, height: 0, panel: 0 };
      }
      if (!loading) {
        const style = getComputedStyle(element);
        const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
        const naturalHeight = Math.ceil(content.current.getBoundingClientRect().height + padding);
        dimensions.current.height = Math.max(dimensions.current.height, naturalHeight);
        dimensions.current.panel = naturalHeight;
      }
      const headingHeight = element.getBoundingClientRect().top - section.current.getBoundingClientRect().top;
      const next = { panel: dimensions.current.panel, section: dimensions.current.height + headingHeight };
      setHeights(current => current.panel === next.panel && current.section === next.section ? current : next);
    }
    // Reserve the largest report area for this date/width to preserve scrolling.
    // The card itself stays compact once loading finishes.
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (Math.abs(dimensions.current.width - element.getBoundingClientRect().width) >= 1) measure();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [date, loading, report, error]);

  function navigate(event, index) {
    const nextIndex = event.key === 'ArrowRight' ? (index + 1) % periods.length
      : event.key === 'ArrowLeft' ? (index + periods.length - 1) % periods.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? periods.length - 1 : null;
    if (nextIndex === null || disabled) return;
    event.preventDefault();
    onTypeChange(periods[nextIndex]);
    buttons.current[nextIndex]?.focus();
  }

  return (
    <section ref={section} className="reports-section" aria-labelledby="reports-title" style={heights.section ? { minHeight: heights.section } : undefined}>
      <h2 id="reports-title">Reports</h2>
      <div className="report-tabs" role="tablist" aria-label="Report period">
        {periods.map((period, index) => <button key={period} ref={(element) => { buttons.current[index] = element; }}
          id={`report-tab-${period}`} type="button" role="tab" aria-selected={type === period} aria-controls="report-panel"
          tabIndex={type === period ? 0 : -1} disabled={disabled} onClick={() => onTypeChange(period)}
          onKeyDown={(event) => navigate(event, index)}>{labels[index]}</button>)}
      </div>
      <section ref={panel} className="reading-card report-card" id="report-panel" role="tabpanel" aria-labelledby={`report-tab-${type}`}
        aria-busy={loading} tabIndex={0} style={loading && heights.panel ? { minHeight: heights.panel } : undefined}>
        <div ref={content} key={key} className={`report-content${loading ? '' : ' is-ready'}`}>
        {loading ? <p className="readings-empty" role="status">Loading report…</p> : error ? <div className="readings-empty">
          <p role="alert">{error}</p>
          <button className="secondary-button" onClick={type === 'daily' ? onRetryDaily : () => setRetry((value) => value + 1)}>Retry report</button>
        </div> : report && <>
          <div className="report-heading">
            <h3>{heading} · Average</h3>
            <span>{report.count} {report.count === 1 ? 'reading' : 'readings'}</span>
          </div>
          <p className="report-range">{formatRange(report.startDate, report.endDate)}</p>
          {report.count === 0 ? <p className="readings-empty">{type === 'daily' ? 'No readings for this date.' : 'No readings in this period.'}</p> : <>
            <p className="report-average"><strong>{report.average.toFixed(1)}</strong><span>mg/dl</span></p>
            <dl className="report-extremes">
              <div><dt>Highest</dt><dd>{report.highest}</dd></div>
              <div><dt>Lowest</dt><dd>{report.lowest}</dd></div>
            </dl>
            {type === 'daily' && children}
            {type !== 'daily' && <GlucoseChart readings={report.readings} startDate={report.startDate} endDate={report.endDate} />}
          </>}
        </>}
        </div>
      </section>
    </section>
  );
}
