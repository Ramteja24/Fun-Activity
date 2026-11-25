import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store';
import { IconX } from './Icons';

/** Header control: "Admin login" for players (outside a room), or the admin's name and "Log out". */
export function AdminControl() {
  const admin = useGame((s) => s.admin);
  const inRoom = useGame((s) => !!s.room && !!s.me);
  const demo = useGame((s) => s.demo);
  const setLoginOpen = useGame((s) => s.setLoginOpen);
  const logout = useGame((s) => s.logout);
  if (demo) return null;
  if (admin) {
    return (
      <>
        <span className="pill pill-brand admin-chip" title={`Logged in as the admin (${admin.username})`}>
          <span>Admin</span>
          <span className="admin-chip-name">· {admin.username}</span>
        </span>
        {!inRoom && (
          <button type="button" className="lb-leave" onClick={logout}>
            <span>Log out</span>
          </button>
        )}
      </>
    );
  }
  if (inRoom) return null;
  return (
    <button type="button" className="lb-leave" onClick={() => setLoginOpen(true)} title="Only the admin can create rooms and run the games">
      <span>Admin login</span>
    </button>
  );
}

/** The admin login dialog. */
export function AdminLogin() {
  const open = useGame((s) => s.loginOpen);
  const setLoginOpen = useGame((s) => s.setLoginOpen);
  const login = useGame((s) => s.login);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const userRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPassword('');
    userRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLoginOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setLoginOpen]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !username.trim() || !password) return;
    setBusy(true);
    const err = await login(username.trim(), password);
    setBusy(false);
    if (err) {
      setError(err);
      setPassword('');
    }
  };

  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && setLoginOpen(false)}>
      <div className="modal card" role="dialog" aria-modal="true" aria-labelledby="admin-login-title">
        <div className="modal-head">
          <div>
            <h2 id="admin-login-title" className="lp-card-title">
              Admin login
            </h2>
            <p className="modal-sub">Only the admin can create rooms and run the games. Players just join with a room code.</p>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={() => setLoginOpen(false)}>
            <IconX width={14} height={14} />
          </button>
        </div>
        <form className="lp-form" onSubmit={submit}>
          <label className="lp-fieldset">
            <span className="lp-label">Username</span>
            <input ref={userRef} className="field" name="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="lp-fieldset">
            <span className="lp-label">Password</span>
            <input className="field" type="password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && (
            <p className="modal-error" role="alert">
              {error}
            </p>
          )}
          <button className="lp-go" aria-label="Log in" disabled={busy || !username.trim() || !password}>
            <span className="lp-go-in">
              {busy && <span className="spinner" />}
              Log in
            </span>
          </button>
        </form>
      </div>
    </div>
  );
}
