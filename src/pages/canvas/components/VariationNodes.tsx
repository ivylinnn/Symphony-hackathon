import { KsIconAiGeneration, KsIconChevronDown, KsIconChevronRight, KsIconCut, KsIconSend } from '@fe-infra/keystone-icons-react';
import clsx from 'clsx';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import type { CanvasNode, VariationEvent, VariationPlan, VariationSpec, VariationStatus } from '../types';
import {
  ALL_VARY_DIMENSIONS,
  DEFAULT_VARIATION_PLAN,
  MAX_VARIATIONS,
  PLAN_AUDIENCES,
  PLAN_DIRECTIONS,
  PLAN_OBJECTIVES,
  PLAN_PLATFORMS,
  STRATEGY_PRESETS
} from '../variation-plans';

/**
 * 变体探索的三张卡：
 * brief 底部的 planner（先说清什么该变）、strategy 卡（一条方向一个理由）、
 * variation-set 容器（默认收起的一组可控变体）。
 */

type OnEvent = (event: VariationEvent) => void;

/* ------------------------------------------------------------------ */
/* Brief 底部的 variation planner                                       */
/* ------------------------------------------------------------------ */

function ChipRow({
  label,
  options,
  value,
  onPick
}: {
  label: string;
  options: string[];
  value: string;
  onPick: (option: string) => void;
}) {
  return (
    <div className="mt-2">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-lowOnSurface">{label}</div>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onPick(option)}
            onPointerDown={(event) => event.stopPropagation()}
            className={clsx(
              'rounded-full border border-solid px-2 py-0.5 text-[11px] font-medium transition-colors',
              option === value
                ? 'border-primary-fill bg-primary-surface2 text-primary-onSurface'
                : 'border-neutral-fillLow bg-neutral-surface text-neutral-mediumOnSurface hover:bg-neutral-surface2'
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 变体规划区，挂在 Product brief 卡的底部。
 * 显式声明目标 / 受众 / 促销 / 平台 / 方向和数量——避免生成六个没人要的随机表亲。
 */
export function BriefVariationPlanner({ node, onEvent }: { node: CanvasNode; onEvent: OnEvent }) {
  const plan = node.variationPlan ?? DEFAULT_VARIATION_PLAN;
  const isOpen = Boolean(node.variationPlannerOpen);
  const isBusy = node.status === 'generating';

  const patch = (partial: Partial<VariationPlan>) => onEvent({ type: 'plan-change', plan: { ...plan, ...partial } });

  /* 「Add new」创意方向：点开一个小输入框，回车落成已选中的自定义 chip。 */
  const [isAddingDirection, setIsAddingDirection] = useState(false);
  const [directionDraft, setDirectionDraft] = useState('');
  /** 候选 = 预置方向 ∪ 自定义方向（自定义的都在选中集里）。 */
  const directionOptions = [...PLAN_DIRECTIONS, ...plan.directions.filter((item) => !PLAN_DIRECTIONS.includes(item))];

  const toggleDirection = (direction: string) =>
    patch({
      directions: plan.directions.includes(direction)
        ? plan.directions.filter((item) => item !== direction)
        : [...plan.directions, direction]
    });

  const commitNewDirection = () => {
    const label = directionDraft.trim();
    setIsAddingDirection(false);
    setDirectionDraft('');
    if (label && !plan.directions.includes(label)) {
      patch({ directions: [...plan.directions, label] });
    }
  };

  return (
    <div className="mt-2 shrink-0 rounded-lg border border-solid border-neutral-fillLow bg-neutral-surface1">
      <button
        type="button"
        data-variation-planner-toggle
        onClick={() => onEvent({ type: 'toggle-planner' })}
        onPointerDown={(event) => event.stopPropagation()}
        className="flex w-full items-center gap-1.5 px-2 py-2 text-left"
      >
        <KsIconAiGeneration size={13} className="shrink-0 text-primary-fill" />
        <span className="flex-1 text-[12px] font-semibold text-neutral-highOnSurface">Brainstorm concepts</span>
        <span className="text-[10px] text-neutral-lowOnSurface">
          {plan.count} × {plan.platform}
        </span>
        {isOpen ? <KsIconChevronDown size={12} /> : <KsIconChevronRight size={12} />}
      </button>

      {isOpen ? (
        <div className="border-t border-solid border-neutral-fillLow px-2 pb-2" data-variation-planner>
          <ChipRow label="Objective" options={PLAN_OBJECTIVES} value={plan.objective} onPick={(objective) => patch({ objective })} />
          <ChipRow label="Audience" options={PLAN_AUDIENCES} value={plan.audience} onPick={(audience) => patch({ audience })} />
          <ChipRow label="Platform" options={PLAN_PLATFORMS} value={plan.platform} onPick={(platform) => patch({ platform })} />
          <div className="mt-2" data-direction-row>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-lowOnSurface">
              Creative direction
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {directionOptions.map((direction) => {
                const isPicked = plan.directions.includes(direction);
                return (
                  <button
                    key={direction}
                    type="button"
                    aria-pressed={isPicked}
                    onClick={() => toggleDirection(direction)}
                    onPointerDown={(event) => event.stopPropagation()}
                    className={clsx(
                      'rounded-full border border-solid px-2 py-0.5 text-[11px] font-medium transition-colors',
                      isPicked
                        ? 'border-primary-fill bg-primary-surface2 text-primary-onSurface'
                        : 'border-neutral-fillLow bg-neutral-surface text-neutral-mediumOnSurface hover:bg-neutral-surface2'
                    )}
                  >
                    {direction}
                  </button>
                );
              })}
              {isAddingDirection ? (
                <input
                  autoFocus
                  value={directionDraft}
                  placeholder="New direction…"
                  data-direction-input
                  onChange={(event) => setDirectionDraft(event.target.value)}
                  onPointerDown={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitNewDirection();
                    }
                    if (event.key === 'Escape') {
                      setIsAddingDirection(false);
                      setDirectionDraft('');
                    }
                  }}
                  onBlur={commitNewDirection}
                  className="w-28 rounded-full border border-solid border-primary-fill bg-neutral-surface px-2 py-0.5 text-[11px] text-neutral-highOnSurface outline-none"
                />
              ) : (
                <button
                  type="button"
                  data-direction-add
                  onClick={() => setIsAddingDirection(true)}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="rounded-full border border-dashed border-neutral-fillMedHigh px-2 py-0.5 text-[11px] font-medium text-neutral-mediumOnSurface transition-colors hover:border-primary-fill hover:text-primary-fill"
                >
                  ＋ Add new
                </button>
              )}
            </div>
          </div>

          <div className="mt-2 flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-lowOnSurface">Offer</div>
              <input
                value={plan.offer}
                onChange={(event) => patch({ offer: event.target.value })}
                onPointerDown={(event) => event.stopPropagation()}
                className="w-full rounded-md border border-solid border-neutral-fillLow bg-neutral-surface px-2 py-1 text-[11px] text-neutral-highOnSurface outline-none focus:border-primary-fill"
              />
            </div>
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-lowOnSurface">Variations</div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title="Fewer variations"
                  onClick={() => patch({ count: Math.max(1, plan.count - 1) })}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="flex size-6 items-center justify-center rounded-md border border-solid border-neutral-fillLow bg-neutral-surface text-[13px] text-neutral-mediumOnSurface hover:bg-neutral-surface2"
                >
                  −
                </button>
                <span className="w-5 text-center text-[12px] font-semibold tabular-nums text-neutral-highOnSurface">
                  {plan.count}
                </span>
                <button
                  type="button"
                  title="More variations"
                  onClick={() => patch({ count: Math.min(MAX_VARIATIONS, plan.count + 1) })}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="flex size-6 items-center justify-center rounded-md border border-solid border-neutral-fillLow bg-neutral-surface text-[13px] text-neutral-mediumOnSurface hover:bg-neutral-surface2"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            data-variation-explore
            disabled={isBusy}
            onClick={() => onEvent({ type: 'explore' })}
            onPointerDown={(event) => event.stopPropagation()}
            className={clsx(
              'mt-2.5 w-full rounded-lg py-1.5 text-[12px] font-semibold transition-opacity',
              isBusy ? 'cursor-not-allowed bg-neutral-surface2 text-neutral-lowOnSurface' : 'bg-primary-fill text-neutral-onFill hover:opacity-90'
            )}
          >
            {isBusy ? 'Proposing directions…' : `Explore ${plan.count} ${plan.platform} concepts`}
          </button>
          <button
            type="button"
            data-variation-quick-explore
            disabled={isBusy}
            onClick={() => onEvent({ type: 'quick-explore' })}
            onPointerDown={(event) => event.stopPropagation()}
            className="mt-1 w-full py-0.5 text-center text-[11px] font-medium text-neutral-mediumOnSurface underline-offset-2 hover:underline"
          >
            Quick explore — one set of {plan.count} distinct concepts
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Strategy 卡：一条方向、一个理由                                        */
/* ------------------------------------------------------------------ */

export function StrategyBody({ node, onEvent }: { node: CanvasNode; onEvent: OnEvent }) {
  const preset = STRATEGY_PRESETS.find((item) => item.id === node.note);
  const isBusy = node.status === 'generating';
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5">
        <span className={clsx('size-2 shrink-0 rounded-full', preset?.accentClass ?? 'bg-primary-fill')} />
        <span className="truncate text-[13px] font-semibold text-neutral-highOnSurface">{node.title}</span>
      </div>

      <p className="mt-2 flex-1 overflow-y-auto rounded-lg bg-neutral-surface1 px-2 py-1.5 text-[11px] leading-[16px] text-neutral-mediumOnSurface">
        {node.rationale ?? 'A deliberate creative direction. Connect a brief and expand it into variations.'}
      </p>

      {/* 每条方向自己决定要探索什么：可开关的 Vary 维度 */}
      <div className="mt-2" data-strategy-vary>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-lowOnSurface">Vary</div>
        <div className="flex flex-wrap gap-1">
          {ALL_VARY_DIMENSIONS.map((dimension) => {
            const isOn = (node.varyDimensions ?? []).includes(dimension);
            return (
              <button
                key={dimension}
                type="button"
                aria-pressed={isOn}
                title={isOn ? `Stop varying ${dimension}` : `Let ${dimension} vary`}
                onClick={() => onEvent({ type: 'toggle-dimension', dimension })}
                onPointerDown={(event) => event.stopPropagation()}
                className={clsx(
                  'rounded-full border border-solid px-2 py-0.5 text-[10px] font-medium transition-colors',
                  isOn
                    ? 'border-primary-fill bg-primary-surface2 text-primary-onSurface'
                    : 'border-neutral-fillLow bg-neutral-surface text-neutral-lowOnSurface hover:bg-neutral-surface2'
                )}
              >
                {dimension}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        data-strategy-expand
        disabled={isBusy}
        onClick={() => onEvent({ type: 'expand-strategy' })}
        onPointerDown={(event) => event.stopPropagation()}
        className={clsx(
          'mt-2 w-full rounded-lg py-1.5 text-[12px] font-semibold transition-opacity',
          isBusy ? 'cursor-not-allowed bg-neutral-surface2 text-neutral-lowOnSurface' : 'bg-primary-fill text-neutral-onFill hover:opacity-90'
        )}
      >
        {isBusy ? 'Generating…' : 'Generate variations'}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Variation set 容器                                                   */
/* ------------------------------------------------------------------ */

const STATUS_STYLE: Record<VariationStatus, string> = {
  draft: 'bg-neutral-surface2 text-neutral-mediumOnSurface',
  selected: 'bg-primary-surface2 text-primary-onSurface',
  edited: 'bg-amber-100 text-amber-700',
  exported: 'bg-emerald-100 text-emerald-700'
};

function StatusChip({ status }: { status: VariationStatus }) {
  return (
    <span className={clsx('rounded-full px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide', STATUS_STYLE[status])}>
      {status}
    </span>
  );
}

function Thumb({ variation, className }: { variation: VariationSpec; className?: string }) {
  return variation.thumbnail ? (
    <img src={variation.thumbnail} alt={variation.name} draggable={false} className={clsx('object-cover', className)} />
  ) : (
    <div className={clsx('bg-gradient-to-br from-primary-surface2 to-neutral-surface2', className)} />
  );
}

/** 收起态里的迷你预览卡：缩略图 + 名字 + 状态点。 */
function MiniCard({ variation, onEvent }: { variation: VariationSpec; onEvent: OnEvent }) {
  return (
    <button
      type="button"
      title={`${variation.name} — ${variation.whatChanged}`}
      onClick={() => onEvent({ type: 'select-variation', variationId: variation.id })}
      onPointerDown={(event) => event.stopPropagation()}
      className={clsx(
        'overflow-hidden rounded-lg border border-solid text-left transition-colors',
        variation.status === 'selected' ? 'border-primary-fill' : 'border-neutral-fillLow hover:border-neutral-fillMedHigh'
      )}
    >
      <Thumb variation={variation} className="aspect-[9/16] w-full" />
      <div className="px-1.5 py-1">
        <div className="truncate text-[10px] font-medium text-neutral-highOnSurface">{variation.name}</div>
        <div className="mt-0.5 flex items-center gap-1">
          <StatusChip status={variation.status} />
        </div>
      </div>
    </button>
  );
}

/** 展开态里的完整变体卡：缩略图 + 名字 + 改动 + 受众 + hook + 信心 + 操作。 */
function FullCard({ variation, onEvent }: { variation: VariationSpec; onEvent: OnEvent }) {
  return (
    <div
      className={clsx(
        'flex gap-2 rounded-xl border border-solid p-2 transition-colors',
        variation.status === 'selected' ? 'border-primary-fill bg-primary-surface2/30' : 'border-neutral-fillLow bg-neutral-surface'
      )}
      data-variation-card
    >
      <Thumb variation={variation} className="aspect-[9/16] w-16 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-neutral-highOnSurface">
            {variation.name}
          </span>
          <StatusChip status={variation.status} />
        </div>
        <p className="mt-1 text-[10px] leading-[14px] text-neutral-mediumOnSurface">{variation.whatChanged}</p>
        <p className="mt-1 truncate text-[10px] text-neutral-lowOnSurface">
          <span className="font-semibold">{variation.audience}</span> · “{variation.hook}”
        </p>
        {/* 信心分：一条细条 + 一句 rationale，回答「为什么值得试」 */}
        <div className="mt-1.5 flex items-center gap-1.5" title={variation.rationale}>
          <div className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-neutral-surface2">
            <div className="h-full rounded-full bg-primary-fill" style={{ width: `${variation.confidence}%` }} />
          </div>
          <span className="truncate text-[9px] text-neutral-lowOnSurface">
            {variation.confidence}% · {variation.rationale}
          </span>
        </div>
        <div className="mt-1.5 flex gap-1">
          <button
            type="button"
            onClick={() => onEvent({ type: 'select-variation', variationId: variation.id })}
            onPointerDown={(event) => event.stopPropagation()}
            className={clsx(
              'rounded-md px-2 py-0.5 text-[10px] font-semibold transition-colors',
              variation.status === 'selected'
                ? 'bg-primary-fill text-neutral-onFill'
                : 'bg-neutral-surface2 text-neutral-highOnSurface hover:bg-neutral-fillLow'
            )}
          >
            {variation.status === 'selected' ? 'Selected' : 'Select'}
          </button>
          <button
            type="button"
            title="Deep branch: three controlled versions, only the hook and CTA change"
            onClick={() => onEvent({ type: 'more-like-this', variationId: variation.id })}
            onPointerDown={(event) => event.stopPropagation()}
            className="rounded-md bg-neutral-surface2 px-2 py-0.5 text-[10px] font-semibold text-neutral-highOnSurface transition-colors hover:bg-neutral-fillLow"
          >
            More like this
          </button>
          <button
            type="button"
            title="Materialize on the canvas and open in the editor"
            onClick={() => onEvent({ type: 'open-variation', variationId: variation.id })}
            onPointerDown={(event) => event.stopPropagation()}
            className="flex items-center gap-1 rounded-md bg-neutral-surface2 px-2 py-0.5 text-[10px] font-semibold text-neutral-highOnSurface transition-colors hover:bg-neutral-fillLow"
          >
            <KsIconCut size={9} />
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}

/** Keep constant / Vary：这组变体会保住什么、探索什么——整个体验里最重要的控制。 */
function VariationControls({ node, onEvent }: { node: CanvasNode; onEvent: OnEvent }) {
  const keep = node.keepConstant ?? [];
  const vary = node.varyDimensions ?? [];
  return (
    <div className="mt-2 rounded-lg bg-neutral-surface1 p-2" data-variation-controls>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-lowOnSurface">Keep constant</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {keep.map((dimension) => (
          <span
            key={dimension}
            className="flex items-center gap-1 rounded-full bg-neutral-surface px-2 py-0.5 text-[10px] font-medium text-neutral-highOnSurface"
          >
            <span className="size-1.5 rounded-full bg-neutral-fillMedHigh" />
            {dimension}
          </span>
        ))}
      </div>
      <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-lowOnSurface">Vary</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {ALL_VARY_DIMENSIONS.map((dimension) => {
          const isOn = vary.includes(dimension);
          return (
            <button
              key={dimension}
              type="button"
              title={isOn ? `Stop varying ${dimension}` : `Let ${dimension} vary`}
              onClick={() => onEvent({ type: 'toggle-dimension', dimension })}
              onPointerDown={(event) => event.stopPropagation()}
              className={clsx(
                'rounded-full border border-solid px-2 py-0.5 text-[10px] font-medium transition-colors',
                isOn
                  ? 'border-primary-fill bg-primary-surface2 text-primary-onSurface'
                  : 'border-neutral-fillLow bg-neutral-surface text-neutral-lowOnSurface hover:bg-neutral-surface2'
              )}
            >
              {dimension}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 容器底部的补充指令输入：一句话调整整组变体（配速、语气、UGC 感…）。 */
function RefineComposer({ node, onEvent }: { node: CanvasNode; onEvent: OnEvent }) {
  const [draft, setDraft] = useState('');
  const isBusy = node.status === 'generating';

  const submit = () => {
    const prompt = draft.trim();
    if (!prompt || isBusy) {
      return;
    }
    onEvent({ type: 'refine', prompt });
    setDraft('');
  };

  return (
    <div
      className="mt-2 flex items-end gap-1.5 rounded-xl border border-solid border-neutral-fillLow bg-neutral-surface1 p-2 focus-within:border-primary-fill"
      data-variation-refine
    >
      <textarea
        value={draft}
        rows={2}
        placeholder="Anything else? e.g. lean more UGC, faster pacing, show the pocket sooner…"
        onChange={(event) => setDraft(event.target.value)}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        className="min-w-0 flex-1 resize-none bg-transparent text-[12px] leading-[17px] text-neutral-highOnSurface outline-none placeholder:text-neutral-lowOnSurface"
      />
      <button
        type="button"
        title="Apply this guidance to the set"
        disabled={!draft.trim() || isBusy}
        onClick={submit}
        onPointerDown={(event) => event.stopPropagation()}
        className={clsx(
          'flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors',
          draft.trim() && !isBusy
            ? 'bg-primary-fill text-neutral-onFill hover:opacity-90'
            : 'cursor-not-allowed bg-neutral-surface2 text-neutral-lowOnSurface'
        )}
      >
        <KsIconSend size={13} />
      </button>
    </div>
  );
}

function GeneratingRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center gap-2 text-[12px] text-neutral-mediumOnSurface">
      <span className="size-3 animate-spin rounded-full border-2 border-solid border-neutral-fillMedHigh border-t-primary-fill" />
      {children}
    </div>
  );
}

/**
 * Variation set 容器：默认收起（迷你预览网格），展开后是完整变体卡 + Keep/Vary 控制。
 * 展开不等于摊到画布——「Add to canvas」才把变体落成真正的节点。
 */
export function VariationSetBody({ node, onEvent }: { node: CanvasNode; onEvent: OnEvent }) {
  const variations = node.variations ?? [];
  const isExpanded = Boolean(node.variationsExpanded);

  /*
   * 高度贴合内容：卡片高度是固定值（端口/fitView 依赖），
   * 所以内容自然高度一变就上报，由 index 把节点高度 patch 成正好包住内容。
   */
  const bodyRef = useRef<HTMLDivElement>(null);
  const hasContent = node.status !== 'generating' && variations.length > 0;
  useEffect(() => {
    const element = bodyRef.current;
    if (!element || !hasContent) {
      return;
    }
    const report = () => onEvent({ type: 'content-resize', height: element.scrollHeight });
    report();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
    // onEvent 每次渲染都是新引用；观察目标只随展开态/卡数变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasContent, isExpanded, variations.length]);

  if (node.status === 'generating') {
    return <GeneratingRow>Generating {node.variationPlan?.count ?? ''} controlled variations…</GeneratingRow>;
  }

  if (variations.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-3 text-center text-[11px] leading-[16px] text-neutral-lowOnSurface">
        Connect a strategy or brief, then generate — variations land here as one expandable set.
      </div>
    );
  }

  return (
    <div ref={bodyRef} className="flex flex-col">
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-neutral-highOnSurface">
          {variations.length} concepts
        </span>
        <button
          type="button"
          data-variation-set-toggle
          onClick={() => onEvent({ type: 'toggle-expanded' })}
          onPointerDown={(event) => event.stopPropagation()}
          className="flex items-center gap-1 rounded-md bg-neutral-surface1 px-2 py-1 text-[11px] font-medium text-neutral-highOnSurface transition-colors hover:bg-neutral-surface2"
        >
          {isExpanded ? <KsIconChevronDown size={11} /> : <KsIconChevronRight size={11} />}
          {isExpanded ? 'Collapse' : 'Expand'}
        </button>
        <button
          type="button"
          title={
            variations.some((variation) => variation.status === 'selected')
              ? 'Place only the selected story on the canvas'
              : 'Place every variation on the canvas as its own node'
          }
          data-variation-add-to-canvas
          onClick={() => onEvent({ type: 'expand-to-canvas' })}
          onPointerDown={(event) => event.stopPropagation()}
          className="rounded-md bg-neutral-surface1 px-2 py-1 text-[11px] font-medium text-neutral-highOnSurface transition-colors hover:bg-neutral-surface2"
        >
          {variations.some((variation) => variation.status === 'selected') ? 'Add selected to canvas' : 'Add to canvas'}
        </button>
      </div>

      {isExpanded ? (
        <div className="mt-2">
          <div className="grid grid-cols-2 gap-2">
            {variations.map((variation) => (
              <FullCard key={variation.id} variation={variation} onEvent={onEvent} />
            ))}
          </div>
          <VariationControls node={node} onEvent={onEvent} />
          <RefineComposer node={node} onEvent={onEvent} />
        </div>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {variations.map((variation) => (
              <MiniCard key={variation.id} variation={variation} onEvent={onEvent} />
            ))}
          </div>
          <RefineComposer node={node} onEvent={onEvent} />
        </>
      )}
    </div>
  );
}
