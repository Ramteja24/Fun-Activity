import { BRAND } from '../brand';

export function Logo({ size = 22, withIcon = true }: { size?: number; withIcon?: boolean }) {
  return (
    <span className="logo" style={{ fontSize: size }}>
      {withIcon && (
        <svg width={size * 1.4} height={size * 0.85} viewBox="0 0 46 28" aria-hidden>
          <path d="M2 17c0-3 2-5 5-5l6-6c1-1 3-2 5-2h9c3 0 5 1 6 3l3 5c4 0 6 2 6 5v3H2z" fill="#f67c01" />
          <path d="M16 12l4-4c1-1 2-1 3-1h6c1 0 2 1 3 2l2 3z" fill="#fff" opacity=".85" />
          <circle cx="13" cy="21" r="4" fill="#151a2d" />
          <circle cx="13" cy="21" r="1.6" fill="#e4e7ef" />
          <circle cx="35" cy="21" r="4" fill="#151a2d" />
          <circle cx="35" cy="21" r="1.6" fill="#e4e7ef" />
        </svg>
      )}
      <span>
        <span className="a">{BRAND.first}</span>
        <span className="b">{BRAND.second}</span>
      </span>
    </span>
  );
}
