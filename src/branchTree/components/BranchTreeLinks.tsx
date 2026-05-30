import Svg, { Path } from 'react-native-svg';

import type { BranchTreeLayoutEdge } from '../engine/types';

interface BranchTreeLinksProps {
  edges: BranchTreeLayoutEdge[];
  width: number;
  height: number;
}

export function BranchTreeLinks({ edges, height, width }: BranchTreeLinksProps) {
  return (
    <Svg height={height} pointerEvents="none" width={width}>
      {edges.map((edge) => (
        <Path
          d={edge.path}
          fill="none"
          key={edge.id}
          stroke={edge.kind === 'active' ? '#D07C60' : '#D1C9BE'}
          strokeDasharray={edge.kind === 'active' ? undefined : '3,3'}
          strokeLinecap="round"
          strokeWidth={edge.kind === 'active' ? 3.5 : 1.8}
        />
      ))}
    </Svg>
  );
}
