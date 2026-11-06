import Brand from './Brand.jsx';

export default function Home({ user, onLogout }) {
  return (
    <div className="home-layout">
      <header className="home-header">
        <Brand />
        <button className="secondary-button" onClick={onLogout}>Log out</button>
      </header>
      <main className="home-content">
        <h1>Hello, {user.name}.</h1>
        <p className="account-email">{user.email}</p>
      </main>
    </div>
  );
}
