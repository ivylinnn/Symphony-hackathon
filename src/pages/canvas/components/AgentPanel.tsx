import { KsIconAiAssistant, KsIconChevronRight, KsIconSend } from '@fe-infra/keystone-icons-react';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';

export interface AgentMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  /** 气泡下方的后续动作按钮，第一个按主按钮渲染。 */
  actions?: string[];
  /** product brief 这类长内容，面板要撑高才读得下。 */
  variant?: 'brief';
}

interface AgentPanelProps {
  isOpen: boolean;
  /** Agent 正在生成，禁用发送避免重复触发。 */
  isBusy: boolean;
  messages: AgentMessage[];
  onToggle: () => void;
  onSend: (content: string) => void;
  /** 点击气泡下方的后续动作。 */
  onAction: (label: string) => void;
}

function MessageBubble({ message, onAction }: { message: AgentMessage; onAction: (label: string) => void }) {
  const isUser = message.role === 'user';
  return (
    <div className={clsx('flex flex-col', isUser ? 'items-end' : 'items-start')}>
      <div
        className={clsx(
          'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-[19px]',
          isUser
            ? 'rounded-br-md bg-primary-surface2 text-neutral-highOnSurface'
            : 'rounded-bl-md bg-neutral-surface2 text-neutral-highOnSurface'
        )}
      >
        {message.content}
      </div>
      {message.actions?.length ? (
        <div className="mt-2 flex w-full flex-col gap-1.5">
          {message.actions.map((label, index) => (
            <button
              key={label}
              type="button"
              onClick={() => onAction(label)}
              className={clsx(
                'rounded-xl px-3 py-2 text-left text-[12px] font-medium transition-colors',
                index === 0
                  ? 'bg-neutral-fillHigh text-neutral-onFill hover:opacity-90'
                  : 'border border-solid border-neutral-fillLow bg-neutral-surface text-neutral-highOnSurface hover:bg-neutral-surface2'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * 画布右侧的 Agent 会话面板。
 * 收起时坍缩成右下角的 FAB，展开时是历史消息 + 底部输入框。
 */
function AgentPanel({ isOpen, isBusy, messages, onToggle, onSend, onAction }: AgentPanelProps) {
  const [draft, setDraft] = useState('');
  const historyRef = useRef<HTMLDivElement>(null);
  /** 出现 product brief 后把面板撑到 70vh，长文才不用一直滚。 */
  const hasBrief = messages.some((message) => message.variant === 'brief');

  /* 新消息进来时滚到底部。 */
  useEffect(() => {
    const history = historyRef.current;
    if (history) {
      history.scrollTop = history.scrollHeight;
    }
  }, [messages, isOpen]);

  const submit = () => {
    const content = draft.trim();
    if (!content || isBusy) {
      return;
    }
    onSend(content);
    setDraft('');
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        title="Open agent"
        onClick={onToggle}
        className="absolute bottom-6 right-6 z-20 flex size-14 items-center justify-center rounded-full bg-neutral-fillHigh text-neutral-onFill shadow-[0_10px_30px_rgba(16,24,40,0.16)] transition-transform hover:scale-105"
      >
        <KsIconAiAssistant size={24} />
      </button>
    );
  }

  return (
    <aside
      className={clsx(
        'absolute bottom-4 right-4 z-20 flex w-[320px] flex-col overflow-hidden rounded-2xl border border-solid border-neutral-fillLow bg-neutral-surface shadow-[0_10px_30px_rgba(16,24,40,0.16)] transition-[height]',
        hasBrief ? 'h-[70vh]' : 'h-[50vh]'
      )}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-solid border-neutral-fillLow px-3">
        <span className="flex size-7 items-center justify-center rounded-full bg-primary-surface2 text-primary-onSurface">
          <KsIconAiAssistant size={16} />
        </span>
        <span className="flex-1 truncate text-[13px] font-semibold text-neutral-highOnSurface">Agent</span>
        <button
          type="button"
          title="Collapse agent panel"
          onClick={onToggle}
          className="flex size-7 items-center justify-center rounded-lg text-neutral-mediumOnSurface transition-colors hover:bg-neutral-surface2"
        >
          <KsIconChevronRight size={16} />
        </button>
      </header>

      <div ref={historyRef} className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-3">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} onAction={onAction} />
        ))}
      </div>

      <div className="shrink-0 border-t border-solid border-neutral-fillLow p-2.5">
        <div className="rounded-xl border border-solid border-neutral-fillLow bg-neutral-surface1 p-2 focus-within:border-primary-fill">
          <textarea
            value={draft}
            rows={2}
            placeholder={isBusy ? 'Working…' : 'Ask the agent to build or edit nodes…'}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter 发送，Shift+Enter 换行
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            className="w-full resize-none bg-transparent text-[13px] leading-[18px] text-neutral-highOnSurface outline-none placeholder:text-neutral-lowOnSurface"
          />
          <div className="flex justify-end">
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
    </aside>
  );
}

export default AgentPanel;
