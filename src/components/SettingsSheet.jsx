import { isPushSupported, maybePromptForPush, unsubscribePush } from '../push';
import { setAnalyticsOptOut } from '../analytics';
import { PERSONAS } from '../personas';

export default function SettingsSheet({
  open, onClose,
  themePref, setThemePref,
  pushEnabled, setPushEnabled,
  analyticsEnabled, setAnalyticsEnabled,
  briefVoice, setBriefVoice,
  onOpenLegal,
}) {
  if (!open) return null;
  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-sheet" onClick={e => e.stopPropagation()}>
        <div className="settings-handle"/>
        <div className="settings-title">Settings</div>

        <div className="settings-section">
          <div className="settings-section-label">Appearance</div>
          <div className="settings-group">
            <div className="settings-row">
              <span className="settings-row-label">Theme</span>
              <div className="settings-seg">
                {(['light','system','dark']).map(opt => (
                  <button key={opt} className={`settings-seg-btn${themePref===opt?' active':''}`} onClick={() => setThemePref(opt)}>
                    {opt==='light'?'Light':opt==='dark'?'Dark':'Auto'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {isPushSupported() && (
          <div className="settings-section">
            <div className="settings-section-label">Notifications</div>
            <div className="settings-group">
              <div className="settings-row">
                <div style={{flex:1}}>
                  <div className="settings-row-label">Editor's Note Alerts</div>
                  <div className="settings-row-sub">Daily 8pm push when your note is in</div>
                </div>
                <button
                  className={`ai-toggle${pushEnabled?' on':' off'}`}
                  onClick={async () => {
                    if (pushEnabled) {
                      await unsubscribePush();
                      setPushEnabled(false);
                    } else {
                      const r = await maybePromptForPush({ force: true });
                      setPushEnabled(r === 'subscribed' || r === 'already');
                    }
                  }}
                  aria-label={pushEnabled?'Disable notifications':'Enable notifications'}
                >
                  <div className="ai-toggle-thumb"/>
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="settings-section">
          <div className="settings-section-label">Your editor</div>
          <div className="settings-persona-list">
            {PERSONAS.map(p => {
              const active = briefVoice === p.id;
              return (
                <button
                  key={p.id}
                  className={`settings-persona-row${active ? ' active' : ''}`}
                  onClick={() => setBriefVoice(p.id)}
                  aria-pressed={active}
                >
                  <div className="settings-persona-portrait" aria-hidden="true">
                    <img src={p.portrait} alt="" loading="lazy" />
                  </div>
                  <div className="settings-persona-copy">
                    <div className="s2-serif settings-persona-name">{p.name}</div>
                    <div className="s2-mono settings-persona-role">{p.title} · {p.publication}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Privacy</div>
          <div className="settings-group">
            <div className="settings-row">
              <div style={{flex:1}}>
                <div className="settings-row-label">Analytics</div>
                <div className="settings-row-sub">Anonymous usage data to improve Scout</div>
              </div>
              <button
                className={`ai-toggle${analyticsEnabled?' on':' off'}`}
                onClick={() => {
                  const next = !analyticsEnabled;
                  setAnalyticsEnabled(next);
                  setAnalyticsOptOut(!next);
                }}
                aria-label={analyticsEnabled?'Disable analytics':'Enable analytics'}
              >
                <div className="ai-toggle-thumb"/>
              </button>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Help</div>
          <div className="settings-group">
            <a className="settings-row-btn" href="mailto:eric@scoutphoto.app?subject=Scout%20Feedback%20%2F%20Feature%20Request" style={{textDecoration:'none'}}>
              <span className="settings-row-label">Feedback & Ideas</span>
              <svg className="settings-row-chev" viewBox="0 0 7 12"><polyline points="1,1 6,6 1,11"/></svg>
            </a>
            <a className="settings-row-btn" href="mailto:eric@scoutphoto.app?subject=Scout%20Bug%20Report" style={{textDecoration:'none'}}>
              <span className="settings-row-label">Report a Bug</span>
              <svg className="settings-row-chev" viewBox="0 0 7 12"><polyline points="1,1 6,6 1,11"/></svg>
            </a>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Legal</div>
          <div className="settings-group">
            <button className="settings-row-btn" onClick={() => { onClose(); onOpenLegal('privacy'); }}>
              <span className="settings-row-label">Privacy Policy</span>
              <svg className="settings-row-chev" viewBox="0 0 7 12"><polyline points="1,1 6,6 1,11"/></svg>
            </button>
            <button className="settings-row-btn" onClick={() => { onClose(); onOpenLegal('terms'); }}>
              <span className="settings-row-label">Terms of Service</span>
              <svg className="settings-row-chev" viewBox="0 0 7 12"><polyline points="1,1 6,6 1,11"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
