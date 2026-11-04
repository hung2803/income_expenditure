export function WalletIllustration() {
  return <div className="login-brand" aria-hidden="true">
    <svg viewBox="0 0 120 120" fill="none">
      <defs>
        <linearGradient id="wallet-blue" x1="25" y1="44" x2="91" y2="103" gradientUnits="userSpaceOnUse"><stop stopColor="#64b1ff" /><stop offset=".5" stopColor="#2582ff" /><stop offset="1" stopColor="#0754ed" /></linearGradient>
        <linearGradient id="wallet-edge" x1="26" y1="44" x2="31" y2="96" gradientUnits="userSpaceOnUse"><stop stopColor="#1681ff" /><stop offset="1" stopColor="#0649d4" /></linearGradient>
        <linearGradient id="wallet-coin" x1="54" y1="18" x2="79" y2="54" gradientUnits="userSpaceOnUse"><stop stopColor="#fff3a9" /><stop offset=".48" stopColor="#ffc94a" /><stop offset="1" stopColor="#ffab16" /></linearGradient>
        <linearGradient id="wallet-flap" x1="77" y1="65" x2="100" y2="80" gradientUnits="userSpaceOnUse"><stop stopColor="#a0d4ff" /><stop offset="1" stopColor="#348bff" /></linearGradient>
        <filter id="wallet-shadow" x="0" y="0" width="150%" height="160%"><feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#0754ed" floodOpacity=".22" /></filter>
      </defs>
      <rect x="24" y="42" width="69" height="56" rx="11" fill="url(#wallet-edge)" />
      <path d="M35 46h48" stroke="#a0d2ff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="66" cy="39" r="22" fill="url(#wallet-coin)" stroke="#ffe79a" strokeWidth="2" />
      <circle cx="66" cy="39" r="16" stroke="#f5a41a" strokeWidth="1.5" />
      <path d="m66 28 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2-6.2 3.2 1.2-6.8-5-4.9 6.9-1Z" fill="#ffe28c" />
      <rect x="26" y="48" width="70" height="50" rx="10" fill="url(#wallet-blue)" stroke="#2680ff" strokeWidth="1.5" filter="url(#wallet-shadow)" />
      <path d="M35 51h50" stroke="#a4d5ff" strokeOpacity=".4" strokeWidth="2" strokeLinecap="round" />
      <path d="M80 64h18v18H80a9 9 0 0 1 0-18Z" fill="url(#wallet-flap)" stroke="#c6e6ff" strokeWidth="1.5" />
      <circle cx="80" cy="73" r="4.4" fill="#f4fbff" />
    </svg>
    <span className="login-brand-spark login-brand-spark-one" />
    <span className="login-brand-spark login-brand-spark-two" />
  </div>;
}
