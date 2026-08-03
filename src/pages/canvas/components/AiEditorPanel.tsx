import {
  KsIconAiAssistant,
  KsIconChevronRight,
  KsIconSend,
  KsIconTips,
  KsIconUndo
} from '@fe-infra/keystone-icons-react';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';

import type { AiEditorMessage } from '../types';

/** 空状态下的引导词，点一下直接发出去。 */
const SUGGESTIONS = [
  'Trim to 15 seconds',
  'Add captions',
  'Lay in a music bed',
  'Make the hook punchier',
  'Remove a clip'
];

export interface DiffCounts {
  added: number;
  removed: number;
  changed: number;
  newTracks: number;
}

interface AiEditorPanelProps {
  isBusy: boolean;
  messages: AiEditorMessage[];
  /** 当前正在预览的计划消息 id，只有它显示应用/放弃按钮。 */
  pendingPlanId: string | null;
  skippedOpIds: Set<string>;
  diff: DiffCounts | null;
  onSubmit: (prompt: string) => void;
  onAnswer: (messageId: string, option: string) => void;
  onToggleOp: (operationId: string) => void;
  onApply: () => void;
  onDiscard: () => void;
  onRestore: (messageId: string) => void;
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

/** 思考过程：进行中逐条揭示，结束后折叠成一行摘要，可再展开。 */
function ThinkingBlock({ steps, revealed }: { steps: string[]; revealed: number }) {
  // steps 还没回来时 revealed/length 都是 0，不能算「思考完」，否则请求期间会显示 "Thought for 0 steps"
  const isDone = steps.length > 0 && revealed >= steps.length;
  const [isOpen, setIsOpen] = useState(true);

  /* 思考完成时自动收起，避免会话被推理过程刷屏 */
  useEffect(() => {
    if (isDone) {
      setIsOpen(false);
    }
  }, [isDone]);

  return (
    <div className="rounded-xl bg-neutral-surface1 px-2.5 py-2">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center gap-1.5 text-left text-[11px] font-medium text-neutral-mediumOnSurface"
      >
        {isDone ? (
          <KsIconChevronRight size={11} className={clsx('transition-transform', isOpen && 'rotate-90')} />
        ) : (
          <span className="size-1.5 animate-pulse rounded-full bg-primary-fill" />
        )}
        {isDone ? `Thought for ${steps.length} step${steps.length > 1 ? 's' : ''}` : 'Thinking…'}
      </button>
      {isOpen ? (
        <ul className="mt-1.5 flex flex-col gap-1">
          {steps.slice(0, revealed).map((step, index) => (
            <li key={step} className="flex gap-1.5 text-[11px] leading-[16px] text-neutral-lowOnSurface">
              <span className="tabular-nums text-neutral-fill">{index + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * 右侧栏的 AI editor：一个会话式剪辑 agent。
 * 用户提出诉求 → agent 展示思考过程 → 可能反问澄清 → 给出可逐条勾选的计划 →
 * 应用前先在时间线上做 diff 预览，应用后保留旧版本可随时回滚。
 */
function AiEditorPanel({
  isBusy,
  messages,
  pendingPlanId,
  skippedOpIds,
  diff,
  onSubmit,
  onAnswer,
  onToggleOp,
  onApply,
  onDiscard,
  onRestore
}: AiEditorPanelProps) {
  const [draft, setDraft] = useState('');
  const threadRef = useRef<HTMLDivElement>(null);

  /* 新消息进来时滚到底部 */
  useEffect(() => {
    const thread = threadRef.current;
    if (thread) {
      thread.scrollTop = thread.scrollHeight;
    }
  }, [messages]);

  const submit = (text?: string) => {
    const content = (text ?? draft).trim();
    if (!content || isBusy) {
      return;
    }
    onSubmit(content);
    setDraft('');
  };

  const pending = messages.find(
    (message): message is Extract<AiEditorMessage, { role: 'plan' }> =>
      message.role === 'plan' && message.id === pendingPlanId
  );
  const acceptedCount = pending
    ? pending.plan.operations.filter((op) => !skippedOpIds.has(op.id)).length
    : 0;

  return (
    <div data-ai-editor className="flex min-h-0 flex-1 flex-col">
      <div ref={threadRef} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-3 text-center">
            <span className="flex size-9 items-center justify-center rounded-full bg-primary-surface2 text-primary-onSurface">
              <KsIconAiAssistant size={18} />
            </span>
            <p className="text-[12px] leading-[17px] text-neutral-mediumOnSurface">
              Ask for an edit and I’ll think it through, check with you if anything’s unclear, then show a plan you can
              review before it touches the timeline.
            </p>
          </div>
        ) : null}

        {messages.map((message) => {
          if (message.role === 'user') {
            return (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary-surface2 px-3 py-2 text-[12px] leading-[17px] text-neutral-highOnSurface">
                  {message.text}
                </div>
              </div>
            );
          }

          if (message.role === 'thinking') {
            return <ThinkingBlock key={message.id} steps={message.steps} revealed={message.revealed} />;
          }

          if (message.role === 'answer') {
            return (
              <div key={message.id} className="flex items-start gap-2">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-surface2 text-primary-onSurface">
                  <KsIconAiAssistant size={13} />
                </span>
                <p className="min-w-0 flex-1 text-[12px] leading-[17px] text-neutral-highOnSurface">{message.text}</p>
              </div>
            );
          }

          if (message.role === 'note') {
            return (
              <p key={message.id} className="text-center text-[11px] italic text-neutral-lowOnSurface">
                {message.text}
              </p>
            );
          }

          if (message.role === 'question') {
            return (
              <div key={message.id} className="flex items-start gap-2">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-surface2 text-primary-onSurface">
                  <KsIconAiAssistant size={13} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] leading-[17px] text-neutral-highOnSurface">{message.text}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {message.options.map((option) => (
                      <button
                        key={option}
                        type="button"
                        disabled={Boolean(message.answer) || isBusy}
                        onClick={() => onAnswer(message.id, option)}
                        className={clsx(
                          'rounded-full border border-solid px-2.5 py-1 text-[11px] transition-colors',
                          message.answer === option
                            ? 'border-primary-fill bg-primary-surface2 text-primary-onSurface'
                            : message.answer
                              ? 'border-neutral-fillLow text-neutral-lowOnSurface'
                              : 'border-neutral-fillLow bg-neutral-surface1 text-neutral-mediumOnSurface hover:bg-neutral-surface2'
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  {!message.answer ? (
                    <p className="mt-1.5 text-[11px] text-neutral-lowOnSurface">Or just type your own answer below.</p>
                  ) : null}
                </div>
              </div>
            );
          }

          // plan
          const isPending = message.id === pendingPlanId;
          return (
            <div key={message.id} className="flex items-start gap-2">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-surface2 text-primary-onSurface">
                <KsIconAiAssistant size={13} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] leading-[17px] text-neutral-highOnSurface">{message.plan.summary}</p>

                {message.plan.operations.length > 0 ? (
                  <ul
                    className={clsx(
                      'mt-1.5 rounded-xl border border-solid border-neutral-fillLow p-1',
                      !isPending && 'opacity-70'
                    )}
                  >
                    {message.plan.operations.map((operation) => {
                      const skipped = isPending && skippedOpIds.has(operation.id);
                      return (
                        <li key={operation.id}>
                          <label
                            className={clsx(
                              'flex items-start gap-2 rounded-lg px-1.5 py-1',
                              isPending && 'cursor-pointer hover:bg-neutral-surface1',
                              skipped && 'opacity-45'
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={!skipped}
                              disabled={!isPending}
                              onChange={() => onToggleOp(operation.id)}
                              className="mt-0.5 size-3.5 shrink-0 accent-primary-fill"
                            />
                            <span
                              className={clsx(
                                'text-[11px] leading-[16px] text-neutral-highOnSurface',
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
                ) : null}

                {message.status === 'applied' ? (
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="rounded bg-success-fill/15 px-1.5 py-0.5 text-[10px] font-semibold text-success-onSurface">
                      Applied · v{message.version}
                    </span>
                    <button
                      type="button"
                      title="Restore the timeline as it was before this edit"
                      onClick={() => onRestore(message.id)}
                      className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-medium text-neutral-mediumOnSurface transition-colors hover:bg-neutral-surface2"
                    >
                      <KsIconUndo size={11} />
                      Revert to before
                    </button>
                  </div>
                ) : null}

                {message.status === 'discarded' ? (
                  <span className="mt-1.5 inline-block text-[11px] text-neutral-lowOnSurface">Discarded</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* 待确认计划的操作条 */}
      {pending && pending.plan.operations.length > 0 ? (
        <div className="shrink-0 border-t border-solid border-neutral-fillLow px-3 py-2.5">
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
        {messages.length === 0 && !isBusy ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => submit(suggestion)}
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
            placeholder={isBusy ? 'Working…' : 'Ask for an edit — “trim to 15s”, “add captions”…'}
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
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              title="Send"
              disabled={!draft.trim() || isBusy}
              onClick={() => submit()}
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

export default AiEditorPanel;
