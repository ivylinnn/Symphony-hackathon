import { useMemo } from 'react';

import type { CanvasEdge, CanvasNode, PendingConnection } from '../types';
import { buildEdgePath, getSourcePort, getTargetPort } from '../utils';

interface EdgeLayerProps {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedIds: string[];
  pendingConnection: PendingConnection | null;
}

/**
 * 连线层。
 * 用一个铺满世界坐标系的 SVG 承载所有连线，overflow visible 让负坐标也能画出来；
 * pointer-events 关掉，避免挡住节点拖拽。
 */
function EdgeLayer({ nodes, edges, selectedIds, pendingConnection }: EdgeLayerProps) {
  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const pendingPath = useMemo(() => {
    if (!pendingConnection) {
      return null;
    }
    const source = nodeMap.get(pendingConnection.source);
    if (!source) {
      return null;
    }
    const from = getSourcePort(source, pendingConnection.sourceOutput);
    return buildEdgePath(from.x, from.y, pendingConnection.toX, pendingConnection.toY);
  }, [nodeMap, pendingConnection]);

  /*
   * 尺寸必须非 0：Chrome 下 0×0 的 SVG viewport 不会绘制 overflow 出去的内容，
   * 连线会整体消失。1px + overflow-visible 才画得出来。
   */
  return (
    <svg className="pointer-events-none absolute left-0 top-0 h-px w-px overflow-visible">
      {edges.map((edge) => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) {
          return null;
        }

        const from = getSourcePort(source, edge.sourceOutput);
        const to = getTargetPort(target, edge.targetInput);
        const isActive = selectedIds.includes(edge.source) || selectedIds.includes(edge.target);

        return (
          <path
            key={edge.id}
            d={buildEdgePath(from.x, from.y, to.x, to.y)}
            fill="none"
            strokeWidth={isActive ? 2 : 1.5}
            stroke="currentColor"
            className="text-neutral-highOnSurface"
          />
        );
      })}

      {pendingPath ? (
        <path
          d={pendingPath}
          fill="none"
          strokeWidth={2}
          strokeDasharray="6 4"
          stroke="currentColor"
          className="text-neutral-highOnSurface"
        />
      ) : null}
    </svg>
  );
}

export default EdgeLayer;
