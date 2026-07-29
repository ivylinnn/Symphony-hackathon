import { NODE_DEFAULT_WIDTH, NODE_KIND_CONFIG } from './const';
import type { AdsNativeNodeKind, CanvasEdge, CanvasNode, CanvasNodeKind } from './types';
import { findMatchingInput, getNodeHeight } from './utils';

let idSeq = 0;

/** 画布内的临时 id；接入后端后应改用服务端返回的 id。 */
export const createId = (prefix: string) => {
  idSeq += 1;
  return `${prefix}-${Date.now()}-${idSeq}`;
};

export const buildNode = (kind: CanvasNodeKind, x: number, y: number, title?: string): CanvasNode => ({
  id: createId('node'),
  kind,
  x,
  y,
  width: NODE_DEFAULT_WIDTH,
  title: title ?? NODE_KIND_CONFIG[kind].label,
  status: 'idle'
});

/** 以卡片中心为基准放置节点。 */
export const buildNodeAtCenter = (kind: CanvasNodeKind, centerX: number, centerY: number, title?: string) =>
  buildNode(kind, centerX - NODE_DEFAULT_WIDTH / 2, centerY - getNodeHeight(kind) / 2, title);

/** 追加一条连线；同源同目标同输入的重复连线会被忽略。 */
export const appendEdge = (
  edges: CanvasEdge[],
  source: string,
  sourceOutput: string,
  target: string,
  targetInput: string
): CanvasEdge[] => {
  const exists = edges.some(
    (edge) => edge.source === source && edge.target === target && edge.targetInput === targetInput
  );
  if (exists) {
    return edges;
  }
  return [...edges, { id: createId('edge'), source, sourceOutput, target, targetInput }];
};

/** Agent 生成脚本节点时的纵向间距。 */
const SCRIPT_ROW_GAP = 220;

/**
 * 把 Agent 产出的脚本段落变成一串纵向排列、首尾相连的节点。
 * 纯函数：返回新节点和新连线，由调用方合并进 state。
 */
export const buildScriptNodes = (
  sections: Array<{ kind: AdsNativeNodeKind; text: string }>,
  centerX: number,
  centerY: number
): { nodes: CanvasNode[]; edges: CanvasEdge[] } => {
  if (sections.length === 0) {
    return { nodes: [], edges: [] };
  }

  const nodes = sections.map((section, index) => ({
    ...buildNodeAtCenter(
      section.kind,
      centerX,
      centerY + (index - (sections.length - 1) / 2) * SCRIPT_ROW_GAP
    ),
    text: section.text,
    status: 'done' as const
  }));

  const edges = nodes.slice(1).reduce<CanvasEdge[]>((acc, node, index) => {
    const previous = nodes[index];
    const input = findMatchingInput(previous.kind, 'out', node.kind);
    return input ? appendEdge(acc, previous.id, 'out', node.id, input.id) : acc;
  }, []);

  return { nodes, edges };
};
