import { type Dispatch, type SetStateAction, useCallback } from 'react';

import { appendEdge } from '../graph-ops';
import type { CanvasEdge, CanvasNode } from '../types';
import { findMatchingInput } from '../utils';

interface UseCanvasConnectionsOptions {
  nodes: CanvasNode[];
  setEdges: Dispatch<SetStateAction<CanvasEdge[]>>;
}

/** 建立连线的两种方式：命中具体端口，或落在卡片上自动择一。 */
export const useCanvasConnections = ({ nodes, setEdges }: UseCanvasConnectionsOptions) => {
  /** 精确连到指定输入端口。 */
  const connect = useCallback(
    (sourceId: string, sourceOutput: string, targetId: string, targetInput: string) => {
      if (sourceId === targetId) {
        return;
      }
      setEdges((current) => appendEdge(current, sourceId, sourceOutput, targetId, targetInput));
    },
    [setEdges]
  );

  /** 只给目标节点，自动挑一个类型匹配的输入——用于在卡片任意位置松手。 */
  const connectToBestInput = useCallback(
    (sourceId: string, sourceOutput: string, targetId: string) => {
      const source = nodes.find((node) => node.id === sourceId);
      const target = nodes.find((node) => node.id === targetId);
      if (!source || !target || sourceId === targetId) {
        return;
      }
      const matched = findMatchingInput(source.kind, sourceOutput, target.kind);
      if (matched) {
        setEdges((current) => appendEdge(current, sourceId, sourceOutput, targetId, matched.id));
      }
    },
    [nodes, setEdges]
  );

  return { connect, connectToBestInput };
};
