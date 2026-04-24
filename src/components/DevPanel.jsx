export default function DevPanel({
  open, onClose,
  devDeleteMode, setDevDeleteMode,
  feedback, setFeedback, setNoteReveal, setNoteRevealShown, sel,
  briefVoice, setBriefVoice,
}) {
  if (!open) return null;
  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-sheet" onClick={e => e.stopPropagation()}>
        <div className="settings-handle"/>
        <div className="settings-title">Developer</div>
        <div className="settings-section">
          <div className="settings-section-label">Tools</div>
          <div className="settings-group">
            <div className="settings-row">
              <span className="settings-row-label">Delete Mode</span>
              <button className={`ai-toggle${devDeleteMode?' on':' off'}`} onClick={() => setDevDeleteMode(v => !v)} aria-label="Toggle delete mode">
                <div className="ai-toggle-thumb"/>
              </button>
            </div>
            <button className="settings-row-btn" onClick={() => {
              const samples = {
                editor: "Shadow at the top third holds the whole thing. I didn't expect it to land and it landed.\n\nNovak —",
                rob: "okay, this one stopped me. the shadow falling across the rim of the cup — nothing's staged but everything's working. running it.\n\n— rob",
                walsh: "the shadow arrived before you did. seen.\n\n— e.w.",
              };
              const voice = briefVoice && samples[briefVoice] ? briefVoice : 'editor';
              setFeedback(samples[voice]);
              setNoteReveal(sel); setNoteRevealShown(0);
              onClose();
            }}>
              <span className="settings-row-label">Preview Editor's Note</span>
              <span style={{fontFamily:'var(--sans)',fontSize:12,color:'var(--text-3)'}}>samples the current editor</span>
            </button>
            <button className="settings-row-btn" onClick={() => {
              localStorage.removeItem('scout-onboarded');
              localStorage.removeItem('scout-first-brief-seen');
              location.reload();
            }}>
              <span className="settings-row-label">Replay Onboarding</span>
              <span style={{fontFamily:'var(--sans)',fontSize:12,color:'var(--text-3)'}}>reset & reload</span>
            </button>
          </div>
        </div>
        <div className="settings-section">
          <div className="settings-section-label">Brief Voice (shortcut)</div>
          <div className="settings-group">
            {[
              { id:'editor', label:'Stan Novak',   hint:'Editor · big-city daily' },
              { id:'rob',    label:'Rob Calder',   hint:'Contributing · indie zine' },
              { id:'walsh',  label:'Eileen Walsh', hint:'Editor at Large · quarterly' },
            ].map(v => (
              <button
                key={v.id}
                className="settings-row-btn"
                onClick={() => setBriefVoice(v.id)}
                style={briefVoice === v.id ? { borderLeft:'3px solid var(--terracotta)' } : undefined}
              >
                <span className="settings-row-label">{v.label}{briefVoice === v.id ? ' ✓' : ''}</span>
                <span style={{fontFamily:'var(--sans)',fontSize:12,color:'var(--text-3)'}}>{v.hint}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
