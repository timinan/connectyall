type Props = { size?: number; className?: string };

export function LogoMark({ size = 40, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Connectyall"
      role="img"
    >
      <rect x="0" y="0" width="40" height="40" rx="10" fill="#7C5CFF" />
      <text
        x="20"
        y="29"
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="24"
        fontWeight="800"
        fill="#FFFFFF"
      >
        c
      </text>
    </svg>
  );
}

export function Logo({ size = 40, className }: Props) {
  return (
    <div className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <LogoMark size={size} />
      <span className="text-2xl font-bold tracking-tight text-neutral-950">connectyall</span>
    </div>
  );
}

export function LogoSpinner({ size = 56 }: { size?: number }) {
  return (
    <div className="logo-spinner inline-flex" style={{ perspective: 400 }}>
      <LogoMark size={size} />
    </div>
  );
}
