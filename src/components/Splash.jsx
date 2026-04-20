import ScoutWordmark from '../ScoutWordmark.jsx';

export default function Splash({ fading, theme }) {
  return (
    <div className={`s2-splash${fading?' fading':''}`}>
      <ScoutWordmark size={45} color={theme === 'dark' ? '#FFFCF6' : '#0C0C0C'} ruleColor="#007C04" gap={40} />
      <div className="s2-splash-tag">Your beat is every day.</div>
    </div>
  );
}
