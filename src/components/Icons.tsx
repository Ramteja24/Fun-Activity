import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({ width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...p });

export const IconCrown = (p: P) => (
  <svg {...base({ fill: '#ffc83d', stroke: '#b9770e', strokeWidth: 1.2, ...p })}>
    <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z" />
  </svg>
);
export const IconWarn = (p: P) => (
  <svg {...base({ fill: '#ffb21f', stroke: '#8a5a00', strokeWidth: 1.4, ...p })}>
    <path d="M12 3l10 18H2L12 3z" />
    <path d="M12 10v5M12 18v.5" stroke="#3a2400" />
  </svg>
);
export const IconUp = (p: P) => (
  <svg {...base({ stroke: '#2ee86b', strokeWidth: 3, ...p })}>
    <path d="M6 14l6-6 6 6M6 20l6-6 6 6" />
  </svg>
);
export const IconTrophy = (p: P) => (
  <svg {...base({ fill: '#ffc83d', stroke: '#b9770e', strokeWidth: 1.2, ...p })}>
    <path d="M7 3h10v6a5 5 0 01-10 0V3z" />
    <path d="M7 5H3v2a4 4 0 004 4M17 5h4v2a4 4 0 01-4 4M12 14v4M8 21h8M9 18h6" fill="none" />
  </svg>
);
export const IconSpark = (p: P) => (
  <svg {...base({ fill: '#ffe27a', stroke: 'none', ...p })}>
    <path d="M12 2l2.2 6.3L21 10l-6.3 2.2L12 19l-2.2-6.8L3 10l6.8-1.7L12 2z" />
  </svg>
);
export const IconList = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 6h12M8 12h12M8 18h12M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
  </svg>
);
export const IconEye = (p: P) => (
  <svg {...base(p)}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const IconCopy = (p: P) => (
  <svg {...base(p)}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 012-2h9" />
  </svg>
);
export const IconCheck = (p: P) => (
  <svg {...base({ strokeWidth: 3, ...p })}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
);
export const IconX = (p: P) => (
  <svg {...base({ strokeWidth: 2.4, ...p })}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const IconLink = (p: P) => (
  <svg {...base(p)}>
    <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />
  </svg>
);
export const IconUsers = (p: P) => (
  <svg {...base(p)}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.5a3.5 3.5 0 010 7M18 14.2c2.2.7 3.5 2.6 3.5 5.8" />
  </svg>
);
export const IconFlag = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </svg>
);
export const IconSpeaker = (p: P) => (
  <svg {...base(p)}>
    <path d="M11 5L6 9H3v6h3l5 4V5z" fill="currentColor" />
    <path d="M15.5 8.5a5 5 0 010 7M18.6 5.6a9 9 0 010 12.8" />
  </svg>
);
export const IconSpeakerMuted = (p: P) => (
  <svg {...base(p)}>
    <path d="M11 5L6 9H3v6h3l5 4V5z" fill="currentColor" />
    <path d="M16 9.5l5 5M21 9.5l-5 5" />
  </svg>
);
export const IconBolt = (p: P) => (
  <svg {...base({ fill: 'currentColor', stroke: 'none', ...p })}>
    <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />
  </svg>
);
export const IconExit = (p: P) => (
  <svg {...base({ strokeWidth: 2.2, ...p })}>
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
  </svg>
);
