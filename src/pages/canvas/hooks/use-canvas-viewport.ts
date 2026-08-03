import { type Dispatch, type RefObject, type SetStateAction, useCallback, useEffect, useRef, useState } from 'react';

import { ZOOM_STEP } from '../const';
import type { Viewport } from '../types';
import { clampZoom, zoomAtPoint } from '../utils';

interface UseCanvasViewportOptions {
  containerRef: RefObject<HTMLDivElement>;
}

/** 指数缓动的时间常数（毫秒）：60fps 下每帧收敛约 24%，帧率无关。 */
const EASE_TAU_MS = 60;
/** 单步 dt 的上限，避免后台标签页恢复时一步跳变过猛。 */
const MAX_STEP_MS = 200;
/** 滚轮 deltaY → 缩放倍率的灵敏度：factor = e^(-deltaY * k)。 */
const WHEEL_ZOOM_SENSITIVITY = 0.0022;
/** 与目标差距小于该阈值时直接吸附收尾。 */
const ZOOM_EPSILON = 0.001;
const PAN_EPSILON = 0.5;

/**
 * 管理画布视口的平移与缩放。
 *
 * 缩放不再瞬跳：wheel / 按钮只更新目标视口，rAF 循环以指数缓动逐帧逼近，
 * 手感对齐 Figma / Flora。任何直接 setViewport（拖拽平移等）都会打断动画。
 *
 * wheel 必须以 passive: false 手动绑定：ctrl/⌘ + wheel 要 preventDefault，
 * 否则会触发浏览器整页缩放而不是画布缩放。
 */
export const useCanvasViewport = ({ containerRef }: UseCanvasViewportOptions) => {
  const [viewport, setViewportState] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  /** rAF 回调里要读到最新视口，state 之外再存一份。 */
  const viewportRef = useRef(viewport);
  const animRef = useRef<{ raf: number; target: Viewport } | null>(null);

  const stopAnimation = useCallback(() => {
    if (animRef.current) {
      cancelAnimationFrame(animRef.current.raf);
      animRef.current = null;
    }
  }, []);

  useEffect(() => stopAnimation, [stopAnimation]);

  /** 立即设置视口并打断进行中的缓动（拖拽平移、fit 的初始化等直接落位场景）。 */
  const setViewport: Dispatch<SetStateAction<Viewport>> = useCallback(
    (next) => {
      stopAnimation();
      setViewportState((current) => {
        const value = typeof next === 'function' ? next(current) : next;
        viewportRef.current = value;
        return value;
      });
    },
    [stopAnimation]
  );

  /** 以指数缓动把视口动画到目标；动画中再次调用只是改目标，不会重启循环。 */
  const animateViewportTo = useCallback((target: Viewport) => {
    if (animRef.current) {
      animRef.current.target = target;
      return;
    }

    let lastTime = performance.now();

    const step = (now: number) => {
      const anim = animRef.current;
      if (!anim) {
        return;
      }
      // 按真实流逝时间收敛，掉帧或后台节流时不至于变成慢动作
      const dt = Math.min(MAX_STEP_MS, now - lastTime);
      lastTime = now;
      const ease = 1 - Math.exp(-dt / EASE_TAU_MS);

      const current = viewportRef.current;
      const goal = anim.target;
      const done =
        Math.abs(goal.zoom - current.zoom) < ZOOM_EPSILON &&
        Math.abs(goal.x - current.x) < PAN_EPSILON &&
        Math.abs(goal.y - current.y) < PAN_EPSILON;

      const value = done
        ? goal
        : {
            x: current.x + (goal.x - current.x) * ease,
            y: current.y + (goal.y - current.y) * ease,
            zoom: current.zoom + (goal.zoom - current.zoom) * ease
          };

      viewportRef.current = value;
      setViewportState(value);

      if (done) {
        animRef.current = null;
      } else {
        anim.raf = requestAnimationFrame(step);
      }
    };

    animRef.current = { target, raf: requestAnimationFrame(step) };
  }, []);

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
        // 基于当前目标（而非当前帧）累积，连续滚动时缩放中心保持稳定
        const base = animRef.current?.target ?? viewportRef.current;
        const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
        animateViewportTo(zoomAtPoint(base, clampZoom(base.zoom * factor), pointerX, pointerY));
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
  }, [animateViewportTo, containerRef, setViewport]);

  /** 以容器中心为锚点按档位缩放，供工具栏按钮使用。 */
  const zoomBy = useCallback(
    (factor: number) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const rect = container.getBoundingClientRect();
      const base = animRef.current?.target ?? viewportRef.current;
      animateViewportTo(zoomAtPoint(base, clampZoom(base.zoom * factor), rect.width / 2, rect.height / 2));
    },
    [animateViewportTo, containerRef]
  );

  const zoomIn = useCallback(() => zoomBy(ZOOM_STEP), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(1 / ZOOM_STEP), [zoomBy]);

  const resetZoom = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const rect = container.getBoundingClientRect();
    const base = animRef.current?.target ?? viewportRef.current;
    animateViewportTo(zoomAtPoint(base, 1, rect.width / 2, rect.height / 2));
  }, [animateViewportTo, containerRef]);

  const panBy = useCallback(
    (dx: number, dy: number) => {
      setViewport((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
    },
    [setViewport]
  );

  const setZoom = useCallback(
    (zoom: number) => {
      setViewport((current) => ({ ...current, zoom: clampZoom(zoom) }));
    },
    [setViewport]
  );

  return { viewport, setViewport, animateViewportTo, stopAnimation, zoomIn, zoomOut, resetZoom, panBy, setZoom };
};
