import { type RefObject, useCallback, useEffect, useState } from 'react';

import { ZOOM_STEP } from '../const';
import type { Viewport } from '../types';
import { clampZoom, zoomAtPoint } from '../utils';

interface UseCanvasViewportOptions {
  containerRef: RefObject<HTMLDivElement>;
}

/**
 * 管理画布视口的平移与缩放。
 * wheel 必须以 passive: false 手动绑定：ctrl/⌘ + wheel 要 preventDefault，
 * 否则会触发浏览器整页缩放而不是画布缩放。
 */
export const useCanvasViewport = ({ containerRef }: UseCanvasViewportOptions) => {
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;

      // ctrl/⌘ + wheel 以及触控板捏合（浏览器同样上报 ctrlKey）走缩放
      if (event.ctrlKey || event.metaKey) {
        setViewport((current) =>
          zoomAtPoint(current, current.zoom * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP), pointerX, pointerY)
        );
        return;
      }

      // 其余滚动按平移处理，贴合触控板双指的直觉
      setViewport((current) => ({
        ...current,
        x: current.x - event.deltaX,
        y: current.y - event.deltaY
      }));
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [containerRef]);

  /** 以容器中心为锚点按档位缩放，供工具栏按钮使用。 */
  const zoomBy = useCallback(
    (factor: number) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const rect = container.getBoundingClientRect();
      setViewport((current) => zoomAtPoint(current, current.zoom * factor, rect.width / 2, rect.height / 2));
    },
    [containerRef]
  );

  const zoomIn = useCallback(() => zoomBy(ZOOM_STEP), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(1 / ZOOM_STEP), [zoomBy]);

  const resetZoom = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const rect = container.getBoundingClientRect();
    setViewport((current) => zoomAtPoint(current, 1, rect.width / 2, rect.height / 2));
  }, [containerRef]);

  const panBy = useCallback((dx: number, dy: number) => {
    setViewport((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
  }, []);

  const setZoom = useCallback((zoom: number) => {
    setViewport((current) => ({ ...current, zoom: clampZoom(zoom) }));
  }, []);

  return { viewport, setViewport, zoomIn, zoomOut, resetZoom, panBy, setZoom };
};
