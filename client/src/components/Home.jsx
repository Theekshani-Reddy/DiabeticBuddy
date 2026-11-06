import Brand from './Brand.jsx';
import Readings from './Readings.jsx';

export default function Home({ user, token, onSessionExpired, onLogout }) {
  return (
    <div className="home-layout">
      <header className="home-header">
        <Brand />
        <div className="profile-controls">
          <button className="secondary-button" onClick={onLogout}>Log out</button>
          <span className="profile-avatar" role="img" aria-label={`Signed in as ${user.name}`}>{user.name.trim().charAt(0).toUpperCase()}</span>
        </div>
      </header>
      <main className="home-content">
        <Readings user={user} token={token} onSessionExpired={onSessionExpired} />
      </main>
    </div>
  );
}
