import type { SVGProps } from 'react';

type Props = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const FlameIcon = (props: Props) => (
  <Svg {...props}>
    <path d="M12 2c1.4 4.6-2.6 6.3-4.7 10.1A7.4 7.4 0 0 0 12 22a7.5 7.5 0 0 0 7.5-7.5c0-3-1.6-5.3-3.4-7.4-.4 2.2-1.5 3.3-2.6 3.8 1-4.3.2-7.1-1.5-8.9Z" fill="currentColor" stroke="none" />
    <path d="M12 13c.6 2-1.6 3-1.6 5 0 2 1.4 3.4 3.1 3.4s3.1-1.4 3.1-3.4c0-1.5-1-2.6-1.6-3.6-.1 1-.5 1.5-1 1.6.5-1.5.2-2.4-.5-3-.5 1-1 1.5-1.5 1.5Z" fill="#ffe6ad" stroke="none" />
  </Svg>
);

export const MicIcon = (props: Props) => (
  <Svg {...props}><rect x="9" y="2.5" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" /></Svg>
);
export const StopIcon = (props: Props) => (
  <Svg {...props}><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" /></Svg>
);
export const SendIcon = (props: Props) => (
  <Svg {...props}><path d="m4 12 16-8-6.5 16-2.6-6.4L4 12Z" /><path d="m10.9 13.6 9.1-9.6" /></Svg>
);
export const SettingsIcon = (props: Props) => (
  <Svg {...props}><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.5 2.5-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-3.6v-.3a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H2.5v-3.6h.5a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 6.4 6.7 4l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V2.5h3.6v.3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.5 2.5-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.5v3.6h-.5a1.7 1.7 0 0 0-1.6 1Z" /></Svg>
);
export const DraftsIcon = (props: Props) => (
  <Svg {...props}><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M8 8h8M8 12h8M8 16h5" /></Svg>
);
export const HelpIcon = (props: Props) => (
  <Svg {...props}><circle cx="12" cy="12" r="9" /><path d="M9.6 9a2.6 2.6 0 0 1 5 .9c0 1.8-2.6 2-2.6 3.7M12 17.2h.01" /></Svg>
);
export const SpeakerIcon = (props: Props) => (
  <Svg {...props}><path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4v-5Z" /><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></Svg>
);
export const CloseIcon = (props: Props) => (
  <Svg {...props}><path d="M6 6l12 12M18 6 6 18" /></Svg>
);
export const CheckIcon = (props: Props) => (
  <Svg {...props}><path d="m4.5 12.5 5 5 10-11" /></Svg>
);
export const RefreshIcon = (props: Props) => (
  <Svg {...props}><path d="M20 11a8 8 0 1 0-2.3 6.2M20 5v6h-6" /></Svg>
);
export const LinkIcon = (props: Props) => (
  <Svg {...props}><path d="M10 13.5a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7L11 6.8" /><path d="M14 10.5a4 4 0 0 0-5.7 0L6 12.8a4 4 0 0 0 5.7 5.7l1.3-1.3" /></Svg>
);
export const TrashIcon = (props: Props) => (
  <Svg {...props}><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5" /></Svg>
);
export const BoltIcon = (props: Props) => (
  <Svg {...props}><path d="m13 2-8 11h6l-1 9 8-11h-6l1-9Z" /></Svg>
);
