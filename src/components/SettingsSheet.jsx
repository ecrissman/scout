import { isPushSupported, maybePromptForPush, unsubscribePush } from '../push';
import { setAnalyticsOptOut } from '../analytics';
import { PERSONAS } from '../personas';

export default function SettingsSheet({
  open, onClose,
  themePref, setThemePref,
  aiEnabled, setAiEnabled,
  pushEnabled, setPushEnabled,
  analyticsEnabled, setAnalyticsEnabled,
  briefVoice, setBriefVoice,
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

        <div className="settings-section">
          <div className="settings-section-label">Features</div>
          <div className="settings-group">
            <div className="settings-row">
              <div style={{flex:1}}>
                <div className="settings-row-label">AI Features</div>
                <div className="settings-row-sub">Captions, feedback & prompts</div>
              </div>
              <button className={`ai-toggle${aiEnabled?' on':' off'}`} onClick={() => setAiEnabled(v => !v)} aria-label={aiEnabled?'Disable AI':'Enable AI'}>
                <div className="ai-toggle-thumb"/>
              </button>
            </div>
            {isPushSupported() && (
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
            )}
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Your editor</div>
          <div className="onb-persona-list">
            {PERSONAS.map(p => {
              const active = briefVoice === p.id;
              return (
                <button
                  key={p.id}
                  className={`onb-persona-row${active ? ' active' : ''}`}
                  onClick={() => setBriefVoice(p.id)}
                  aria-pressed={active}
                >
                  <div className="onb-persona-portrait" aria-hidden="true">
                    <img src={p.portrait} alt="" loading="lazy" />
                  </div>
                  <div className="onb-persona-copy">
                    <div className="s2-mono onb-persona-role">{p.title}</div>
                    <div className="s2-serif onb-persona-name">{p.name}</div>
                    <div className="s2-mono onb-persona-pub">{p.publication}</div>
                    <div className="s2-serif onb-persona-sample">"{p.sample}"</div>
                  </div>
                  {active && <span className="onb-persona-stamp" aria-hidden="true">Your desk</span>}
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
      </div>
    </div>
  );
}
