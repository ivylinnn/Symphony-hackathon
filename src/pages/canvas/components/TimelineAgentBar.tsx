import { KsIconAiAssistant, KsIconClose, KsIconSend, KsIconTips, KsIconUndo } from '@fe-infra/keystone-icons-react';
import clsx from 'clsx';
import { useState } from 'react';

import type { TimelineEditPlan } from '../types';

/** 空状态下的引导词，点一下直接填进输入框。 */
const SUGGESTIONS = [
  'Trim to 15 seconds',
  'Add captions',
  'Lay in a music bed',
  'Make the hook punchier',
  'Add a b-roll cutaway'
];

export interface DiffCounts {
  added: number;
  removed: number;
  changed: number;
  newTracks: number;
}

interface TimelineAgentBarProps {
  isBusy: boolean;
  /** 待确认的计划；为空表示处于输入态。 */
  plan: TimelineEditPlan | null;
  /** 被用户取消勾选、不会应用的操作 id。 */
  skippedOpIds: Set<string>;
  diff: DiffCounts | null;
  canUndo: boolean;
  onSubmit: (prompt: string) => void;
  onToggleOp: (operationId: string) => void;
  onApply: () => void;
  onDiscard: () => void;
  onUndo: () => void;
}

function DiffPill({ counts }: { counts: DiffCounts }) {
  const parts: string[] = [];
  if (counts.added) {
    parts.push(`+${counts.added} clip${counts.added > 1 ? 's' : ''}`);
  }
  if (counts.removed) {
    parts.push(`−${counts.removed} clip${counts.removed > 1 ? 's' : ''}`);
  }
  if (counts.changed) {
    parts.push(`${counts.changed} retimed`);
  }
  if (counts.newTracks) {
    parts.push(`+${counts.newTracks} track${counts.newTracks > 1 ? 's' : ''}`);
  }
  if (parts.length === 0) {
    return <span className="text-[11px] text-neutral-lowOnSurface">No net change</span>;
  }
  return <span className="text-[11px] tabular-nums text-neutral-mediumOnSurface">{parts.join(' · ')}</span>;
}

/** 还没有计划时占住上半区，说明这个面板是干什么的。 */
function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <span className="flex size-9 items-center justify-center rounded-full bg-primary-surface2 text-primary-onSurface">
        <KsIconAiAssistant size={18} />
      </span>
      <p className="text-[12px] leading-[17px] text-neutral-mediumOnSurface">
        Describe an edit and I’ll draft a plan you can review before it touches the timeline.
      </p>
    </div>
  );
}

/**
 * 右侧栏的 AI 编辑面板，交互参考 Flora：
 * 输入一句话 → Agent 给出一份可预览的编辑计划 → 逐条勾选后应用 → 可整体撤销。
 * 计划应用前只做预览，不改时间线状态。
 */
function TimelineAgentBar({
  isBusy,
  plan,
  skippedOpIds,
  diff,
  canUndo,
  onSubmit,
  onToggleOp,
  onApply,
  onDiscard,
  onUndo
}: TimelineAgentBarProps) {
  const [draft, setDraft] = useState('');

  const submit = () => {
    const content = draft.trim();
    if (!content || isBusy) {
      return;
    }
    onSubmit(content);
    setDraft('');
  };

  const acceptedCount = plan ? plan.operations.filter((op) => !skippedOpIds.has(op.id)).length : 0;

  return (
    <div data-timeline-agent className="flex min-h-0 flex-1 flex-col">
      {/* 上半区：无计划时是空状态，有计划时是逐条评审 */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {plan ? (
          <>
            <div className="flex items-start gap-2 px-3 pt-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-surface2 text-primary-onSurface">
                <KsIconAiAssistant size={13} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] leading-[17px] text-neutral-highOnSurface">{plan.summary}</p>
                <p className="mt-0.5 truncate text-[11px] text-neutral-lowOnSurface">“{plan.prompt}”</p>
              </div>
              <button
                type="button"
                title="Discard plan"
                onClick={onDiscard}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-neutral-lowOnSurface transition-colors hover:bg-neutral-surface2"
              >
                <KsIconClose size={12} />
              </button>
            </div>

            {plan.operations.length > 0 ? (
              <ul className="mt-2 px-3">
                {plan.operations.map((operation) => {
                  const skipped = skippedOpIds.has(operation.id);
                  return (
                    <li key={operation.id}>
                      <label
                        className={clsx(
                          'flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-neutral-surface1',
                          skipped && 'opacity-45'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={!skipped}
                          onChange={() => onToggleOp(operation.id)}
                          className="mt-0.5 size-3.5 shrink-0 accent-primary-fill"
                        />
                        <span
                          className={clsx(
                            'text-[12px] leading-[17px] text-neutral-highOnSurface',
                            skipped && 'line-through'
                          )}
                        >
                          {operation.label}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="px-3 pb-3 pt-2">
                <button
                  type="button"
                  onClick={onDiscard}
                  className="rounded-lg bg-neutral-surface2 px-2.5 py-1.5 text-[12px] font-medium text-neutral-highOnSurface transition-colors hover:bg-neutral-surface3"
                >
                  Dismiss
                </button>
              </div>
            )}
          </>
        ) : (
          <EmptyState />
        )}
      </div>

      {/* 计划的确认条，贴在输入框上方 */}
      {plan && plan.operations.length > 0 ? (
        <div className="shrink-0 border-t border-solid border-neutral-fillLow px-3 py-2.5">
          {/* 侧栏只有 280px，摘要单独占一行，按钮才不会被挤到换行 */}
          {diff ? (
            <div className="mb-2">
              <DiffPill counts={diff} />
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDiscard}
              className="flex-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-neutral-mediumOnSurface transition-colors hover:bg-neutral-surface2"
            >
              Discard
            </button>
            <button
              type="button"
              disabled={acceptedCount === 0}
              onClick={onApply}
              className={clsx(
                'flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors',
                acceptedCount > 0
                  ? 'bg-primary-fill text-neutral-onFill hover:opacity-90'
                  : 'cursor-not-allowed bg-neutral-surface2 text-neutral-lowOnSurface'
              )}
            >
              Apply {acceptedCount > 0 ? `${acceptedCount} edit${acceptedCount > 1 ? 's' : ''}` : ''}
            </button>
          </div>
        </div>
      ) : null}

      {/* 输入区常驻底部 */}
      <div className="shrink-0 border-t border-solid border-neutral-fillLow p-2.5">
        {!plan && !isBusy ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setDraft(suggestion)}
                className="flex items-center gap-1 rounded-full border border-solid border-neutral-fillLow bg-neutral-surface1 px-2.5 py-1 text-[11px] text-neutral-mediumOnSurface transition-colors hover:bg-neutral-surface2"
              >
                <KsIconTips size={11} />
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}

        <div
          className={clsx(
            'rounded-xl border border-solid bg-neutral-surface1 p-2 transition-colors',
            isBusy ? 'border-primary-fill/40' : 'border-neutral-fillLow focus-within:border-primary-fill'
          )}
        >
          <textarea
            value={draft}
            rows={3}
            disabled={isBusy}
            placeholder={
              isBusy ? 'Reading the timeline and drafting edits…' : 'Describe the edit — “trim to 15s”, “add captions”…'
            }
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter 发送，Shift+Enter 换行
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            className="w-full resize-none bg-transparent text-[13px] leading-[18px] text-neutral-highOnSurface outline-none placeholder:text-neutral-lowOnSurface disabled:cursor-wait"
          />
          <div className="flex items-center gap-2">
            {isBusy ? (
              <span className="flex items-center gap-1.5 text-[11px] text-neutral-lowOnSurface">
                <span className="size-1.5 animate-pulse rounded-full bg-primary-fill" />
                Thinking…
              </span>
            ) : null}
            <span className="flex-1" />
            {canUndo ? (
              <button
                type="button"
                title="Undo last AI edit"
                onClick={onUndo}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-neutral-mediumOnSurface transition-colors hover:bg-neutral-surface2"
              >
                <KsIconUndo size={12} />
                Undo AI edit
              </button>
            ) : null}
            <button
              type="button"
              title="Send"
              disabled={!draft.trim() || isBusy}
              onClick={submit}
              className={clsx(
                'flex size-7 items-center justify-center rounded-lg transition-colors',
                draft.trim() && !isBusy
                  ? 'bg-primary-fill text-neutral-onFill'
                  : 'cursor-not-allowed bg-neutral-surface2 text-neutral-lowOnSurface'
              )}
            >
              <KsIconSend size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TimelineAgentBar;
