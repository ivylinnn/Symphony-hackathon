/**
 * Stub of `@fe-infra/keystone-icons-react`.
 *
 * The real package ships hundreds of `KsIcon*` components. The canvas uses 35 of them;
 * each is reproduced here as a simple line glyph so the UI reads correctly. All accept
 * a numeric/string `size` (default 16) plus any standard SVG props.
 */
import type { SVGProps } from 'react';

type IconProps = { size?: number | string } & Omit<SVGProps<SVGSVGElement>, 'children'>;

const base = (children: React.ReactNode) =>
  function KsIcon({ size = 16, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...rest}
      >
        {children}
      </svg>
    );
  };

export const KsIconClose = base(<path d="M6 6l12 12M18 6L6 18" />);
export const KsIconPlus = base(<path d="M12 5v14M5 12h14" />);
export const KsIconSearch = base(
  <>
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-3.6-3.6" />
  </>
);
export const KsIconSend = base(<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />);
export const KsIconChevronDown = base(<path d="M6 9l6 6 6-6" />);
export const KsIconChevronRight = base(<path d="M9 6l6 6-6 6" />);
export const KsIconArrowRight = base(<path d="M5 12h14M13 6l6 6-6 6" />);
export const KsIconExpand = base(<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />);
export const KsIconFullScreen = base(<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />);
export const KsIconZoomIn = base(
  <>
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-3.6-3.6M11 8.5v5M8.5 11h5" />
  </>
);
export const KsIconZoomOut = base(
  <>
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-3.6-3.6M8.5 11h5" />
  </>
);
export const KsIconUndo = base(
  <>
    <path d="M4 9h11a5 5 0 0 1 0 10H9" />
    <path d="M8 5L4 9l4 4" />
  </>
);
export const KsIconRedo = base(
  <>
    <path d="M20 9H9a5 5 0 0 0 0 10h6" />
    <path d="M16 5l4 4-4 4" />
  </>
);
export const KsIconDelete = base(
  <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M10 11v6M14 11v6" />
);
export const KsIconCopyContent = base(
  <>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h8" />
  </>
);
export const KsIconCut = base(
  <>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="6" cy="18" r="2.5" />
    <path d="M8 8l12 8M20 8L8 16" />
  </>
);
export const KsIconSplit = base(
  <>
    <path d="M7 4v3a4 4 0 0 0 4 4h9M7 20v-3a4 4 0 0 1 4-4" />
    <path d="M17 8l3 3-3 3" />
  </>
);
export const KsIconDownload = base(<path d="M12 3v12M7 10l5 5 5-5M5 21h14" />);
export const KsIconUpload = base(<path d="M12 21V9M7 14l5-5 5 5M5 3h14" />);
export const KsIconFolder = base(
  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
);
export const KsIconFolderAdd = base(
  <>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M12 11v6M9 14h6" />
  </>
);
export const KsIconFilledLock = base(
  <>
    <rect x="5" y="11" width="14" height="9" rx="2" fill="currentColor" stroke="none" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </>
);
export const KsIconPeople = base(
  <>
    <circle cx="9" cy="8" r="3" />
    <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.5a3 3 0 0 1 0 5.9M17 20a5.5 5.5 0 0 0-2.5-4.6" />
  </>
);
export const KsIconSound = base(
  <>
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="M16.5 9a3.5 3.5 0 0 1 0 6" />
  </>
);
export const KsIconSeperateAudio = base(
  <>
    <path d="M3 10v4h3l4 3V7L6 10H3z" />
    <path d="M15 6v12M19 9v6" />
  </>
);
export const KsIconVideoClip = base(
  <>
    <rect x="3" y="6" width="13" height="12" rx="2" />
    <path d="M16 10l5-3v10l-5-3z" />
  </>
);
export const KsIconImageCollection = base(
  <>
    <rect x="7" y="3" width="14" height="14" rx="2" />
    <path d="M3 8v11a2 2 0 0 0 2 2h11" />
    <circle cx="12" cy="8.5" r="1.4" />
    <path d="M8 15l3-3 3 3 2-2 2 2" />
  </>
);
export const KsIconTextFile = base(
  <>
    <path d="M7 3h7l4 4v14H7z" />
    <path d="M14 3v4h4M10 12h5M10 16h5" />
  </>
);
export const KsIconCampaignList = base(
  <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
);
export const KsIconShowTimeline = base(<path d="M3 12h18M6 8v8M12 6v12M18 9v6" />);
export const KsIconFullSelect = base(
  <>
    <rect x="4" y="4" width="16" height="16" rx="2" strokeDasharray="3 3" />
    <path d="M9 12l2 2 4-4" />
  </>
);
export const KsIconToolbox = base(
  <>
    <rect x="3" y="8" width="18" height="12" rx="2" />
    <path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" />
  </>
);
export const KsIconTips = base(
  <>
    <path d="M9 18h6M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.5 10.9c.3.3.5.7.5 1.1v1h6v-1c0-.4.2-.8.5-1.1A6 6 0 0 0 12 3z" />
  </>
);
export const KsIconAiAssistant = base(
  <>
    <path d="M12 3l1.7 4.1L18 9l-4.3 1.9L12 15l-1.7-4.1L6 9l4.3-1.9z" />
    <path d="M18 15l.7 1.8L20.5 18l-1.8.7L18 20.5l-.7-1.8L15.5 18l1.8-.7z" />
  </>
);
export const KsIconAiGeneration = base(
  <>
    <path d="M11 4l1.6 3.9L16.5 9l-3.9 1.6L11 14.5 9.4 10.6 5.5 9l3.9-1.6z" />
    <path d="M18 4l.6 1.6L20 6l-1.4.6L18 8l-.6-1.4L16 6l1.4-.4z" />
  </>
);
export const KsIconShare = base(
  <>
    <circle cx="18" cy="5.5" r="2.5" />
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="18.5" r="2.5" />
    <path d="M8.2 10.8l7.6-4M8.2 13.2l7.6 4" />
  </>
);
export const KsIconPen = base(
  <>
    <path d="M4 20l3.4-.8L19.2 7.4a1.9 1.9 0 0 0-2.6-2.6L4.8 16.6 4 20z" />
    <path d="M13.5 6.5l4 4" />
  </>
);
