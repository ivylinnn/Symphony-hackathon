import { AUDIO_CLIPS_WIDTH, NODE_DEFAULT_WIDTH, NODE_KIND_CONFIG, STORYBOARD_EMPTY_WIDTH } from './const';
import type { AdsNativeNodeKind, CanvasEdge, CanvasNode, CanvasNodeKind } from './types';
import { findMatchingInput, getNodeHeight } from './utils';

let idSeq = 0;

/** 画布内的临时 id；接入后端后应改用服务端返回的 id。 */
export const createId = (prefix: string) => {
  idSeq += 1;
  return `${prefix}-${Date.now()}-${idSeq}`;
};

/** 分镜空态卡更窄、Audio Clips 要跟分镜同宽；其余节点用统一默认宽度。 */
const WIDTH_BY_KIND: Partial<Record<CanvasNodeKind, number>> = {
  storyboard: STORYBOARD_EMPTY_WIDTH,
  'audio-clips': AUDIO_CLIPS_WIDTH
};

const defaultWidthFor = (kind: CanvasNodeKind) => WIDTH_BY_KIND[kind] ?? NODE_DEFAULT_WIDTH;

export const buildNode = (kind: CanvasNodeKind, x: number, y: number, title?: string): CanvasNode => ({
  id: createId('node'),
  kind,
  x,
  y,
  width: defaultWidthFor(kind),
  title: title ?? NODE_KIND_CONFIG[kind].label,
  status: 'idle'
});

/** 以卡片中心为基准放置节点。 */
export const buildNodeAtCenter = (kind: CanvasNodeKind, centerX: number, centerY: number, title?: string) =>
  buildNode(kind, centerX - defaultWidthFor(kind) / 2, centerY - getNodeHeight({ kind }) / 2, title);

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

/**
 * 首屏种子图：产品图 + 品牌资产汇入 Product brief 的最小工作流。
 * 用户一进画布就能看到「一份产品源」长什么样，再从 brief 里探索变体。
 */
export const buildSeedGraph = (): { nodes: CanvasNode[]; edges: CanvasEdge[] } => {
  const productImages = { ...buildNode('product-images', 140, 100), status: 'done' as const };
  const brandKit = { ...buildNode('brand-kit', 140, 620), status: 'done' as const };
  const brief = { ...buildNode('product-brief', 640, 260), status: 'done' as const };
  let edges: CanvasEdge[] = [];
  edges = appendEdge(edges, productImages.id, 'out', brief.id, 'image');
  edges = appendEdge(edges, brandKit.id, 'out', brief.id, 'image');
  return { nodes: [productImages, brandKit, brief], edges };
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
