import Svg, { Circle, Path, Polyline } from 'react-native-svg';
import { colors } from '../theme/tokens';

export type IconName =
  | 'pulse'
  | 'feed'
  | 'plus'
  | 'compass'
  | 'chevronRight'
  | 'chevronLeft'
  | 'heart'
  | 'heartFilled'
  | 'comment'
  | 'trophy'
  | 'flame'
  | 'mountain'
  | 'clock'
  | 'target'
  | 'trendUp'
  | 'trendDown'
  | 'share'
  | 'settings'
  | 'lock'
  | 'sparkle'
  | 'community'
  | 'calendar'
  | 'check'
  | 'rest'
  | 'send'
  | 'close'
  | 'search'
  | 'bell'
  | 'zap'
  | 'moon'
  | 'route'
  | 'play';

/**
 * Hand-drawn icon set rather than a font pack: it keeps the visual language
 * specific to this product and removes a font-loading dependency that can flash
 * unstyled glyphs on first paint.
 */
export const Icon = ({
  name,
  size = 22,
  color = colors.textSecondary,
  strokeWidth = 1.9,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) => {
  const common = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'pulse' && (
        <Polyline points="2,13 7,13 10,5 14,19 17,13 22,13" {...common} />
      )}
      {name === 'feed' && (
        <>
          <Path d="M4 6h16" {...common} />
          <Path d="M4 12h16" {...common} />
          <Path d="M4 18h10" {...common} />
        </>
      )}
      {name === 'plus' && (
        <>
          <Path d="M12 5v14" {...common} />
          <Path d="M5 12h14" {...common} />
        </>
      )}
      {name === 'compass' && (
        <>
          <Circle cx="12" cy="12" r="9" {...common} />
          <Path d="M15.5 8.5l-2 5-5 2 2-5z" {...common} />
        </>
      )}
      {name === 'chevronRight' && <Path d="M9 5l7 7-7 7" {...common} />}
      {name === 'chevronLeft' && <Path d="M15 5l-7 7 7 7" {...common} />}
      {(name === 'heart' || name === 'heartFilled') && (
        <Path
          d="M12 20s-7-4.5-7-9a4 4 0 017-2.6A4 4 0 0119 11c0 4.5-7 9-7 9z"
          {...common}
          fill={name === 'heartFilled' ? color : 'none'}
        />
      )}
      {name === 'comment' && (
        <Path d="M20 15a2 2 0 01-2 2H8l-4 4V6a2 2 0 012-2h12a2 2 0 012 2z" {...common} />
      )}
      {name === 'trophy' && (
        <>
          <Path d="M7 4h10v5a5 5 0 01-10 0z" {...common} />
          <Path d="M7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3" {...common} />
          <Path d="M12 14v4M9 20h6" {...common} />
        </>
      )}
      {name === 'flame' && (
        <Path
          d="M12 3s5 4 5 9a5 5 0 01-10 0c0-2 1-3 1-3s.5 2 2 2c0-3 2-5 2-8z"
          {...common}
        />
      )}
      {name === 'mountain' && <Path d="M3 19l6-11 4 7 2-3 6 7z" {...common} />}
      {name === 'clock' && (
        <>
          <Circle cx="12" cy="12" r="9" {...common} />
          <Path d="M12 7v5l3 2" {...common} />
        </>
      )}
      {name === 'target' && (
        <>
          <Circle cx="12" cy="12" r="9" {...common} />
          <Circle cx="12" cy="12" r="4.5" {...common} />
          <Circle cx="12" cy="12" r="0.8" fill={color} stroke={color} />
        </>
      )}
      {name === 'trendUp' && (
        <>
          <Polyline points="3,17 9,11 13,15 21,7" {...common} />
          <Polyline points="15,7 21,7 21,13" {...common} />
        </>
      )}
      {name === 'trendDown' && (
        <>
          <Polyline points="3,7 9,13 13,9 21,17" {...common} />
          <Polyline points="15,17 21,17 21,11" {...common} />
        </>
      )}
      {name === 'share' && (
        <>
          <Path d="M12 3v13" {...common} />
          <Path d="M8 7l4-4 4 4" {...common} />
          <Path d="M5 14v5a2 2 0 002 2h10a2 2 0 002-2v-5" {...common} />
        </>
      )}
      {name === 'settings' && (
        <>
          <Circle cx="12" cy="12" r="3" {...common} />
          <Path
            d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1A1.6 1.6 0 008 19.4a1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H2a2 2 0 110-4h.1A1.6 1.6 0 004.6 8a1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V2a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H22a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z"
            {...common}
          />
        </>
      )}
      {name === 'lock' && (
        <>
          <Path d="M5 11h14v9H5z" {...common} />
          <Path d="M8 11V8a4 4 0 018 0v3" {...common} />
        </>
      )}
      {name === 'community' && (
        <>
          <Circle cx="9" cy="8" r="3.4" {...common} />
          <Path d="M2.5 20a6.5 6.5 0 0113 0" {...common} />
          <Path d="M16 5.5a3.4 3.4 0 010 5.6" {...common} />
          <Path d="M17.5 14.4A6.5 6.5 0 0121.5 20" {...common} />
        </>
      )}
      {name === 'calendar' && (
        <>
          <Path d="M4 6h16v15H4z" {...common} />
          <Path d="M4 10h16" {...common} />
          <Path d="M8 3v4M16 3v4" {...common} />
        </>
      )}
      {name === 'check' && <Path d="M4 12.5l5 5L20 6.5" {...common} />}
      {name === 'search' && (
        <>
          <Circle cx="11" cy="11" r="7" {...common} />
          <Path d="M16.2 16.2L21 21" {...common} />
        </>
      )}
      {name === 'bell' && (
        <>
          <Path d="M18 8a6 6 0 10-12 0c0 6-2 7-2 7h16s-2-1-2-7" {...common} />
          <Path d="M10.3 20a2 2 0 003.4 0" {...common} />
        </>
      )}
      {name === 'zap' && <Path d="M13 2L4 13h7l-1 9 9-11h-7z" {...common} />}
      {name === 'moon' && <Path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" {...common} />}
      {name === 'route' && (
        <>
          <Circle cx="6" cy="18" r="2.6" {...common} />
          <Circle cx="18" cy="6" r="2.6" {...common} />
          <Path d="M8.5 17c5 0 3-10 7-10" {...common} />
        </>
      )}
      {name === 'play' && <Path d="M7 4.5l12 7.5-12 7.5z" {...common} />}
      {name === 'close' && (
        <>
          <Path d="M6 6l12 12" {...common} />
          <Path d="M18 6L6 18" {...common} />
        </>
      )}
      {name === 'rest' && (
        <Path d="M20 14a8 8 0 01-10-10 8 8 0 1010 10z" {...common} />
      )}
      {name === 'send' && (
        <>
          <Path d="M21 3L10.5 13.5" {...common} />
          <Path d="M21 3l-6.5 18-4-8-8-4z" {...common} />
        </>
      )}
      {name === 'sparkle' && (
        <>
          <Path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" {...common} />
          <Path d="M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" {...common} />
        </>
      )}
    </Svg>
  );
};
