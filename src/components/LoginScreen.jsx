'use client';
import React, { useState, useEffect, useRef } from 'react';
import * as api from '@/lib/api.js';

function initials(name) {
  return name.slice(0, 2).toUpperCase();
}

export default function LoginScreen({ onLogin }) {
  const [users, setUsers]         = useState([]);
  const [view, setView]           = useState('list'); // 'list' | 'login' | 'signup'
  const [selected, setSelected]   = useState(null);   // { id, username }
  const [password, setPassword]   = useState('');
  const [newUser, setNewUser]     = useState('');
  const [newPass, setNewPass]     = useState('');
  const [error, setError]         = useState(null);
  const [busy, setBusy]           = useState(false);
  const pwRef  = useRef(null);
  const nuRef  = useRef(null);

  useEffect(() => { api.getUsers().then(setUsers); }, []);

  useEffect(() => {
    if (view === 'login')  pwRef.current?.focus();
    if (view === 'signup') nuRef.current?.focus();
  }, [view]);

  const goList = () => { setView('list'); setError(null); };

  const pickUser = (u) => {
    setSelected(u); setPassword(''); setError(null); setView('login');
  };

  const handleLogin = async (e) => {
    e?.preventDefault();
    setBusy(true); setError(null);
    const res = await api.login(selected.username, password);
    setBusy(false);
    if (res.error) { setError('Wrong password'); return; }
    onLogin(res);
  };

  const handleSignup = async (e) => {
    e?.preventDefault();
    if (!newUser.trim() || !newPass.trim()) return;
    setBusy(true); setError(null);
    const res = await api.signup(newUser.trim(), newPass.trim());
    setBusy(false);
    if (res.error) {
      setError(
        res.error === 'Username taken'   ? 'That username is already taken' :
        res.error === 'User limit reached' ? 'Max 3 users allowed'          :
        res.error
      );
      return;
    }
    onLogin(res);
  };

  return (
    <div className="ls-screen">
      {/* Brand */}
      <div className="ls-brand">
        <svg viewBox="0 0 20 20" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--ink-2)' }}>
          <rect x="2.5" y="3.5" width="13" height="3" rx="1" />
          <rect x="2.5" y="8.5" width="13" height="3" rx="1" />
          <rect x="2.5" y="13.5" width="8"  height="3" rx="1" />
        </svg>
        <div>
          <div className="ls-brand-name">DameonNotes</div>
          <div className="ls-brand-sub">a todo journal</div>
        </div>
      </div>

      {/* User list */}
      {view === 'list' && (
        <div className="ls-body">
          <p className="ls-prompt">{users.length === 0 ? 'No accounts yet. Create one to get started.' : 'Who are you?'}</p>
          <div className="ls-users">
            {users.map(u => (
              <button key={u.id} className="ls-tile" onClick={() => pickUser(u)}>
                <div className="ls-avatar">{initials(String(u.username))}</div>
                <span className="ls-name">{u.username}</span>
              </button>
            ))}
            {users.length < 3 && (
              <button className="ls-tile ls-tile-new" onClick={() => { setError(null); setNewUser(''); setNewPass(''); setView('signup'); }}>
                <div className="ls-avatar ls-avatar-new">+</div>
                <span className="ls-name">New user</span>
              </button>
            )}
          </div>
          {users.length >= 3 && <p className="ls-cap-note">Max 3 users reached</p>}
        </div>
      )}

      {/* Password prompt */}
      {view === 'login' && (
        <div className="ls-body">
          <div className="ls-tile ls-tile-active">
            <div className="ls-avatar">{initials(selected.username)}</div>
            <span className="ls-name">{selected.username}</span>
          </div>
          <form className="ls-form" onSubmit={handleLogin}>
            <input
              ref={pwRef}
              type="password"
              className="ls-input"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            {error && <p className="ls-error">{error}</p>}
            <div className="ls-actions">
              <button type="button" className="composer-btn ghost" onClick={goList}>Back</button>
              <button type="submit" className="composer-btn primary" disabled={!password || busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Sign-up form */}
      {view === 'signup' && (
        <div className="ls-body">
          <p className="ls-prompt">Create account</p>
          <form className="ls-form" onSubmit={handleSignup}>
            <input
              ref={nuRef}
              type="text"
              className="ls-input"
              placeholder="Username"
              value={newUser}
              onChange={e => setNewUser(e.target.value)}
              autoComplete="off"
            />
            <input
              type="password"
              className="ls-input"
              placeholder="Password"
              value={newPass}
              onChange={e => setNewPass(e.target.value)}
            />
            {error && <p className="ls-error">{error}</p>}
            <div className="ls-actions">
              <button type="button" className="composer-btn ghost" onClick={goList}>Back</button>
              <button type="submit" className="composer-btn primary" disabled={!newUser.trim() || !newPass.trim() || busy}>
                {busy ? 'Creating…' : 'Create account'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
