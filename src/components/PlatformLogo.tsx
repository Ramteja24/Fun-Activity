import { PLATFORM } from '../brand';

/**
 * The platform's lockup — at the top left of the Weekly Fun Activity dashboard and of every screen the games share. It is
 * GANTEC's OFFICIAL logo (the company's own file, kept untouched in assets/gantec-logo-original.png), turned into `public/gantec-logo.png`
 * by `npm run logo` (scripts/make-gantec-logo.ts): the white background made transparent, the orange of the icon and the G exactly as
 * they were, "ANTEC" printed in soft white because its grey cannot be read on a dark page, the empty margin trimmed, enlarged 3× so it is
 * sharp. It is an image — never redrawn or typeset — shown at its own proportions; "WEEKLY CONNECT" is a separate subtitle straight under
 * it. TypeDrive keeps its own logo (components/Logo.tsx) for its own screens. `size` is the font size every part is measured in (the logo
 * is 1 em tall), a number of pixels or any CSS length.
 */
export const GANTEC_LOGO = { src: '/gantec-logo.png', width: 573, height: 111 } as const;

export function PlatformLogo({ size = 26 }: { size?: number | string }) {
  return (
    <span className="plogo" style={{ fontSize: size }} role="img" aria-label={`${PLATFORM.name} ${PLATFORM.sub}`}>
      <span className="plogo-logo">
        <img className="plogo-img" src={GANTEC_LOGO.src} width={GANTEC_LOGO.width} height={GANTEC_LOGO.height} alt="" aria-hidden draggable={false} decoding="async" />
      </span>
      <span className="plogo-sub" aria-hidden>
        {PLATFORM.sub}
      </span>
    </span>
  );
}
