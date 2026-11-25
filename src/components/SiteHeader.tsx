import type { ReactNode } from 'react';
import { BRAND } from '../brand';
import { AdminControl } from './AdminLogin';
import { useGame } from '../store';
import { Logo } from './Logo';
import { PlatformLogo } from './PlatformLogo';

/** The dashboard's logo is a little larger than on the other screens. */
export const DASHBOARD_LOGO_SIZE = 'clamp(24px, 2.6vw, 30px)';

export function SiteHeader({
  right,
  tagline = BRAND.tagline,
  brand = 'typedrive',
  logoSize = 24,
}: {
  right?: ReactNode;
  /** Kept for callers that still pass it; every header now has the same width. */
  wide?: boolean;
  /** The line beside TypeDrive's logo. */
  tagline?: string;
  /** Whose logo: TypeDrive's own screens wear TypeDrive's; the dashboard and the screens the three games share wear the platform's. */
  brand?: 'typedrive' | 'platform';
  /** The platform lockup's size: pixels, or a CSS length. */
  logoSize?: number | string;
}) {
  const status = useGame((s) => s.status);
  const online = status === 'open';
  return (
    <div className="site-bar">
      <header className="site-header">
        <div className="site-header-brand">
          {brand === 'platform' ? (
            <PlatformLogo size={logoSize} />
          ) : (
            <>
              <Logo size={20} />
              <span className="logo-tag">{tagline}</span>
            </>
          )}
        </div>
        <div className="site-header-actions">
          {right}
          <AdminControl />
          <span className={`status-chip${online ? '' : ' off'}`} title={online ? 'Connected to the game server' : 'Reconnecting…'}>
            <i aria-hidden />
            <span>{online ? 'Live' : 'Reconnecting…'}</span>
          </span>
        </div>
      </header>
    </div>
  );
}
