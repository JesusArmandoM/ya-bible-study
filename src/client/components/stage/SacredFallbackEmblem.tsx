import {
  SACRED_STAGE_METADATA,
  type SacredAccentMode,
  type SacredStageVariant,
} from '../../state/sacredStageStore';

export interface SacredFallbackEmblemProps {
  stage: SacredStageVariant;
  accentMode?: SacredAccentMode;
  reducedMotion?: boolean;
}

function renderStageArtwork(
  stage: SacredStageVariant,
  accentMode: SacredAccentMode,
) {
  switch (stage) {
    case 'sanctuary-emblem':
      return (
        <g>
          <ellipse
            cx="64"
            cy="64"
            rx="44"
            ry="22"
            transform="rotate(-24 64 64)"
            stroke="#E2A83E"
            strokeWidth="2.2"
            strokeOpacity="0.72"
            fill="none"
          />
          {accentMode === 'hospitality' && (
            <>
              <circle
                cx="64"
                cy="64"
                r="48"
                stroke="#F4BE68"
                strokeWidth="1.6"
                strokeDasharray="6 5"
                strokeOpacity="0.65"
                fill="none"
              />
              <ellipse
                cx="64"
                cy="64"
                rx="46"
                ry="20"
                transform="rotate(28 64 64)"
                stroke="#E89B3C"
                strokeWidth="1.8"
                strokeOpacity="0.7"
                fill="none"
              />
            </>
          )}
          <path
            d="M64 20C67.4 45.2 82.8 60.6 108 64C82.8 67.4 67.4 82.8 64 108C60.6 82.8 45.2 67.4 20 64C45.2 60.6 60.6 45.2 64 20Z"
            fill="url(#sacredGoldGrad)"
            stroke="#FDE68A"
            strokeWidth="1.2"
          />
          <polygon
            points="64,50 78,64 64,78 50,64"
            fill="#171B2E"
            stroke="#FDE68A"
            strokeWidth="1.3"
          />
        </g>
      );

    case 'prayer-orb':
      return (
        <g>
          <ellipse
            cx="64"
            cy="64"
            rx="47"
            ry="19"
            transform="rotate(-20 64 64)"
            stroke="#E2A83E"
            strokeWidth="1.8"
            strokeOpacity="0.68"
            fill="none"
          />
          <ellipse
            cx="64"
            cy="64"
            rx="42"
            ry="24"
            transform="rotate(32 64 64)"
            stroke="#D88CE6"
            strokeWidth="1.6"
            strokeOpacity="0.75"
            fill="none"
          />
          <circle
            cx="64"
            cy="64"
            r="27"
            fill="url(#sacredVioletOrbGrad)"
            stroke="#F5D0FE"
            strokeWidth="1.2"
            strokeOpacity="0.7"
          />
          <circle cx="55" cy="54" r="7" fill="#FFFFFF" fillOpacity="0.28" />
        </g>
      );

    case 'chosen-aura':
      return (
        <g>
          <circle
            cx="64"
            cy="60"
            r="44"
            stroke="#E2A83E"
            strokeWidth="1.6"
            strokeOpacity="0.55"
            fill="none"
          />
          <ellipse
            cx="64"
            cy="42"
            rx="28"
            ry="10"
            stroke="#FDE68A"
            strokeWidth="1.8"
            strokeOpacity="0.85"
            fill="none"
          />
          <circle cx="64" cy="44" r="9.5" fill="url(#sacredPearlGrad)" />
          <path
            d="M42 54H86C85 73 75.5 82 64 83.5C52.5 82 43 73 42 54Z"
            fill="url(#sacredGoldGrad)"
            stroke="#FDE68A"
            strokeWidth="1.2"
          />
          <rect x="60.5" y="83" width="7" height="14" rx="3" fill="#E2A83E" />
          <path
            d="M48 101C48 97.5 54 96 64 96C74 96 80 97.5 80 101H48Z"
            fill="#F4C96B"
          />
        </g>
      );

    case 'gospel-codex':
      return (
        <g>
          <circle
            cx="64"
            cy="64"
            r="44"
            stroke="#6E75F5"
            strokeWidth="1.6"
            strokeOpacity="0.5"
            fill="none"
          />
          <path
            d="M26 42L62 48V90L26 83V42Z"
            fill="url(#sacredIndigoGrad)"
            stroke="#A5ABFF"
            strokeWidth="1.3"
          />
          <path
            d="M102 42L66 48V90L102 83V42Z"
            fill="url(#sacredIndigoGrad)"
            stroke="#A5ABFF"
            strokeWidth="1.3"
          />
          <path
            d="M31 46L61 51V85L31 79V46Z"
            fill="#F8FAFC"
            fillOpacity="0.9"
          />
          <path
            d="M97 46L67 51V85L97 79V46Z"
            fill="#F8FAFC"
            fillOpacity="0.9"
          />
          <rect
            x="61.5"
            y="45"
            width="5"
            height="48"
            rx="2.5"
            fill="url(#sacredGoldGrad)"
          />
        </g>
      );

    case 'random-polyhedron':
      return (
        <g>
          <polygon
            points="64,20 98,39 98,89 64,108 30,89 30,39"
            fill="none"
            stroke="#E2A83E"
            strokeWidth="2"
            strokeOpacity="0.82"
          />
          <polygon
            points="64,31 91,50 81,87 47,87 37,50"
            fill="url(#sacredVioletOrbGrad)"
            stroke="#F5D0FE"
            strokeWidth="1.3"
          />
          <path
            d="M64 31L64 64M91 50L64 64M81 87L64 64M47 87L64 64M37 50L64 64"
            stroke="#FDE68A"
            strokeWidth="1.1"
            strokeOpacity="0.7"
          />
        </g>
      );

    case 'star-of-faith':
      return (
        <g>
          <circle
            cx="64"
            cy="64"
            r="45"
            stroke="#E2A83E"
            strokeWidth="2.2"
            strokeOpacity="0.72"
            fill="none"
          />
          <circle
            cx="64"
            cy="64"
            r="37"
            stroke="#FDE68A"
            strokeWidth="1"
            strokeOpacity="0.38"
            fill="none"
          />
          <polygon
            points="64,22 73.9,49.5 103.2,50.2 79.9,67.9 88.2,95.8 64,79.2 39.8,95.8 48.1,67.9 24.8,50.2 54.1,49.5"
            fill="url(#sacredGoldGrad)"
            stroke="#FFFBEB"
            strokeWidth="1.3"
          />
        </g>
      );
  }
}

export function SacredFallbackEmblem({
  stage,
  accentMode = 'default',
  reducedMotion = false,
}: SacredFallbackEmblemProps) {
  const metadata = SACRED_STAGE_METADATA[stage];

  return (
    <div
      className="sacred-fallback-emblem"
      data-testid="sacred-fallback-emblem"
      data-stage={stage}
      data-accent-mode={accentMode}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      aria-hidden="true"
    >
      <div
        className="sacred-fallback-glow"
        style={{ background: `radial-gradient(circle, ${metadata.glowColor} 0%, transparent 70%)` }}
      />
      <svg
        className="sacred-fallback-svg"
        width="128"
        height="128"
        viewBox="0 0 128 128"
        fill="none"
        focusable="false"
      >
        <defs>
          <linearGradient id="sacredGoldGrad" x1="24" y1="20" x2="104" y2="108" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FDE68A" />
            <stop offset="48%" stopColor="#E2A83E" />
            <stop offset="100%" stopColor="#B7791F" />
          </linearGradient>
          <radialGradient id="sacredVioletOrbGrad" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(54 52) rotate(48) scale(46)">
            <stop offset="0%" stopColor="#F0ABFC" />
            <stop offset="52%" stopColor="#B855C8" />
            <stop offset="100%" stopColor="#581C87" />
          </radialGradient>
          <linearGradient id="sacredIndigoGrad" x1="26" y1="42" x2="102" y2="90" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#818CF8" />
            <stop offset="55%" stopColor="#6E75F5" />
            <stop offset="100%" stopColor="#3730A3" />
          </linearGradient>
          <radialGradient id="sacredPearlGrad" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(61 41) scale(13)">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="65%" stopColor="#FEF3C7" />
            <stop offset="100%" stopColor="#E2A83E" />
          </radialGradient>
        </defs>
        {renderStageArtwork(stage, accentMode)}
      </svg>
    </div>
  );
}
