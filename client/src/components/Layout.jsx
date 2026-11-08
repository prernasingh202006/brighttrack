import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-display text-xl font-bold" aria-label="BrightTrack home">
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
        <rect width="32" height="32" rx="8" className="fill-night-900 dark:fill-night-700" />
        <path d="M9 26V9a5 5 0 0 1 5-5h4" fill="none" stroke="#ffbf3a" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M14 11h9l-2 5h-5z" fill="#ffbf3a" />
      </svg>
      <span>
        Bright<span className="text-sodium-700 dark:text-sodium-400">Track</span>
      </span>
    </Link>
  );
}

const linkCls = ({ isActive }) =>
  `rounded-lg px-3 py-2 text-sm font-bold transition ${isActive ? 'bg-sodium-500/20 text-night-900 dark:text-sodium-300' : 'hover:bg-night-900/5 dark:hover:bg-white/10'}`;

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  async function onLogout() {
    await logout();
    toast.success('Logged out');
    setOpen(false);
    navigate('/');
  }

  const links = (
    <>
      <NavLink to="/" end className={linkCls} onClick={() => setOpen(false)}>Home</NavLink>
      <NavLink to="/track" className={linkCls} onClick={() => setOpen(false)}>Track a complaint</NavLink>
      {user && <NavLink to="/report" className={linkCls} onClick={() => setOpen(false)}>Report a fault</NavLink>}
      {user && <NavLink to="/my-complaints" className={linkCls} onClick={() => setOpen(false)}>My complaints</NavLink>}
      {user?.role === 'admin' && <NavLink to="/admin" end className={linkCls} onClick={() => setOpen(false)}>Admin</NavLink>}
      {user?.role === 'admin' && <NavLink to="/admin/technicians" className={linkCls} onClick={() => setOpen(false)}>Technicians</NavLink>}
    </>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-sodium-500 focus:px-4 focus:py-2 focus:font-bold focus:text-night-950">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-night-900/10 bg-paper/90 backdrop-blur dark:border-white/10 dark:bg-night-950/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Logo />
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">{links}</nav>
          <div className="flex items-center gap-2">
            <button type="button" onClick={toggle} className="btn-secondary !px-3" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
              <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
            </button>
            <div className="hidden items-center gap-2 md:flex">
              {user ? (
                <>
                  <span className="muted max-w-[10rem] truncate text-sm">{user.name}</span>
                  <button type="button" onClick={onLogout} className="btn-secondary">Log out</button>
                </>
              ) : (
                <>
                  <Link to="/login" className="btn-secondary">Log in</Link>
                  <Link to="/register" className="btn-primary">Sign up</Link>
                </>
              )}
            </div>
            <button type="button" className="btn-secondary md:hidden" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((o) => !o)}>
              {open ? 'Close' : 'Menu'}
            </button>
          </div>
        </div>
        {open && (
          <div id="mobile-menu" className="border-t border-night-900/10 px-4 pb-4 pt-2 dark:border-white/10 md:hidden">
            <nav aria-label="Mobile" className="flex flex-col gap-1">{links}</nav>
            <div className="mt-3 flex gap-2">
              {user ? (
                <button type="button" onClick={onLogout} className="btn-secondary flex-1">Log out ({user.name})</button>
              ) : (
                <>
                  <Link to="/login" onClick={() => setOpen(false)} className="btn-secondary flex-1">Log in</Link>
                  <Link to="/register" onClick={() => setOpen(false)} className="btn-primary flex-1">Sign up</Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-night-900/10 py-6 text-center text-sm muted dark:border-white/10">
        BrightTrack · Safer streets start with working lights.
      </footer>
    </div>
  );
}
