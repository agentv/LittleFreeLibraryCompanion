/** Line icons from the Neighborly composites (24x24 viewBox). */
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'camera'
  | 'back'
  | 'close'
  | 'more'
  | 'list'
  | 'shelf'
  | 'establishing'
  | 'location'
  | 'mic'
  | 'note'
  | 'play'
  | 'pause'
  | 'stop'
  | 'trash'
  | 'plus'
  | 'gallery'
  | 'clock'
  | 'person'
  | 'phone'
  | 'upload'
  | 'external'
  | 'chevron'
  | 'check'
  | 'shield';

export function Icon({ name, size = 22, color, strokeWidth = 2 }: { name: IconName; size?: number; color: string; strokeWidth?: number }) {
  const common = { fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const body = (() => {
    switch (name) {
      case 'camera':
        return (
          <>
            <Path d="M4 8h3l2-3h6l2 3h3v11H4z" {...common} />
            <Circle cx={12} cy={13} r={3.5} {...common} />
          </>
        );
      case 'back':
        return <Path d="M15 6l-6 6 6 6" {...common} />;
      case 'chevron':
        return <Path d="M9 6l6 6-6 6" {...common} />;
      case 'close':
        return <Path d="M6 6l12 12M18 6L6 18" {...common} />;
      case 'more':
        return (
          <>
            <Circle cx={5} cy={12} r={1.8} fill={color} />
            <Circle cx={12} cy={12} r={1.8} fill={color} />
            <Circle cx={19} cy={12} r={1.8} fill={color} />
          </>
        );
      case 'list':
        return <Path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1" {...common} />;
      case 'shelf':
        return <Path d="M5 5v14M10 5v14M14 7l4 12M5 19h14" {...common} />;
      case 'establishing':
        return (
          <>
            <Path d="M4 11l8-6 8 6v9H4z" {...common} />
            <Path d="M10 20v-5h4v5" {...common} />
          </>
        );
      case 'location':
        return (
          <>
            <Path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z" {...common} />
            <Circle cx={12} cy={9} r={2.5} {...common} />
          </>
        );
      case 'mic':
        return (
          <>
            <Rect x={9} y={3} width={6} height={11} rx={3} {...common} />
            <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" {...common} />
          </>
        );
      case 'note':
        return (
          <>
            <Path d="M5 4h14v16H5z" {...common} />
            <Path d="M8 9h8M8 13h8M8 17h5" {...common} />
          </>
        );
      case 'play':
        return <Path d="M7 4l13 8-13 8z" fill={color} />;
      case 'pause':
        return <Path d="M7 5h3v14H7zM14 5h3v14h-3z" fill={color} />;
      case 'stop':
        return <Rect x={6} y={6} width={12} height={12} rx={2} fill={color} />;
      case 'trash':
        return <Path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" {...common} />;
      case 'plus':
        return <Path d="M12 5v14M5 12h14" {...common} />;
      case 'gallery':
        return (
          <>
            <Rect x={4} y={4} width={16} height={16} rx={3} {...common} />
            <Path d="M4 16l5-5 4 4 3-3 4 4" {...common} />
          </>
        );
      case 'clock':
        return (
          <>
            <Circle cx={12} cy={12} r={8} {...common} />
            <Path d="M12 8v4l3 2" {...common} />
          </>
        );
      case 'person':
        return (
          <>
            <Circle cx={12} cy={9} r={4} {...common} />
            <Path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" {...common} />
          </>
        );
      case 'phone':
        return (
          <>
            <Rect x={7} y={3} width={10} height={18} rx={2.5} {...common} />
            <Path d="M11 17.5h2" {...common} />
          </>
        );
      case 'upload':
        return <Path d="M12 16V4M7 9l5-5 5 5M5 20h14" {...common} />;
      case 'external':
        return <Path d="M14 5h5v5M19 5l-8 8M17 14v5H5V7h5" {...common} />;
      case 'check':
        return <Path d="M5 12l5 5 9-10" {...common} />;
      case 'shield':
        return <Path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" {...common} />;
    }
  })();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {body}
    </Svg>
  );
}
