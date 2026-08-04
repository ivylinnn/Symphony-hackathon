import { KsIconAiGeneration, KsIconFolder } from '@fe-infra/keystone-icons-react';
import clsx from 'clsx';
import { useEffect, useState } from 'react';

import { CONTENT_STRATEGIES, type ContentStrategy, type StrategyThumbNode } from '../content-strategies';

interface ContentStrategiesPopoverProps {
  onPick: (strategy: ContentStrategy) => void;
  onClose: () => void;
}

type StrategyTab = 'tiktok' | 'mine';

const THUMB_NODE_WIDTH = 20;
const THUMB_NODE_HEIGHT = 12;

/** 连接两个缩略节点的浅色弧线。 */
const thumbEdgePath = (from: StrategyThumbNode, to: StrategyThumbNode) => {
  const fromX = from.x + THUMB_NODE_WIDTH;
  const fromY = from.y + THUMB_NODE_HEIGHT / 2;
  const toX = to.x;
  const toY = to.y + THUMB_NODE_HEIGHT / 2;
  const offset = Math.max(10, (toX - fromX) / 2);
  return `M ${fromX},${fromY} C ${fromX + offset},${fromY} ${toX - offset},${toY} ${toX},${toY}`;
};

/** 策略卡片顶部的迷你节点图。 */
function StrategyThumb({ strategy }: { strategy: ContentStrategy }) {
  return (
    <svg viewBox="0 0 120 60" className="h-16 w-full">
      {strategy.thumb.edges.map(([from, to]) => {
        const source = strategy.thumb.nodes[from];
        const target = strategy.thumb.nodes[to];
        if (!source || !target) {
          return null;
        }
        return (
          <path
            key={`${from}-${to}`}
            d={thumbEdgePath(source, target)}
            className="stroke-neutral-fillLow"
            strokeWidth={1.2}
            fill="none"
          />
        );
      })}
      {strategy.thumb.nodes.map((node, index) => (
        <rect
          key={index}
          x={node.x}
          y={node.y}
          width={THUMB_NODE_WIDTH}
          height={THUMB_NODE_HEIGHT}
          rx={3}
          strokeWidth={1.2}
          className={node.colorClass}
        />
      ))}
    </svg>
  );
}

/**
 * 空画布首屏的内容策略弹层。
 * 点击一张策略卡即把对应的小工作流落到画布上；落地后节点全部可编辑。
 */
function ContentStrategiesPopover({ onPick, onClose }: ContentStrategiesPopoverProps) {
  const [tab, setTab] = useState<StrategyTab>('tiktok');

  /* Esc 关闭，和画布其它浮层一致。 */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center">
      {/* 透明遮罩：点击空白处关闭，但不遮暗画布 */}
      <div className="absolute inset-0" onPointerDown={onClose} />

      <div className="relative w-[640px] max-w-[92vw] rounded-2xl border border-solid border-neutral-fillLow bg-neutral-surface p-6 shadow-[0_24px_80px_rgba(16,24,40,0.18)]">
        <div className="flex items-center justify-center gap-2">
          <span className="text-primary-fill">
            <KsIconAiGeneration size={18} />
          </span>
          <h2 className="text-[16px] font-semibold text-neutral-highOnSurface">TikTok ads-native templates</h2>
        </div>
        <p className="mt-1 text-center text-[12px] text-neutral-mediumOnSurface">
          Start from a proven workflow — every node stays editable after it lands.
        </p>

        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => setTab('tiktok')}
            className={clsx(
              'h-8 rounded-full px-3.5 text-[12px] font-medium transition-colors',
              tab === 'tiktok'
                ? 'bg-neutral-fillHigh text-neutral-onFill'
                : 'bg-neutral-surface1 text-neutral-mediumOnSurface hover:bg-neutral-surface2'
            )}
          >
            TikTok ads-native templates
          </button>
          <button
            type="button"
            onClick={() => setTab('mine')}
            className={clsx(
              'h-8 rounded-full px-3.5 text-[12px] font-medium transition-colors',
              tab === 'mine'
                ? 'bg-neutral-fillHigh text-neutral-onFill'
                : 'bg-neutral-surface1 text-neutral-mediumOnSurface hover:bg-neutral-surface2'
            )}
          >
            My templates
          </button>
        </div>

        {tab === 'tiktok' ? (
          <div className="mt-4 grid grid-cols-3 gap-3">
            {CONTENT_STRATEGIES.map((strategy) => (
              <button
                key={strategy.id}
                type="button"
                title={`Start from ${strategy.title}`}
                onClick={() => onPick(strategy)}
                className="rounded-xl border border-solid border-neutral-fillLow bg-neutral-surface p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary-fill hover:shadow-[0_10px_30px_rgba(16,24,40,0.12)]"
              >
                <StrategyThumb strategy={strategy} />
                <div className="mt-2 flex items-center gap-1.5">
                  <span className={clsx('size-1.5 shrink-0 rounded-full', strategy.accentClass)} />
                  <span className="truncate text-[13px] font-semibold text-neutral-highOnSurface">
                    {strategy.title}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-neutral-lowOnSurface">{strategy.description}</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-4 flex h-[260px] flex-col items-center justify-center gap-2 rounded-xl bg-neutral-surface1 text-neutral-lowOnSurface">
            <KsIconFolder size={24} />
            <p className="text-[12px]">Nothing saved yet — select nodes and “Save as template” to keep one here.</p>
          </div>
        )}

        <p className="mt-4 text-center text-[11px] text-neutral-lowOnSurface">
          …or build from scratch with the ＋ panel on the left.
        </p>
      </div>
    </div>
  );
}

export default ContentStrategiesPopover;
