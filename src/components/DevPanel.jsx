export default function DevPanel({
  open, onClose,
  devDeleteMode, setDevDeleteMode,
  feedback, setFeedback, setNoteReveal, setNoteRevealShown, sel,
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
              const sample = feedback || "The sky told the whole story tonight — you let it. The trees at the base anchor the frame without fighting the light. Next time, try waiting thirty seconds longer: the corona was about to break.";
              if (!feedback) setFeedback(sample);
              setNoteReveal(sel); setNoteRevealShown(0);
              onClose();
            }}>
              <span className="settings-row-label">Preview Editor's Note</span>
              <span style={{fontFamily:'var(--sans)',fontSize:12,color:'var(--text-3)'}}>show the reveal screen</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
