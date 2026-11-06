import { useEffect, useState } from 'react';

export default function App() {
  const [apiStatus, setApiStatus] = useState('Checking API connection...');

  useEffect(() => {
    const controller = new AbortController();

    async function checkApi() {
      try {
        const response = await fetch('/api/health', { signal: controller.signal });
        if (!response.ok) throw new Error('Health check failed');
        const data = await response.json();
        if (data.status !== 'ok') throw new Error('Unexpected health response');
        setApiStatus('API connected.');
      } catch (error) {
        if (error.name !== 'AbortError') {
          setApiStatus('API unavailable. Start the Express server and refresh.');
        }
      }
    }

    checkApi();
    return () => controller.abort();
  }, []);

  return (
    <main className="welcome">
      <p className="eyebrow">BLOOD GLUCOSE TRACKER</p>
      <h1>Sweety</h1>
      <p className="intro">A little space for your daily readings.</p>
      <section className="setup-card" aria-labelledby="setup-title">
        <h2 id="setup-title">Our starting point</h2>
        <p>The project is set up. Sign up, readings, and reports are coming in the next stages.</p>
        <p className="status" role="status">{apiStatus}</p>
      </section>
    </main>
  );
}
