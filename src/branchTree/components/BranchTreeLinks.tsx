import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { BranchTreeLayoutEdge } from '../engine/types';

interface BranchTreeLinksProps {
  edges: BranchTreeLayoutEdge[];
}

const EDGE_BOUNDS_PADDING = 12;

interface LocalizedEdgePath {
  height: number;
  id: string;
  kind: BranchTreeLayoutEdge['kind'];
  left: number;
  path: string;
  top: number;
  width: number;
}

function formatPathNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function localizeEdgePath(edge: BranchTreeLayoutEdge): LocalizedEdgePath | null {
  const numbers = edge.path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (numbers.length < 8 || numbers.some((value) => !Number.isFinite(value))) {
    return null;
  }
  const [startX, startY, controlX1, controlY1, controlX2, controlY2, endX, endY] =
    numbers;
  const xs = [startX, controlX1, controlX2, endX];
  const ys = [startY, controlY1, controlY2, endY];
  const left = Math.min(...xs) - EDGE_BOUNDS_PADDING;
  const top = Math.min(...ys) - EDGE_BOUNDS_PADDING;
  const width = Math.max(1, Math.max(...xs) - Math.min(...xs) + EDGE_BOUNDS_PADDING * 2);
  const height = Math.max(1, Math.max(...ys) - Math.min(...ys) + EDGE_BOUNDS_PADDING * 2);
  const localPath = [
    'M',
    formatPathNumber(startX - left),
    formatPathNumber(startY - top),
    'C',
    formatPathNumber(controlX1 - left),
    formatPathNumber(controlY1 - top),
    formatPathNumber(controlX2 - left),
    formatPathNumber(controlY2 - top),
    formatPathNumber(endX - left),
    formatPathNumber(endY - top),
  ].join(' ');
  return {
    height,
    id: edge.id,
    kind: edge.kind,
    left,
    path: localPath,
    top,
    width,
  };
}

export function BranchTreeLinks({ edges }: BranchTreeLinksProps) {
  const localizedEdges = edges
    .map(localizeEdgePath)
    .filter((edge): edge is LocalizedEdgePath => edge !== null);

  return (
    <View pointerEvents="none" style={styles.root}>
      {localizedEdges.map((edge) => (
        <View
          key={edge.id}
          style={[
            styles.edgeHost,
            {
              height: edge.height,
              left: edge.left,
              top: edge.top,
              width: edge.width,
            },
          ]}
        >
          <Svg height={edge.height} pointerEvents="none" width={edge.width}>
            <Path
              d={edge.path}
              fill="none"
              stroke={edge.kind === 'active' ? '#D07C60' : '#D1C9BE'}
              strokeDasharray={edge.kind === 'active' ? undefined : '3,3'}
              strokeLinecap="round"
              strokeWidth={edge.kind === 'active' ? 3.5 : 1.8}
            />
          </Svg>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  edgeHost: {
    position: 'absolute',
  },
  root: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
