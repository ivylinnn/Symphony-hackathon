import {
  KsIconAiAssistant,
  KsIconChevronRight,
  KsIconPlus,
  KsIconSend,
  KsIconUndo
} from '@fe-infra/keystone-icons-react';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';

import type { AiEditorMessage, IntakeAnswers, IntakeField } from '../types';

export interface DiffCounts {
  added: number;
  removed: number;
  changed: number;
  newTracks: number;
  /** 画幅变更（Uncrop），有值时展示成 format → 1:1。 */
  format?: string;
}

interface AiEditorPanelProps {
  isBusy: boolean;
  messages: AiEditorMessage[];
  /** 当前正在预览的计划消息 id，只有它显示应用/放弃按钮。 */
  pendingPlanId: string | null;
  skippedOpIds: Set<string>;
  onSubmit: (prompt: string) => void;
  /** 时间线上选中的元素；有值时 composer 显示 @pill，指令定向到它。 */
  selectedClip: { id: string; label: string } | null;
  onClearSelection: () => void;
  /** 从输入区上传素材，落进 My assets。 */
  onUpload: (files: FileList) => void;
  onSubmitIntake: (messageId: string, answers: IntakeAnswers) => void;
  onAnswer: (messageId: string, option: string) => void;
  onToggleOp: (operationId: string) => void;
  onApply: () => void;
  onDiscard: () => void;
  onRestore: (messageId: string) => void;
}

/** 思考过程：进行中逐条揭示，结束后折叠成一行摘要，可再展开。 */
/**
 * 开场问卷：一次问清平台、条数、时长和包装，答案会被组合成一份复合计划。
 * 提交前答案只留在这条消息里，不影响时间线。
 */
function IntakeForm({
  fields,
  answers,
  submitted,
  isBusy,
  onSubmit
}: {
  fields: IntakeField[];
  answers: IntakeAnswers;
  submitted: boolean;
  isBusy: boolean;
  onSubmit: (answers: IntakeAnswers) => void;
}) {
  const [draft, setDraft] = useState<IntakeAnswers>(answers);
  const locked = submitted || isBusy;

  const toggle = (field: IntakeField, option: string) =>
    setDraft((current) => {
      if (field.kind === 'multi') {
        const selected = Array.isArray(current[field.id]) ? (current[field.id] as string[]) : [];
        return {
          ...current,
          [field.id]: selected.includes(option)
            ? selected.filter((item) => item !== option)
            : [...selected, option]
        };
      }
      // 单选再点一次取消，避免选错了没法改
      return { ...current, [field.id]: current[field.id] === option ? '' : option };
    });

  const isSelected = (field: IntakeField, option: string) =>
    field.kind === 'multi'
      ? Array.isArray(draft[field.id]) && (draft[field.id] as string[]).includes(option)
      : draft[field.id] === option;

  const isComplete = fields.every((field) => !field.required || draft[field.id]);

  return (
    <div data-intake-form className="rounded-xl border border-solid border-neutral-fillLow bg-neutral-surface1 p-3">
      {fields.map((field) => (
        <div key={field.id} className="mb-3 last:mb-0">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-mediumOnSurface">
            {field.label}
          </p>
          {field.kind === 'text' ? (
            <input
              value={typeof draft[field.id] === 'string' ? (draft[field.id] as string) : ''}
              placeholder={field.placeholder}
              disabled={locked}
              onChange={(event) => setDraft((current) => ({ ...current, [field.id]: event.target.value }))}
              className="w-full rounded-lg border border-solid border-neutral-fillLow bg-neutral-surface px-2 py-1.5 text-[12px] text-neutral-highOnSurface outline-none focus:border-primary-fill disabled:opacity-60"
            />
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(field.options ?? []).map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={locked}
                  onClick={() => toggle(field, option)}
                  className={clsx(
                    'rounded-lg border border-solid px-2 py-1 text-[11px] transition-colors',
                    isSelected(field, option)
                      ? 'border-primary-fill bg-primary-surface2 font-medium text-primary-onSurface'
                      : 'border-neutral-fillLow bg-neutral-surface text-neutral-mediumOnSurface hover:bg-neutral-surface2',
                    locked && 'cursor-default'
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          )}

          {/* 勾中触发选项后就地追问，答案单独存一格 */}
          {field.followUp && isSelected(field, field.followUp.whenOption) ? (
            <div className="mt-2 border-l-2 border-solid border-primary-fill/40 pl-2.5">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-mediumOnSurface">
                {field.followUp.label}
              </p>
              <input
                autoFocus
                value={typeof draft[field.followUp.id] === 'string' ? (draft[field.followUp.id] as string) : ''}
                placeholder={field.followUp.placeholder}
                disabled={locked}
                onChange={(event) => {
                  const key = field.followUp!.id;
                  setDraft((current) => ({ ...current, [key]: event.target.value }));
                }}
                className="w-full rounded-lg border border-solid border-neutral-fillLow bg-neutral-surface px-2 py-1.5 text-[12px] text-neutral-highOnSurface outline-none focus:border-primary-fill disabled:opacity-60"
              />
            </div>
          ) : null}
        </div>
      ))}

      {!submitted ? (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={!isComplete || isBusy}
            onClick={() => onSubmit(draft)}
            className={clsx(
              'rounded-lg px-3.5 py-1.5 text-[12px] font-semibold transition-colors',
              isComplete && !isBusy
                ? 'bg-primary-fill text-neutral-onFill hover:opacity-90'
                : 'cursor-not-allowed bg-neutral-surface3 text-neutral-lowOnSurface'
            )}
          >
            Submit
          </button>
        </div>
      ) : null}
    </div>
  );
}

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
  onSubmit,
  selectedClip,
  onClearSelection,
  onUpload,
  onSubmitIntake,
  onAnswer,
  onToggleOp,
  onApply,
  onDiscard,
  onRestore
}: AiEditorPanelProps) {
  const [draft, setDraft] = useState('');
  const threadRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

          if (message.role === 'form') {
            return (
              <IntakeForm
                key={message.id}
                fields={message.fields}
                answers={message.answers}
                submitted={message.submitted}
                isBusy={isBusy}
                onSubmit={(answers) => onSubmitIntake(message.id, answers)}
              />
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

                {/* 待确认时，应用/放弃就跟在这份计划下面，不再单独占一条固定操作条 */}
                {isPending && message.plan.operations.length > 0 ? (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onDiscard}
                      className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-neutral-mediumOnSurface transition-colors hover:bg-neutral-surface2"
                    >
                      Discard
                    </button>
                    <button
                      type="button"
                      disabled={acceptedCount === 0}
                      onClick={onApply}
                      className={clsx(
                        'whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors',
                        acceptedCount > 0
                          ? 'bg-primary-fill text-neutral-onFill hover:opacity-90'
                          : 'cursor-not-allowed bg-neutral-surface2 text-neutral-lowOnSurface'
                      )}
                    >
                      Apply {acceptedCount > 0 ? `${acceptedCount} edit${acceptedCount > 1 ? 's' : ''}` : ''}
                    </button>
                  </div>
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

      {/* 输入区常驻底部 */}
      <div className="shrink-0 border-t border-solid border-neutral-fillLow p-2.5">
        <div
          className={clsx(
            'rounded-xl border border-solid bg-neutral-surface1 p-2 transition-colors',
            isBusy ? 'border-primary-fill/40' : 'border-neutral-fillLow focus-within:border-primary-fill'
          )}
        >
          {selectedClip ? (
            <div className="mb-1.5 flex">
              <span
                data-target-pill
                className="flex items-center gap-1 rounded-full bg-primary-surface2 py-0.5 pl-2 pr-1 text-[11px] font-medium text-primary-onSurface"
              >
                @{selectedClip.label}
                <button
                  type="button"
                  title="Clear selection"
                  onClick={onClearSelection}
                  className="flex size-4 items-center justify-center rounded-full text-primary-onSurface/70 transition-colors hover:bg-primary-surface3"
                >
                  ×
                </button>
              </span>
            </div>
          ) : null}
          <textarea
            value={draft}
            rows={3}
            disabled={isBusy}
            placeholder={
              isBusy
                ? 'Working…'
                : selectedClip
                  ? `Edit @${selectedClip.label} — “remove it”, “update to …”, “2 seconds”…`
                  : 'Ask for an edit — “trim to 15s”, “add captions”…'
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
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              multiple
              hidden
              onChange={(event) => {
                if (event.target.files?.length) {
                  onUpload(event.target.files);
                }
                // 清空 value，选同一个文件两次也能触发 change
                event.target.value = '';
              }}
            />
            <button
              type="button"
              title="Upload an image or video into My assets"
              onClick={() => fileRef.current?.click()}
              className="flex size-7 items-center justify-center rounded-lg text-neutral-mediumOnSurface transition-colors hover:bg-neutral-surface2"
            >
              <KsIconPlus size={15} />
            </button>
            <span className="flex-1" />
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
