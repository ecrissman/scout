export default function AccountSheet({
  open, onClose,
  userEmail,
  pwExpanded, setPwExpanded,
  pwNew, setPwNew,
  pwMsg, setPwMsg,
  pwChanging,
  handleChangePassword,
  handleSignOut,
  handleDeleteAccount,
  deleteAccBusy,
  handleDownloadAllPhotos,
  dlProgress,
  photoDates,
}) {
  if (!open) return null;
  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-sheet" onClick={e => e.stopPropagation()}>
        <div className="settings-handle"/>
        <div className="settings-title">Account</div>

        <div className="settings-section">
          <div className="settings-group">
            <div className="settings-row">
              <span className="settings-row-label" style={{fontSize:13,color:'var(--text-2)',fontFamily:'var(--sans)'}}>{userEmail}</span>
            </div>
            <button className="settings-row-btn" onClick={() => { setPwExpanded(v => !v); setPwMsg(null); }}>
              <span className="settings-row-label">Change Password</span>
              <svg className="settings-row-chev" viewBox="0 0 7 12"><polyline points="1,1 6,6 1,11"/></svg>
            </button>
            {pwExpanded && (
              <div className="settings-row" style={{flexDirection:'column',alignItems:'stretch',gap:8,padding:'12px 16px',minHeight:'auto'}}>
                <div className="settings-pw-row">
                  <input className="settings-pw-input" type="password" value={pwNew}
                    onChange={e => { setPwNew(e.target.value); setPwMsg(null); }}
                    placeholder="New password" autoComplete="new-password"/>
                  <button type="button" className="settings-pw-submit" onClick={handleChangePassword} disabled={pwChanging || !pwNew}>
                    {pwChanging ? '…' : 'Save'}
                  </button>
                </div>
                {pwMsg && <div style={{fontFamily:'var(--sans)',fontSize:12,color:pwMsg.ok?'var(--accent)':'#B03030'}}>{pwMsg.text}</div>}
              </div>
            )}
            <button className="settings-row-btn" onClick={handleSignOut}>
              <span className="settings-row-label" style={{color:'#D9534F'}}>Sign Out</span>
            </button>
            <button className="settings-row-btn" onClick={handleDeleteAccount} disabled={deleteAccBusy}>
              <span className="settings-row-label" style={{color:'#D9534F'}}>
                {deleteAccBusy ? 'Deleting…' : 'Delete Account'}
              </span>
            </button>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Photos</div>
          <div className="settings-group">
            <button className="settings-row-btn" onClick={handleDownloadAllPhotos} disabled={!!dlProgress || photoDates.size === 0}>
              <span className="settings-row-label">
                {dlProgress ? `Downloading… ${dlProgress.done} of ${dlProgress.total}` : 'Download All Photos'}
              </span>
              {!dlProgress && <svg className="settings-row-chev" viewBox="0 0 7 12"><polyline points="1,1 6,6 1,11"/></svg>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
