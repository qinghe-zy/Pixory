import Svg, { Circle, Line } from 'react-native-svg';

import { aiLightColors } from '../../components/ai/aiLightTheme';

interface BranchTreeGridProps {
  width: number;
  height: number;
  smallStep?: number;
  largeStep?: number;
}

export function BranchTreeGrid({ height, largeStep = 100, smallStep = 20, width }: BranchTreeGridProps) {
  const dots = [];
  const lines = [];

  for (let x = 0; x <= width; x += smallStep) {
    for (let y = 0; y <= height; y += smallStep) {
      dots.push(<Circle cx={x} cy={y} fill={aiLightColors.muted} key={`dot:${x}:${y}`} opacity={0.08} r={1} />);
    }
  }

  for (let x = 0; x <= width; x += largeStep) {
    lines.push(
      <Line
        key={`vx:${x}`}
        opacity={0.08}
        stroke={aiLightColors.hairline}
        strokeWidth={1}
        x1={x}
        x2={x}
        y1={0}
        y2={height}
      />
    );
  }

  for (let y = 0; y <= height; y += largeStep) {
    lines.push(
      <Line
        key={`hy:${y}`}
        opacity={0.08}
        stroke={aiLightColors.hairline}
        strokeWidth={1}
        x1={0}
        x2={width}
        y1={y}
        y2={y}
      />
    );
  }

  return (
    <Svg height={height} pointerEvents="none" width={width}>
      {dots}
      {lines}
    </Svg>
  );
}
