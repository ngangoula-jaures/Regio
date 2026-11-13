// Logo Regio : le symbole (écran + « r » + point de lumière) et le nom en minuscules.

export function RegioMark({ size = 32, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <rect x="9.5" y="19.5" width="81" height="61" rx="15" fill="none" stroke="var(--regio-ivoire)" strokeWidth="7" />
      <path d="M36.5 63 V43" fill="none" stroke="var(--regio-ivoire)" strokeWidth="9" strokeLinecap="round" />
      <path d="M36.5 51 C36.5 42 43.5 37 52.5 37" fill="none" stroke="var(--regio-ivoire)" strokeWidth="9" strokeLinecap="round" />
      <circle cx="62.5" cy="37" r="6" fill="var(--regio-or)" />
    </svg>
  );
}

export function RegioLockup({ size = 30 }: { size?: number }) {
  return (
    <span className="lockup" aria-label="Regio">
      <RegioMark size={size} />
      <span className="lockup-word" aria-hidden="true">
        regio
      </span>
    </span>
  );
}
