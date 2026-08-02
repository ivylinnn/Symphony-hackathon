import clsx from 'clsx';
import { type RefObject, useRef } from 'react';

import type { CanvasNode, Viewport } from '../types';
import { getNodeHeight } from '../utils';

interface MinimapProps {
  nodes: CanvasNode[];
  viewport: Viewport;
  containerRef: RefObject<HTMLDivElement>;
  /** Agent 面板展开时向左让位。 */
  isAgentOpen: boolean;
  /** 立即把视口平移到目标位置（世界坐标为视口中心）。 */
  onNavigate: (worldX: number, worldY: number) => void;
}

/** 小地图内容区尺寸（不含内边距）。 */
const MAP_WIDTH = 176;
const MAP_HEIGHT = 104;
const MAP_PADDING = 8;

/**
 * 右下角小地图：灰块是节点，蓝框是当前视口。
 * 点击或拖拽任意位置，视口中心即移动到对应的世界坐标。
 */
function Minimap({ nodes, viewport, containerRef, isAgentOpen, onNavigate }: MinimapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const containerRect = containerRef.current?.getBoundingClientRect();

  if (nodes.length === 0 || !containerRect) {
    return null;
  }

  /* 世界坐标下的可视区域。 */
  const viewWorld = {
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
    width: containerRect.width / viewport.zoom,
    height: containerRect.height / viewport.zoom
  };

  /* 包围盒 = 所有节点 ∪ 当前视口，保证蓝框永远画得下。 */
  const minX = Math.min(...nodes.map((node) => node.x), viewWorld.x);
  const minY = Math.min(...nodes.map((node) => node.y), viewWorld.y);
  const maxX = Math.max(...nodes.map((node) => node.x + node.width), viewWorld.x + viewWorld.width);
  const maxY = Math.max(...nodes.map((node) => node.y + getNodeHeight(node)), viewWorld.y + viewWorld.height);

  const scale = Math.min(MAP_WIDTH / Math.max(1, maxX - minX), MAP_HEIGHT / Math.max(1, maxY - minY));
  /* 内容在小地图里居中。 */
  const contentOffsetX = MAP_PADDING + (MAP_WIDTH - (maxX - minX) * scale) / 2;
  const contentOffsetY = MAP_PADDING + (MAP_HEIGHT - (maxY - minY) * scale) / 2;

  const toMap = (worldX: number, worldY: number) => ({
    x: (worldX - minX) * scale + contentOffsetX,
    y: (worldY - minY) * scale + contentOffsetY
  });

  const navigateTo = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const worldX = (event.clientX - rect.left - contentOffsetX) / scale + minX;
    const worldY = (event.clientY - rect.top - contentOffsetY) / scale + minY;
    onNavigate(worldX, worldY);
  };

  const viewRect = toMap(viewWorld.x, viewWorld.y);

  return (
    <div
      ref={mapRef}
      data-minimap
      className={clsx(
        'absolute bottom-4 z-20 cursor-pointer overflow-hidden rounded-xl border border-solid border-neutral-fillLow bg-neutral-surface shadow-[0_10px_30px_rgba(16,24,40,0.16)]',
        isAgentOpen ? 'right-[352px]' : 'right-24'
      )}
      style={{ width: MAP_WIDTH + MAP_PADDING * 2, height: MAP_HEIGHT + MAP_PADDING * 2 }}
      onPointerDown={(event) => {
        event.stopPropagation();
        isDraggingRef.current = true;
        navigateTo(event);
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // 合成事件可能没有有效 pointerId，此时放弃捕获但保留点击导航
        }
      }}
      onPointerMove={(event) => {
        if (isDraggingRef.current) {
          navigateTo(event);
        }
      }}
      onPointerUp={() => {
        isDraggingRef.current = false;
      }}
      onPointerCancel={() => {
        isDraggingRef.current = false;
      }}
    >
      {nodes.map((node) => {
        const position = toMap(node.x, node.y);
        return (
          <div
            key={node.id}
            className="absolute rounded-[2px] bg-neutral-fillLow"
            style={{
              left: position.x,
              top: position.y,
              width: Math.max(3, node.width * scale),
              height: Math.max(2, getNodeHeight(node) * scale)
            }}
          />
        );
      })}
      <div
        className="absolute rounded-[3px] border border-solid border-primary-fill bg-primary-fill/10"
        style={{
          left: viewRect.x,
          top: viewRect.y,
          width: viewWorld.width * scale,
          height: viewWorld.height * scale
        }}
      />
    </div>
  );
}

export default Minimap;
