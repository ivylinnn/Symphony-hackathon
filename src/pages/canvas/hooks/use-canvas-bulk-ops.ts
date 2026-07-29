import { type Dispatch, type SetStateAction, useCallback } from 'react';

import { createId } from '../graph-ops';
import type { CanvasEdge, CanvasNode } from '../types';

interface UseCanvasBulkOpsOptions {
  setNodes: Dispatch<SetStateAction<CanvasNode[]>>;
  setEdges: Dispatch<SetStateAction<CanvasEdge[]>>;
}

/** 复制时的错位量，避免和原节点完全重叠。 */
const DUPLICATE_OFFSET = 32;

/** 框选之后的批量操作。 */
export const useCanvasBulkOps = ({ setNodes, setEdges }: UseCanvasBulkOpsOptions) => {
  /** 批量删除：连同挂在这些节点上的连线一起清掉。 */
  const removeNodes = useCallback(
    (nodeIds: string[]) => {
      const doomed = new Set(nodeIds);
      if (doomed.size === 0) {
        return;
      }
      setNodes((current) => current.filter((node) => !doomed.has(node.id)));
      setEdges((current) => current.filter((edge) => !doomed.has(edge.source) && !doomed.has(edge.target)));
    },
    [setEdges, setNodes]
  );

  /**
   * 批量复制：整体偏移一个身位。
   * 选区内部的连线一并复制，跨越选区边界的连线不复制（否则会接到原节点上）。
   */
  const duplicateNodes = useCallback(
    (nodeIds: string[]) => {
      const picked = new Set(nodeIds);
      if (picked.size === 0) {
        return [];
      }

      const idMap = new Map<string, string>();
      nodeIds.forEach((id) => idMap.set(id, createId('node')));

      setNodes((current) => [
        ...current,
        ...current
          .filter((node) => picked.has(node.id))
          .map((node) => ({
            ...node,
            id: idMap.get(node.id) as string,
            x: node.x + DUPLICATE_OFFSET,
            y: node.y + DUPLICATE_OFFSET
          }))
      ]);

      setEdges((current) => [
        ...current,
        ...current
          .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
          .map((edge) => ({
            ...edge,
            id: createId('edge'),
            source: idMap.get(edge.source) as string,
            target: idMap.get(edge.target) as string
          }))
      ]);

      return [...idMap.values()];
    },
    [setEdges, setNodes]
  );

  return { removeNodes, duplicateNodes };
};
