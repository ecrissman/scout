import { PRIVACY_POLICY, TERMS_OF_SERVICE, ABOUT_SCOUT } from '../legal.js';

const SHEET_TITLES = { privacy: 'Privacy Policy', terms: 'Terms of Service', about: 'About Scout' };
const SHEET_CONTENT = { privacy: PRIVACY_POLICY, terms: TERMS_OF_SERVICE, about: ABOUT_SCOUT };

// Tiny markdown renderer for legal docs. Handles h1/h2, paragraphs, bullet
// lists, and **bold** inline. The input is trusted (our own file) so the
// output is safe to render as-is.
function renderLegal(md) {
  const blocks = md.split(/\n\n+/);
  const inline = (s) => {
    const parts = s.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) =>
      p.startsWith('**') && p.endsWith('**')
        ? <strong key={i}>{p.slice(2, -2)}</strong>
        : <span key={i}>{p}</span>
    );
  };
  return blocks.map((block, i) => {
    const trimmed = block.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('# ')) return <h1 key={i}>{trimmed.slice(2)}</h1>;
    if (trimmed.startsWith('## ')) return <h2 key={i}>{trimmed.slice(3)}</h2>;
    if (trimmed.startsWith('**Effective:**')) {
      return <p key={i} className="legal-effective">{inline(trimmed)}</p>;
    }
    if (trimmed.split('\n').every(l => l.trim().startsWith('- '))) {
      return (
        <ul key={i}>
          {trimmed.split('\n').map((l, j) => (
            <li key={j}>{inline(l.trim().slice(2))}</li>
          ))}
        </ul>
      );
    }
    return <p key={i}>{inline(trimmed)}</p>;
  });
}

export default function LegalSheet({ which, onClose }) {
  if (!which) return null;
  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="legal-sheet" onClick={e => e.stopPropagation()}>
        <div className="legal-header">
          <div className="legal-title">{SHEET_TITLES[which] || ''}</div>
          <button className="legal-close" onClick={onClose}>Close</button>
        </div>
        <div className="legal-content">
          {renderLegal(SHEET_CONTENT[which] || '')}
        </div>
      </div>
    </div>
  );
}
