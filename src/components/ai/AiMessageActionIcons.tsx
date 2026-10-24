import Svg, { Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';

export interface ActionIconProps {
  color?: string;
  size?: number;
}

/** 复制图标 - 1:1 复刻 code.html */
export function CopyIcon({ color = '#94A3B8', size = 16 }: ActionIconProps) {
  return (
    <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <Rect
        height="13"
        rx="2"
        ry="2"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        width="13"
        x="9"
        y="9"
      />
      <Path
        d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </Svg>
  );
}

/** 收藏图标 - 1:1 复刻 code.html，选中态金色/暖黄色填充，无外周圆圈 */
export function FavoriteStarIcon({
  color = '#94A3B8',
  favorited = false,
  size = 16,
}: ActionIconProps & { favorited?: boolean }) {
  const strokeColor = favorited ? '#F59E0B' : color;
  const fillColor = favorited ? '#F59E0B' : 'none';
  return (
    <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <Polygon
        fill={fillColor}
        points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
        stroke={strokeColor}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </Svg>
  );
}

/** 续答图标 - 1:1 复刻 code.html */
export function ContinueReplyIcon({ color = '#94A3B8', size = 16 }: ActionIconProps) {
  return (
    <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <Polygon
        points="6 4 18 12 6 20 6 4"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <Line
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        x1="18"
        x2="18"
        y1="4"
        y2="20"
      />
    </Svg>
  );
}

/** 重新生成图标 - 1:1 复刻 code.html */
export function RegenerateIcon({ color = '#94A3B8', size = 16 }: ActionIconProps) {
  return (
    <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <Path
        d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <Path
        d="M3 3v5h5"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <Path
        d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <Path
        d="M16 16h5v5"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </Svg>
  );
}

/** 版本翻页左箭头 - 1:1 复刻 code.html */
export function ChevronLeftIcon({ color = '#64748B', size = 14 }: ActionIconProps) {
  return (
    <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <Polyline
        points="15 18 9 12 15 6"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </Svg>
  );
}

/** 版本翻页右箭头 - 1:1 复刻 code.html */
export function ChevronRightIcon({ color = '#64748B', size = 14 }: ActionIconProps) {
  return (
    <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <Polyline
        points="9 18 15 12 9 6"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </Svg>
  );
}

/** 断点接续图标（原继续生成） - 专用于弹窗菜单，双箭头表示从中断处快速接续生成 */
export function ContinueGenerationIcon({ color = '#64748B', size = 18 }: ActionIconProps) {
  return (
    <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <Polygon
        points="3 5 11 12 3 19 3 5"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <Polygon
        points="11 5 19 12 11 19 11 5"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </Svg>
  );
}

export const ResumeBreakpointIcon = ContinueGenerationIcon;

/** 选择文本图标 - 专用于弹窗菜单 */
export function SelectTextIcon({ color = '#64748B', size = 18 }: ActionIconProps) {
  return (
    <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <Path
        d="M4 7V4h16v3M9 20h6M12 4v16"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </Svg>
  );
}

/** 修改 / 重写图标 */
export function EditIcon({ color = '#64748B', size = 16 }: ActionIconProps) {
  return (
    <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <Path
        d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <Path
        d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </Svg>
  );
}

/** 删除图标 */
export function DeleteIcon({ color = '#EF4444', size = 18 }: ActionIconProps) {
  return (
    <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <Polyline
        points="3 6 5 6 21 6"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <Path
        d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </Svg>
  );
}
