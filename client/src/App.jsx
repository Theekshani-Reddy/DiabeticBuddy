import AuthForm from './components/AuthForm.jsx';
import Brand from './components/Brand.jsx';
import Home from './components/Home.jsx';
import { useAuth } from './hooks/useAuth.js';

export default function App() {
  const auth = useAuth();
  if (auth.user) return <Home user={auth.user} token={auth.token} onSessionExpired={auth.expireSession} onLogout={() => auth.logout()} />;

  return (
    <div className="auth-layout">
      <aside className="story-panel" aria-label="About Sweety">
        <Brand />
        <div className="story-content">
          <h2>Blood glucose<br />tracker.</h2>
        </div>
      </aside>
      <main className="form-panel">
        {auth.checking ? (
          <section className="session-panel" aria-labelledby="session-title">
            <h1 id="session-title">{auth.restoreError ? 'Connection error' : 'Loading…'}</h1>
            <p role={auth.restoreError ? 'alert' : 'status'}>{auth.restoreError || 'Checking your session.'}</p>
            {auth.restoreError && <div className="session-actions">
              <button className="primary-button" onClick={auth.retrySession}>Try again</button>
              <button className="secondary-button" onClick={() => auth.logout()}>Back to log in</button>
            </div>}
          </section>
        ) : <AuthForm onSuccess={auth.signIn} notice={auth.notice} />}
      </main>
    </div>
  );
}
