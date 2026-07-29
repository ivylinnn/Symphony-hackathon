import { FIT_VIEW_PADDING, MAX_ZOOM, MIN_ZOOM, NODE_KIND_CONFIG, PORT_ROW_HEIGHT } from './const';
import type { CanvasEdge, CanvasNode, CanvasNodeKind, NodePortSpec, Viewport } from './types';

export const getNodeHeight = (kind: CanvasNodeKind) => NODE_KIND_CONFIG[kind].height;

export const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** 世界坐标 → 屏幕坐标。 */
export const worldToScreen = (x: number, y: number, viewport: Viewport) => ({
  x: x * viewport.zoom + viewport.x,
  y: y * viewport.zoom + viewport.y
});

/** 屏幕坐标 → 世界坐标。 */
export const screenToWorld = (x: number, y: number, viewport: Viewport) => ({
  x: (x - viewport.x) / viewport.zoom,
  y: (y - viewport.y) / viewport.zoom
});

/**
 * 端口行相对卡片顶部的偏移。
 * 多个端口以卡片竖直中线为基准均分，和 Flora 的挂边排布一致。
 */
export const getPortOffsetY = (index: number, total: number, kind: CanvasNodeKind) => {
  const center = getNodeHeight(kind) / 2;
  return center + (index - (total - 1) / 2) * PORT_ROW_HEIGHT;
};

/** 某个输出端口在世界坐标下的位置（卡片右侧）。 */
export const getSourcePort = (node: CanvasNode, outputId: string) => {
  const {outputs} = NODE_KIND_CONFIG[node.kind];
  const index = Math.max(
    0,
    outputs.findIndex((port) => port.id === outputId)
  );
  return {
    x: node.x + node.width,
    y: node.y + getPortOffsetY(index, outputs.length, node.kind)
  };
};

/** 某个输入端口在世界坐标下的位置（卡片左侧）。 */
export const getTargetPort = (node: CanvasNode, inputId: string) => {
  const {inputs} = NODE_KIND_CONFIG[node.kind];
  const index = Math.max(
    0,
    inputs.findIndex((port) => port.id === inputId)
  );
  return {
    x: node.x,
    y: node.y + getPortOffsetY(index, Math.max(inputs.length, 1), node.kind)
  };
};

/**
 * 给定来源输出，在目标节点上挑一个类型匹配的输入端口。
 * 匹配不到就退到第一个输入；目标没有输入时返回 undefined。
 */
export const findMatchingInput = (
  sourceKind: CanvasNodeKind,
  sourceOutput: string,
  targetKind: CanvasNodeKind
): NodePortSpec | undefined => {
  const sourcePort = NODE_KIND_CONFIG[sourceKind].outputs.find((port) => port.id === sourceOutput);
  const targetInputs = NODE_KIND_CONFIG[targetKind].inputs;
  return targetInputs.find((port) => port.type === sourcePort?.type) ?? targetInputs[0];
};

/** 统计某个输入端口已接入的连线数，用于展示 1/3 这样的容量。 */
export const countInputConnections = (edges: CanvasEdge[], nodeId: string, inputId: string) =>
  edges.filter((edge) => edge.target === nodeId && edge.targetInput === inputId).length;

/**
 * 水平三次贝塞尔连线。
 * 控制点偏移取水平距离的一半并设下限，短连线也不会塌成直线。
 */
export const buildEdgePath = (fromX: number, fromY: number, toX: number, toY: number) => {
  const offset = Math.max(40, Math.abs(toX - fromX) * 0.5);
  return `M ${fromX},${fromY} C ${fromX + offset},${fromY} ${toX - offset},${toY} ${toX},${toY}`;
};

/** 以指定屏幕点为锚点缩放，保证该点下的世界坐标不动。 */
export const zoomAtPoint = (viewport: Viewport, nextZoom: number, screenX: number, screenY: number): Viewport => {
  const zoom = clampZoom(nextZoom);
  const world = screenToWorld(screenX, screenY, viewport);
  return {
    zoom,
    x: screenX - world.x * zoom,
    y: screenY - world.y * zoom
  };
};

/** 计算能容纳所有节点的视口；无节点时回到原点。 */
export const getFitViewport = (nodes: CanvasNode[], containerWidth: number, containerHeight: number): Viewport => {
  if (nodes.length === 0 || containerWidth === 0 || containerHeight === 0) {
    return { x: 0, y: 0, zoom: 1 };
  }

  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width));
  const maxY = Math.max(...nodes.map((node) => node.y + getNodeHeight(node.kind)));

  const contentWidth = maxX - minX;
  const contentHeight = maxY - minY;
  const zoom = clampZoom(
    Math.min(
      (containerWidth - FIT_VIEW_PADDING * 2) / contentWidth,
      (containerHeight - FIT_VIEW_PADDING * 2) / contentHeight
    )
  );

  return {
    zoom,
    x: containerWidth / 2 - (minX + contentWidth / 2) * zoom,
    y: containerHeight / 2 - (minY + contentHeight / 2) * zoom
  };
};

/** 屏幕/世界坐标下的矩形，框选用。 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 由拖拽的两个角推出规范化矩形（支持反向拖）。 */
export const rectFromPoints = (x1: number, y1: number, x2: number, y2: number): Rect => ({
  x: Math.min(x1, x2),
  y: Math.min(y1, y2),
  width: Math.abs(x2 - x1),
  height: Math.abs(y2 - y1)
});

/** 节点与框选矩形是否相交；只要碰到就算选中，不要求完全包住。 */
export const isNodeInRect = (node: CanvasNode, rect: Rect) => {
  const height = getNodeHeight(node.kind);
  return (
    node.x < rect.x + rect.width &&
    node.x + node.width > rect.x &&
    node.y < rect.y + rect.height &&
    node.y + height > rect.y
  );
};
