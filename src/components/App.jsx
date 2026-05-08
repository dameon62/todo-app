'use client';
import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as api from '@/lib/api.js';
import LoginScreen from '@/components/LoginScreen.jsx';

// ---------- Helpers ----------
const DAY = 24 * 60 * 60 * 1000;
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// Parse a YYYY-MM-DD ISO date as a local-midnight Date. Avoids the
// `new Date('2026-05-08')` UTC-midnight pitfall which can shift days
// across timezones.
const parseLocalDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const todayMidnight = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const fmtDue = (iso) => {
  if (!iso) return 'No date';
  const target = parseLocalDate(iso);
  const diff = Math.round((target - todayMidnight()) / DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return target.toLocaleDateString(undefined, { weekday: 'long' });
  if (diff >= 7 && diff < 14) return 'Next week';
  if (diff >= 14 && diff < 31) return `In ${Math.round(diff / 7)} wks`;
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  return target.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const isOverdue = (iso) => !!iso && parseLocalDate(iso) < todayMidnight();

// Random task id — avoids collisions when two tasks are created in the same ms
const newTaskId = (colKey) => {
  const rand = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${colKey}-${rand}`;
};

// Swallow fire-and-forget mutation rejections so they don't surface as
// "Unhandled Promise Rejection" warnings. Logged for debugging.
const fireAndForget = (p) => { p.catch(err => console.warn('mutation failed:', err)); };

const EMPTY_BOARD = { short: [], medium: [], long: [] };

// Deterministic color from tag name — same name always gets the same color.
// 24 entries: 12 hue families × 2 shades (bright / dark). Brown sits next to
// orange (same hue band, lower chroma → desaturated warm); yellow sits between
// amber and lime. Bright/dark pairing keeps the palette lively on both themes.
const TAG_PALETTE = [
  // Red
  'oklch(0.70 0.20 18)',  'oklch(0.50 0.22 18)',
  // Orange
  'oklch(0.72 0.18 50)',  'oklch(0.56 0.18 48)',
  // Brown — desaturated warm (caramel / chocolate)
  'oklch(0.55 0.08 55)',  'oklch(0.38 0.07 50)',
  // Amber / gold
  'oklch(0.78 0.16 80)',  'oklch(0.55 0.16 75)',
  // Yellow — lemon / mustard
  'oklch(0.88 0.18 100)', 'oklch(0.68 0.15 95)',
  // Lime
  'oklch(0.80 0.18 120)', 'oklch(0.55 0.18 120)',
  // Green
  'oklch(0.72 0.18 145)', 'oklch(0.48 0.16 148)',
  // Teal
  'oklch(0.74 0.13 185)', 'oklch(0.50 0.13 188)',
  // Blue
  'oklch(0.70 0.16 220)', 'oklch(0.48 0.20 240)',
  // Indigo
  'oklch(0.68 0.17 265)', 'oklch(0.45 0.20 260)',
  // Purple
  'oklch(0.70 0.18 305)', 'oklch(0.48 0.22 298)',
  // Pink
  'oklch(0.72 0.18 335)', 'oklch(0.52 0.22 340)',
];
function tagColor(name) {
  if (!name) return 'var(--ink-3)';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[h % TAG_PALETTE.length];
}

const COLUMNS = [
  { key: 'short',  title: 'Short term',  subtitle: 'This month',   flex: 50, hue: 'green', noDueDate: false, split: true },
  { key: 'medium', title: 'Medium term', subtitle: 'This quarter', flex: 30, hue: 'yellow', noDueDate: false },
  { key: 'long',   title: 'Long term',   subtitle: 'This year',    flex: 20, hue: 'blue', noDueDate: true },
];

// Hue lookup for archived tasks — replaces the dropped `origin_hue` DB column
const HUE_BY_COL = { short: 'green', medium: 'yellow', long: 'blue' };


// ---------- Icons ----------
const Icon = {
  Check: (p) => (
    <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M2.5 7.2l3 2.8 6-6.4" />
    </svg>
  ),
  Plus: (p) => (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...p}>
      <path d="M8 3v10M3 8h10" />
    </svg>
  ),
  Search: (p) => (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...p}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  ),
  Sun: (p) => (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...p}>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.2 3.2l1 1M11.8 11.8l1 1M3.2 12.8l1-1M11.8 4.2l1-1" />
    </svg>
  ),
  Moon: (p) => (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M13 10a5.5 5.5 0 01-7-7 5.5 5.5 0 107 7z" />
    </svg>
  ),
  Archive: (p) => (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="2" y="3" width="12" height="3" rx="0.8" />
      <path d="M3 6v7h10V6M6.5 9h3" />
    </svg>
  ),
  Tag: (p) => (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M8 2H3v5l7 7 5-5-7-7z" />
      <circle cx="5.5" cy="4.5" r="0.7" fill="currentColor" />
    </svg>
  ),
  Calendar: (p) => (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="2" y="3.5" width="12" height="11" rx="1.5" />
      <path d="M2 6.5h12M5.5 2v2.5M10.5 2v2.5" />
    </svg>
  ),
  X: (p) => (
    <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  ),
  ChevronLeft: (p) => (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M10 3L5 8l5 5" />
    </svg>
  ),
  ChevronRight: (p) => (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M6 3l5 5-5 5" />
    </svg>
  ),
  Eye: (p) => (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  ),
  EyeOff: (p) => (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M2 2l12 12M6.8 6.9a2 2 0 002.3 2.3M4.8 4.2C3.2 5.2 2 6.9 2 8c1.3 2.4 3.5 4 6 4 1 0 2-.2 2.9-.6M8.5 4.1C10.8 4.5 12.7 6.1 14 8a8.6 8.6 0 01-1.4 2" />
    </svg>
  ),
};

// ---------- Popover (click-outside + ESC + hover-close) ----------
function usePopover(onClose) {
  const ref      = useRef(null);
  const timerRef = useRef(null);
  const closeRef = useRef(onClose);

  // Keep closeRef current without causing the listener effect to re-run.
  // This is critical: if the listener effect depended on onClose directly,
  // React re-renders (e.g. hoveredKey changing) would recreate onClose,
  // trigger cleanup, and cancel any pending close timer — keeping the popup open.
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const el      = ref.current;
    const trigger = el?.parentElement;

    const cancel        = () => clearTimeout(timerRef.current);
    const scheduleClose = () => { timerRef.current = setTimeout(() => closeRef.current(), 150); };
    const doClose       = () => closeRef.current();

    const onDoc          = (e) => { if (el && !el.contains(e.target)) doClose(); };
    const onKey          = (e) => { if (e.key === 'Escape') doClose(); };
    const onPopEnter     = ()  => cancel();
    const onPopLeave     = ()  => doClose();
    const onTriggerLeave = ()  => scheduleClose();

    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown',   onKey);
    el?.addEventListener('mouseenter',  onPopEnter);
    el?.addEventListener('mouseleave',  onPopLeave);
    trigger?.addEventListener('mouseleave', onTriggerLeave);

    return () => {
      cancel();
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown',   onKey);
      el?.removeEventListener('mouseenter',  onPopEnter);
      el?.removeEventListener('mouseleave',  onPopLeave);
      trigger?.removeEventListener('mouseleave', onTriggerLeave);
    };
  }, []); // empty deps — listeners set up once on mount; onClose always via ref

  // Switch to position:fixed (escapes overflow containers) and boost the
  // host column's z-index so the popup paints above sibling columns.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const trigger = el.parentElement;
    if (!trigger) return;

    const tr  = trigger.getBoundingClientRect();
    const er  = el.getBoundingClientRect();
    const vw  = window.innerWidth;
    const vh  = window.innerHeight;
    const m   = 8;
    const gap = 6;

    el.style.position = 'fixed';
    el.style.bottom   = 'auto';
    el.style.right    = 'auto';

    let left = tr.left;
    if (left + er.width > vw - m) left = vw - m - er.width;
    if (left < m) left = m;
    el.style.left = `${left}px`;

    let top = tr.bottom + gap;
    if (top + er.height > vh - m) top = tr.top - gap - er.height;
    if (top < m) top = m;
    el.style.top = `${top}px`;

    const cleanups = [];

    // Raise host column above sibling columns while popup is open
    let colEl = trigger;
    while (colEl && !colEl.classList.contains('col')) colEl = colEl.parentElement;
    if (colEl) {
      const prevZ = colEl.style.zIndex;
      colEl.style.zIndex = '50';
      cleanups.push(() => { colEl.style.zIndex = prevZ; });
    }

    // Also raise the host col-sub-pane above its sibling sub-pane.
    // Without this, in split-pane columns (Short term) the popup from the
    // left pane is painted behind the right pane's tasks (later in DOM order).
    let paneEl = trigger;
    while (paneEl && !paneEl.classList.contains('col-sub-pane')) paneEl = paneEl.parentElement;
    if (paneEl && paneEl !== colEl) {
      const prevZ = paneEl.style.zIndex;
      const prevP = paneEl.style.position;
      paneEl.style.position = 'relative';
      paneEl.style.zIndex   = '2';
      cleanups.push(() => { paneEl.style.zIndex = prevZ; paneEl.style.position = prevP; });
    }

    if (cleanups.length) return () => cleanups.forEach(fn => fn());
  }, []);

  return ref;
}

// ---------- Tag picker ----------
function TagPicker({ value, tags, onPick, onAddTag, onClose }) {
  const ref = usePopover(onClose);
  const [q, setQ] = useState('');
  const filtered = tags.filter((t) => t.toLowerCase().includes(q.toLowerCase()));
  const canCreate = q.trim() && !tags.find((t) => t.toLowerCase() === q.trim().toLowerCase());
  return (
    <div className="pop" ref={ref} role="dialog">
      <div className="pop-search">
        <Icon.Tag />
        <input autoFocus placeholder="Find or add tag…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="pop-list">
        {filtered.map((t) => (
          <button key={t} className={`pop-item ${t === value ? 'on' : ''}`} onClick={() => { onPick(t); onClose(); }}>
            <span className="tag-dot" style={{ background: tagColor(t) }} />
            <span>{t}</span>
            {t === value && <span className="pop-check"><Icon.Check /></span>}
          </button>
        ))}
        {canCreate && (
          <button className="pop-item create" onClick={() => { onAddTag(q.trim()); onPick(q.trim()); onClose(); }}>
            <Icon.Plus /> <span>Create "{q.trim()}"</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- Date picker (calendar) ----------
function DatePicker({ value, onPick, onClose }) {
  const ref = usePopover(onClose);
  const todayStr = todayISO();
  const init = value ? new Date(value + 'T12:00:00') : new Date();
  const [viewYear, setViewYear] = useState(init.getFullYear());
  const [viewMonth, setViewMonth] = useState(init.getMonth());

  const goBack = () => {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
    else setViewMonth(viewMonth - 1);
  };
  const goForward = () => {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
    else setViewMonth(viewMonth + 1);
  };

  const monthLabel = new Date(viewYear, viewMonth, 1)
    .toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const toISO = (d) =>
    `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  return (
    <div className="pop cal-pop" ref={ref} role="dialog">
      <div className="cal-nav-row">
        <button className="cal-nav-btn" onClick={goBack} aria-label="Previous month">
          <Icon.ChevronLeft />
        </button>
        <span className="cal-month-label">{monthLabel}</span>
        <button className="cal-nav-btn" onClick={goForward} aria-label="Next month">
          <Icon.ChevronRight />
        </button>
      </div>
      <div className="cal-grid">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <span key={d} className="cal-dow">{d}</span>
        ))}
        {Array.from({ length: firstDow }, (_, i) => <span key={`p${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const d = i + 1;
          const iso = toISO(d);
          return (
            <button
              key={iso}
              className={`cal-day${iso === value ? ' selected' : ''}${iso === todayStr ? ' today' : ''}`}
              onClick={() => { onPick(iso); onClose(); }}
            >
              {d}
            </button>
          );
        })}
      </div>
      {value && (
        <button className="pop-clear" onClick={() => { onPick(null); onClose(); }}>
          <Icon.X /> Clear due date
        </button>
      )}
    </div>
  );
}

// ---------- Section picker (mobile only) ----------
function SectionPicker({ mobileCol, setMobileCol }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !menuRef.current || !wrapRef.current) return;
    const tr = wrapRef.current.getBoundingClientRect();
    const er = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    menuRef.current.style.position = 'fixed';
    menuRef.current.style.top  = `${tr.bottom + 6}px`;
    let left = tr.right - er.width;
    if (left < 8) left = 8;
    menuRef.current.style.left = `${left}px`;
  }, [open]);

  const current = COLUMNS.find(c => c.key === mobileCol);

  return (
    <div className="section-picker" ref={wrapRef}>
      <button className="icon-btn section-picker-btn" data-hue={current.hue} onClick={() => setOpen(v => !v)}>
        <span className="col-dot section-picker-dot" />
        <span className="icon-btn-label">{current.title}</span>
        <Icon.ChevronRight style={{ transform: open ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div className="pop section-picker-menu" ref={menuRef} role="listbox">
          {COLUMNS.map(c => (
            <button
              key={c.key}
              className={`pop-item ${c.key === mobileCol ? 'on' : ''}`}
              data-hue={c.hue}
              onClick={() => { setMobileCol(c.key); setOpen(false); }}
            >
              <span className="col-dot" style={{ width: 8, height: 8, flexShrink: 0 }} />
              <span>{c.title}</span>
              {c.key === mobileCol && <span className="pop-check"><Icon.Check /></span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Avatar dropdown ----------
function AvatarMenu({ menuRef, user, onLogout, onDelete }) {
  const popRef = useRef(null);

  useLayoutEffect(() => {
    const el = popRef.current;
    const trigger = menuRef.current;
    if (!el || !trigger) return;
    const tr = trigger.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const vw = window.innerWidth;
    let left = tr.right - er.width;
    if (left < 8) left = 8;
    el.style.left = `${left}px`;
    el.style.top  = `${tr.bottom + 6}px`;
  }, [menuRef]);

  return (
    <div className="avatar-menu" ref={popRef}>
      <div className="avatar-menu-name">{user?.username}</div>
      <button className="avatar-menu-item" onClick={onLogout}>Log out</button>
      <button className="avatar-menu-item danger" onClick={onDelete}>Delete account</button>
    </div>
  );
}

// ---------- Delete-account confirmation modal ----------
function DeleteConfirmModal({ username, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay">
      <div className="modal-box" role="dialog" aria-modal="true">
        <div className="modal-title">Delete account?</div>
        <p className="modal-body">
          This permanently deletes <strong>{username}</strong> and all their tasks, tags, and settings. This cannot be undone.
        </p>
        <div className="modal-actions">
          <button className="composer-btn ghost" onClick={onCancel}>Cancel</button>
          <button className="composer-btn danger" onClick={onConfirm}>Delete account</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Top bar ----------
function TopBar({ theme, onToggleTheme, query, setQuery, view, setView, archiveCount, user, onLogout, onDeleteAccount, mobileCol, setMobileCol, showClosed, setShowClosed }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onMouse = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    const onKey   = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown',   onKey);
    return () => {
      document.removeEventListener('mousedown', onMouse);
      document.removeEventListener('keydown',   onKey);
    };
  }, [menuOpen]);

  const handleDelete = async () => {
    await onDeleteAccount();
    setConfirmDelete(false);
  };

  return (
    <>
    {confirmDelete && (
      <DeleteConfirmModal
        username={user?.username}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    )}
    <header className="topbar">
      <div className="left-cluster">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2.5" y="3.5" width="13" height="3" rx="1" />
              <rect x="2.5" y="8.5" width="13" height="3" rx="1" />
              <rect x="2.5" y="13.5" width="8" height="3" rx="1" />
              <path d="M17 6l1 1 2-2.2M17 11l1 1 2-2.2M13 16l1 1 2-2.2" />
            </svg>
          </div>
          <div className="brand-text">
            <div className="brand-name">DameonNotes</div>
            <div className="brand-sub">a todo journal</div>
          </div>
        </div>

        <nav className="nav">
          <button className={`nav-link ${view === 'board' ? 'active' : ''}`} onClick={() => setView('board')}>Home</button>
          <button className={`nav-link ${view === 'archive' ? 'active' : ''}`} onClick={() => setView('archive')}>
            <Icon.Archive /> <span>Archive</span>
            {archiveCount > 0 && <span className="nav-count">{archiveCount}</span>}
          </button>
          <button className={`nav-link ${view === 'tags' ? 'active' : ''}`} onClick={() => setView('tags')}>
            <Icon.Tag /> <span>Tags</span>
          </button>
        </nav>

        <div className="search">
          <Icon.Search />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks, tags…" />
          <kbd>⌘K</kbd>
        </div>
      </div>

      <div className="quote" aria-label="House motto">
        <span className="quote-mark" aria-hidden>[</span>
        <span className="quote-word w-d">Discipline</span>
        <span className="quote-sep" aria-hidden>/</span>
        <span className="quote-word w-de">Decisiveness</span>
        <span className="quote-sep" aria-hidden>/</span>
        <span className="quote-word w-dd">Dedication</span>
        <span className="quote-sep" aria-hidden>/</span>
        <span className="quote-word w-e">Exploration</span>
        <span className="quote-mark" aria-hidden>]</span>
      </div>

      <div className="top-actions">
        <button
          className="icon-btn"
          onClick={() => setShowClosed(v => !v)}
          title={showClosed ? 'Hide completed & cancelled' : 'Show all tasks'}
        >
          {showClosed ? <Icon.Eye /> : <Icon.EyeOff />}
          <span className="icon-btn-label">{showClosed ? 'All' : 'Open'}</span>
        </button>
        <SectionPicker mobileCol={mobileCol} setMobileCol={setMobileCol} />
        <button className="icon-btn theme-btn" onClick={onToggleTheme} title="Toggle theme">
          {theme === 'dark' ? <Icon.Moon /> : <Icon.Sun />}
          <span className="icon-btn-label">{theme === 'dark' ? 'Dark' : 'Light'}</span>
        </button>
        <div className="avatar-wrap" ref={menuRef}>
          <button className="avatar" onClick={() => setMenuOpen(v => !v)}>
            <span>{user ? user.username.slice(0, 2).toUpperCase() : 'DN'}</span>
          </button>
          {menuOpen && (
            <AvatarMenu menuRef={menuRef} user={user} onLogout={() => { setMenuOpen(false); onLogout(); }} onDelete={() => { setMenuOpen(false); setConfirmDelete(true); }} />
          )}
        </div>
      </div>
    </header>
    </>
  );
}

// ---------- Task row ----------
function TaskRow({ task, colHue, tags, onToggle, onCancelTask, onPatch, onAddTag, archiveView, hideDate }) {
  const [tagOpen, setTagOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.text);

  const overdue   = !task.done && !task.cancelled && isOverdue(task.due);
  const readOnly  = !!archiveView || task.done || task.cancelled;

  const saveText = () => {
    const v = draft.trim();
    if (v && v !== task.text) onPatch(task.id, { text: v });
    else setDraft(task.text);
    setEditing(false);
  };

  return (
    <li className={`task ${task.done ? 'is-done' : ''} ${task.cancelled ? 'is-cancelled' : ''} ${overdue ? 'is-overdue' : ''} ${readOnly ? 'read-only' : ''}`} data-hue={colHue}>
      <button
        className={`check ${task.done ? 'on' : ''} ${task.cancelled ? 'cancelled' : ''}`}
        onClick={() => { if (!task.done && !task.cancelled) onToggle(task.id); }}
        disabled={task.done || task.cancelled}
        aria-label={task.cancelled ? 'Cancelled' : 'Mark complete'}
      >
        {task.cancelled ? <Icon.X width="14" height="14" className="check-icon" /> : <Icon.Check className="check-icon" />}
      </button>

      <div className="task-body">
        {editing && !readOnly && !task.done && !task.cancelled ? (
          <input
            autoFocus
            className="task-text-input"
            value={draft}
            maxLength={150}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={saveText}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveText();
              if (e.key === 'Escape') { setDraft(task.text); setEditing(false); }
            }}
          />
        ) : (
          <div
            className="task-text"
            onClick={() => { if (!readOnly && !task.done && !task.cancelled) { setDraft(task.text); setEditing(true); } }}
            title={readOnly || task.done ? '' : 'Click to edit'}
          >
            {task.text}
          </div>
        )}
        <div className="task-meta">
          <div className="meta-chip-wrap">
            <button
              className="meta-chip tag-chip"
              disabled={readOnly}
              onClick={(e) => { if (readOnly) return; e.stopPropagation(); setTagOpen((v) => !v); setDateOpen(false); }}
            >
              <span className="tag-dot" style={{ background: tagColor(task.tag) }} />
              <span>{task.tag || 'No tag'}</span>
            </button>
            {tagOpen && !readOnly && (
              <TagPicker
                value={task.tag}
                tags={tags}
                onPick={(t) => onPatch(task.id, { tag: t })}
                onAddTag={onAddTag}
                onClose={() => setTagOpen(false)}
              />
            )}
          </div>

          <span className="dot-sep">·</span>

          {!hideDate && (
            <div className="meta-chip-wrap">
              <button
                className={`meta-chip date-chip ${overdue ? 'overdue' : ''}`}
                disabled={readOnly}
                onClick={(e) => { if (readOnly) return; e.stopPropagation(); setDateOpen((v) => !v); setTagOpen(false); }}
              >
                <Icon.Calendar />
                <span>{fmtDue(task.due)}</span>
              </button>
              {dateOpen && !readOnly && (
                <DatePicker
                  value={task.due}
                  onPick={(iso) => onPatch(task.id, { due: iso })}
                  onClose={() => setDateOpen(false)}
                />
              )}
            </div>
          )}

          {archiveView && task.completedAt && (
            <>
              <span className="dot-sep">·</span>
              <span className="archived-ago">
                {task.cancelled ? 'cancelled' : 'archived'} {Math.round((Date.now() - task.completedAt) / DAY)}d ago
              </span>
            </>
          )}
        </div>
      </div>
      {!readOnly && !task.done && !task.cancelled && (
        <button
          className="task-cancel-btn"
          onClick={() => onCancelTask(task.id)}
          title="Cancel task"
        >
          <Icon.X />
        </button>
      )}
    </li>
  );
}

// ---------- Inline new-task composer ----------
function NewTaskComposer({ colKey, tags, onAdd, onAddTag, onCancel, noDueDate }) {
  const [text, setText] = useState('');
  const [tag, setTag] = useState(null);
  const [due, setDue] = useState(null);
  const [tagOpen, setTagOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = () => {
    const t = text.trim();
    if (!t) { onCancel(); return; }
    onAdd(colKey, { text: t, tag, due: noDueDate ? null : due });
    onCancel();
  };

  return (
    <div className="composer">
      <div className="composer-row">
        <div className="check" />
        <input
          ref={inputRef}
          value={text}
          maxLength={150}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') onCancel();
          }}
          placeholder="What needs doing?"
        />
        {text.length > 120 && (
          <span className="composer-charcount" style={{ color: text.length >= 150 ? 'var(--hue-red-ink)' : 'var(--ink-3)' }}>
            {150 - text.length}
          </span>
        )}
      </div>
      <div className="composer-meta">
        <div className="composer-chips">
          <div className="meta-chip-wrap">
            <button className="meta-chip tag-chip" onClick={() => { setTagOpen((v) => !v); setDateOpen(false); }}>
              <span className="tag-dot" style={{ background: tagColor(tag) }} />
              <span>{tag || 'Tag'}</span>
            </button>
            {tagOpen && <TagPicker value={tag} tags={tags} onPick={setTag} onAddTag={onAddTag} onClose={() => setTagOpen(false)} />}
          </div>
          {!noDueDate && (
            <div className="meta-chip-wrap">
              <button className="meta-chip date-chip" onClick={() => { setDateOpen((v) => !v); setTagOpen(false); }}>
                <Icon.Calendar />
                <span>{fmtDue(due)}</span>
              </button>
              {dateOpen && <DatePicker value={due} onPick={setDue} onClose={() => setDateOpen(false)} />}
            </div>
          )}
        </div>
        <div className="composer-actions">
          <button className="composer-btn ghost" onClick={onCancel}>Cancel</button>
          <button className="composer-btn primary" onClick={submit} disabled={!text.trim()}>Add task</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Column ----------
function Column({ col, tasks, hoveredKey, setHoveredKey, tags, onToggle, onCancelTask, onPatch, onAdd, onAddTag, popStrength }) {
  const [adding, setAdding] = useState(false);

  const open = hoveredKey === col.key;
  const dimmed = hoveredKey && hoveredKey !== col.key;

  const remaining = tasks.filter((t) => !t.done && !t.cancelled).length;
  const total = tasks.length;

  const baseGrow = col.flex;
  const hoverBoost = open ? baseGrow * (popStrength / 100) : 0;
  const grow = baseGrow + hoverBoost;

  const split = col.split;
  let groupA = [], groupB = [];
  if (split) {
    tasks.forEach((t, i) => {
      if (i % 2 === 0) groupA.push(t);
      else groupB.push(t);
    });
  }

  const renderTaskList = (list) => (
    <ul className="tasks">
      {list.map((t) => (
        <TaskRow
          key={t.id}
          task={t}
          colHue={col.hue}
          tags={tags}
          onToggle={onToggle}
          onCancelTask={onCancelTask}
          onPatch={onPatch}
          onAddTag={onAddTag}
          hideDate={col.noDueDate}
        />
      ))}
      {list.length === 0 && (
        <li className="empty">&nbsp;</li>
      )}
    </ul>
  );

  return (
    <section
      className={`col ${open ? 'is-open' : ''} ${dimmed ? 'is-dim' : ''} ${split ? 'has-split' : ''}`}
      data-hue={col.hue}
      data-col={col.key}
      style={{ flexGrow: grow, flexBasis: 0 }}
      onMouseEnter={() => setHoveredKey(col.key)}
      onMouseLeave={() => setHoveredKey(null)}
    >
      <div className="col-inner">
        <header className="col-head">
          <div className="col-head-main">
            <div className="col-title-row">
              <span className="col-dot" />
              <h2 className="col-title">{col.title}</h2>
            </div>
            <div className="col-sub">{col.subtitle}</div>
          </div>
          {!col.noDueDate && (
            <div className="col-stat">
              <div className="col-stat-num">{remaining}</div>
              <div className="col-stat-label">of {total} open</div>
            </div>
          )}
        </header>

        {split ? (
          <div className="col-split">
            <div className="col-sub-pane">{renderTaskList(groupA)}</div>
            <div className="col-sub-pane">{renderTaskList(groupB)}</div>
          </div>
        ) : (
          renderTaskList(tasks)
        )}

        {adding ? (
          <NewTaskComposer
            colKey={col.key}
            tags={tags}
            onAdd={onAdd}
            onAddTag={onAddTag}
            onCancel={() => setAdding(false)}
            noDueDate={col.noDueDate}
          />
        ) : (
          <button className="add-row" onClick={() => setAdding(true)}>
            <span className="plus"><Icon.Plus /></span>
            <span>Add a {col.title.toLowerCase()} task</span>
          </button>
        )}
      </div>
    </section>
  );
}

// ---------- Tags view ----------
function TagsView({ tags, board, onAddTag, onRenameTag, onDeleteTag }) {
  const [newTag, setNewTag] = useState('');
  const counts = useMemo(() => {
    const c = {};
    for (const k of Object.keys(board)) for (const t of board[k]) if (t.tag) c[t.tag] = (c[t.tag] || 0) + 1;
    return c;
  }, [board]);
  const submit = () => {
    const v = newTag.trim();
    if (!v) return;
    onAddTag(v);
    setNewTag('');
  };
  return (
    <div className="archive">
      <div className="archive-inner">
        <div className="archive-head">
          <div>
            <h2 className="archive-title"><Icon.Tag /> Tags</h2>
            <div className="archive-sub">Create, rename and remove tags. Task counts update live.</div>
          </div>
        </div>
        <div className="tag-add">
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder="New tag name…"
          />
          <button className="composer-btn primary" onClick={submit} disabled={!newTag.trim()}>
            <Icon.Plus /> Add tag
          </button>
        </div>
        <ul className="tag-list">
          {tags.map((t) => (
            <TagItem key={t} name={t} count={counts[t] || 0} onRename={(n) => onRenameTag(t, n)} onDelete={() => onDeleteTag(t)} />
          ))}
          {tags.length === 0 && <li className="empty">No tags yet. Add one above.</li>}
        </ul>
      </div>
    </div>
  );
}

function TagItem({ name, count, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const save = () => {
    const v = draft.trim();
    if (v && v !== name) onRename(v);
    setEditing(false);
  };
  return (
    <li className="tag-item">
      <span className="tag-dot" style={{ background: tagColor(name) }} />
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setDraft(name); setEditing(false); } }}
          className="tag-item-input"
        />
      ) : (
        <span className="tag-item-name" onClick={() => { setDraft(name); setEditing(true); }}>{name}</span>
      )}
      <span className="tag-item-count">{count} {count === 1 ? 'task' : 'tasks'}</span>
      <button className="tag-item-del" onClick={onDelete} title="Delete tag"><Icon.X /></button>
    </li>
  );
}

// ---------- Archive view ----------
function ArchiveView({ archived }) {
  return (
    <div className="archive">
      <div className="archive-inner">
        <div className="archive-head">
          <div>
            <h2 className="archive-title">
              <Icon.Archive /> Archive
            </h2>
            <div className="archive-sub">Completed and cancelled tasks older than 30 days — auto-archived, read-only</div>
          </div>
        </div>
        {archived.length === 0 ? (
          <div className="archive-empty">
            <div className="archive-empty-icon"><Icon.Archive /></div>
            <div>Nothing archived yet.</div>
            <div className="archive-empty-hint">Tasks you complete or cancel are automatically archived 30 days later.</div>
          </div>
        ) : (
          <ul className="tasks archive-list">
            {archived.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                colHue={HUE_BY_COL[t.colKey] || 'blue'}
                archiveView
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const POP_STRENGTH = 35;

// ---------- App ----------
export default function App() {
  const [user, setUser]       = useState(null); // { id, username }
  const [theme, setTheme]     = useState('dark');
  const [board, setBoard]     = useState(EMPTY_BOARD);
  const [archive, setArchive] = useState([]);
  const [tags, setTags]       = useState([]);
  const [loading, setLoading] = useState(true);

  const [hoveredKey, setHoveredKey] = useState(null);
  const [query, setQuery]           = useState('');
  const [view, setView]             = useState('board');

  // Check for persisted session, then load data
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const raw = localStorage.getItem('dameon_session');
        if (raw) {
          const session = JSON.parse(raw);
          api.setUserId(session.id);
          const [boardData, archiveData, tagsData, themeData] = await Promise.all([
            api.getBoard(), api.getArchive(), api.getTags(), api.getTheme(),
          ]);
          if (cancelled) return;
          setBoard(boardData);
          setArchive(archiveData);
          setTags(tagsData);
          if (themeData) setTheme(themeData);
          setUser(session);
        }
      } catch {
        localStorage.removeItem('dameon_session');
        api.clearUserId();
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    init();
    return () => { cancelled = true; };
  }, []);

  const handleLogin = async (userData) => {
    api.setUserId(userData.id);
    localStorage.setItem('dameon_session', JSON.stringify(userData));
    const [boardData, archiveData, tagsData, themeData] = await Promise.all([
      api.getBoard(), api.getArchive(), api.getTags(), api.getTheme(),
    ]);
    setBoard(boardData);
    setArchive(archiveData);
    setTags(tagsData);
    if (themeData) setTheme(themeData);
    setUser(userData);
    setView('board');
  };

  const handleLogout = () => {
    api.clearUserId();
    localStorage.removeItem('dameon_session');
    setUser(null);
    setBoard(EMPTY_BOARD);
    setArchive([]);
    setTags([]);
    setTheme('dark');
    setView('board');
  };

  const handleDeleteAccount = async () => {
    await api.deleteAccount();
    handleLogout();
  };

  // Sync theme to document
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  const toggleTheme = () => setTheme((t) => {
    const next = t === 'dark' ? 'light' : 'dark';
    fireAndForget(api.setTheme(next));
    return next;
  });

  const onToggle = (id) => {
    const now = Date.now();
    setBoard((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        next[k] = next[k].map((t) =>
          t.id === id && !t.done ? { ...t, done: true, completedAt: now } : t
        );
      }
      return next;
    });
    fireAndForget(api.patchTask(id, { done: 1, completed_at: now }));
  };

  const onCancelTask = (id) => {
    const now = Date.now();
    setBoard((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        next[k] = next[k].map((t) =>
          t.id === id && !t.done && !t.cancelled ? { ...t, cancelled: true, completedAt: now } : t
        );
      }
      return next;
    });
    fireAndForget(api.patchTask(id, { cancelled: 1, completed_at: now }));
  };

  const onPatch = (id, patch) => {
    setBoard((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) next[k] = next[k].map((t) => (t.id === id ? { ...t, ...patch } : t));
      return next;
    });
    setArchive((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    fireAndForget(api.patchTask(id, patch));
  };

  const onAdd = (colKey, { text, tag, due }) => {
    const id = newTaskId(colKey);
    setBoard((prev) => ({
      ...prev,
      [colKey]: [
        { id, text, tag, due, done: false, cancelled: false, priority: 'med', completedAt: null },
        ...prev[colKey],
      ],
    }));
    fireAndForget(api.createTask({ id, col_key: colKey, text, tag, due, priority: 'med' }));
  };

  const onAddTag = (t) => {
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
    fireAndForget(api.addTag(t));
  };

  const onRenameTag = async (oldName, newName) => {
    // Optimistic update
    setTags((prev) => prev.map((t) => (t === oldName ? newName : t)));
    setBoard((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) next[k] = next[k].map((t) => (t.tag === oldName ? { ...t, tag: newName } : t));
      return next;
    });
    try {
      await api.renameTag(oldName, newName);
    } catch (err) {
      // Resync from server and surface the reason
      try {
        const [tagsData, boardData] = await Promise.all([api.getTags(), api.getBoard()]);
        setTags(tagsData);
        setBoard(boardData);
      } catch { /* ignore — leave optimistic state if resync also fails */ }
      if (err?.status === 409) alert(`A tag named "${newName}" already exists.`);
      else if (err?.status === 400) alert('Invalid tag name.');
      else alert('Could not rename tag.');
    }
  };

  const onDeleteTag = (name) => {
    setTags((prev) => prev.filter((t) => t !== name));
    setBoard((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) next[k] = next[k].map((t) => (t.tag === name ? { ...t, tag: null } : t));
      return next;
    });
    fireAndForget(api.deleteTag(name));
  };

  const [mobileCol, setMobileCol]   = useState('short');
  const [showClosed, setShowClosed] = useState(true);

  const filterAndSort = (list) => {
    const q = query.trim().toLowerCase();
    let out = q
      ? list.filter((t) => t.text.toLowerCase().includes(q) || (t.tag || '').toLowerCase().includes(q))
      : list;
    if (!showClosed) out = out.filter((t) => !t.done && !t.cancelled);
    return out;
  };

  const allTasks      = Object.values(board).flat();
  const totalOpen     = allTasks.filter((t) => !t.done && !t.cancelled).length;
  const totalDone     = allTasks.filter((t) => t.done).length;
  const totalCancelled = allTasks.filter((t) => t.cancelled).length;

  if (loading) {
    return (
      <div className="app" style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
        <span style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>Loading…</span>
      </div>
    );
  }

  if (!user) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div className="app">
      <TopBar
        theme={theme}
        onToggleTheme={toggleTheme}
        query={query}
        setQuery={setQuery}
        view={view}
        setView={setView}
        archiveCount={archive.length}
        user={user}
        onLogout={handleLogout}
        onDeleteAccount={handleDeleteAccount}
        mobileCol={mobileCol}
        setMobileCol={setMobileCol}
        showClosed={showClosed}
        setShowClosed={setShowClosed}
      />

      {view === 'board' ? (
        <main className={`board ${hoveredKey ? 'has-hover' : ''}`} data-mobile-col={mobileCol} onMouseLeave={() => setHoveredKey(null)}>
          {COLUMNS.map((col) => (
            <React.Fragment key={col.key}>
              <Column
                col={col}
                tasks={filterAndSort(board[col.key])}
                hoveredKey={hoveredKey}
                setHoveredKey={setHoveredKey}
                tags={tags}
                onToggle={onToggle}
                onCancelTask={onCancelTask}
                onPatch={onPatch}
                onAdd={onAdd}
                onAddTag={onAddTag}
                popStrength={POP_STRENGTH}
              />
            </React.Fragment>
          ))}
        </main>
      ) : view === 'archive' ? (
        <ArchiveView archived={archive} />
      ) : (
        <TagsView tags={tags} board={board} onAddTag={onAddTag} onRenameTag={onRenameTag} onDeleteTag={onDeleteTag} />
      )}

      <footer className="statusbar">
        <span>{totalOpen} open</span>
        <span className="dot-sep">·</span>
        <span>{totalDone} done</span>
        <span className="dot-sep">·</span>
        <span>{totalCancelled} cancelled</span>
        <span className="dot-sep">·</span>
        <span>{archive.length} archived</span>
        <span className="spacer" />
        <span>⌘N new · ⌘K search · Space complete</span>
      </footer>

    </div>
  );
}
