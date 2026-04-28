import ScoutWordmark from '../ScoutWordmark.jsx';

export default function NavPanel({
  open, closing, onDismiss,
  theme, userEmail,
  onAbout, onAccount, onSettings, onDev, onSignOut,
}) {
  if (!open) return null;
  return (
    <div className="nav-panel-backdrop" onClick={onDismiss}>
      <div className={`nav-panel${closing?' is-closing':''}`} onClick={e => e.stopPropagation()}>
        <div className="nav-panel-header">
          <span className="nav-panel-wordmark">
            <ScoutWordmark size={26} color={theme === 'dark' ? '#FFFCF6' : '#0C0C0C'} hideRule />
          </span>
        </div>
        <nav className="nav-panel-nav">
          <button className="nav-panel-item" onClick={() => { onDismiss(); setTimeout(onAbout, 310); }}>About</button>
          <button className="nav-panel-item" onClick={() => { onDismiss(); setTimeout(onAccount, 310); }}>Account</button>
          <button className="nav-panel-item" onClick={() => { onDismiss(); setTimeout(onSettings, 310); }}>Settings</button>
          {userEmail === 'ecrissman@gmail.com' && (
            <button className="nav-panel-item" onClick={() => { onDismiss(); setTimeout(onDev, 310); }}>Developer</button>
          )}
          <hr style={{border:'none',borderTop:'1px solid var(--border)',margin:'4px 0'}}/>
          <button className="nav-panel-item" style={{color:'var(--accent)'}} onClick={() => { onDismiss(); onSignOut(); }}>Sign Out</button>
        </nav>
      </div>
    </div>
  );
}
