import { useCallback } from 'react';

import { NodeNotWiredError, runNode } from '../services/node-runner';
import type { CanvasEdge, CanvasNode } from '../types';

interface UseNodeExecutionOptions {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  patchNode: (nodeId: string, patch: Partial<CanvasNode>) => void;
}

/**
 * 执行单个节点：把上游节点的文本作为上下文，调平台已有的生成能力。
 * 状态流转 generating → done/idle；失败原因留在卡片上，不静默吞掉。
 */
export const useNodeExecution = ({ nodes, edges, patchNode }: UseNodeExecutionOptions) =>
  useCallback(
    async (nodeId: string) => {
      const node = nodes.find((item) => item.id === nodeId);
      if (!node) {
        return;
      }

      const upstreamIds = edges.filter((edge) => edge.target === nodeId).map((edge) => edge.source);
      const upstream = nodes.filter((item) => upstreamIds.includes(item.id));

      patchNode(nodeId, { status: 'generating', error: undefined });
      try {
        const result = await runNode(node, upstream);
        patchNode(nodeId, {
          status: 'done',
          text: result.text ?? node.text,
          assetUrl: result.assetUrl,
          note: result.note,
          error: undefined
        });
      } catch (error) {
        const notWired = error instanceof NodeNotWiredError;
        patchNode(nodeId, {
          status: 'idle',
          error: notWired ? 'No backend wired for this node yet' : (error as Error)?.message || 'Generation failed'
        });
      }
    },
    [edges, nodes, patchNode]
  );
