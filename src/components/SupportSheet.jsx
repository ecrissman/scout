export default function SupportSheet({ open, onClose, onOpenLegal }) {
  if (!open) return null;
  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-sheet" onClick={e => e.stopPropagation()}>
        <div className="settings-handle"/>
        <div className="settings-title">Support</div>

        <div className="settings-section">
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
