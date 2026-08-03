import { KsIconAiAssistant, KsIconChevronRight, KsIconSend, KsIconUpload } from '@fe-infra/keystone-icons-react';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';

import { addImageToMyAssets } from '../services/my-assets';
import type { LibraryAsset } from '../types';

export interface AgentMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
}

interface AgentPanelProps {
  isOpen: boolean;
  /** Agent 正在生成，禁用发送避免重复触发。 */
  isBusy: boolean;
  messages: AgentMessage[];
  onToggle: () => void;
  onSend: (content: string) => void;
}

function MessageBubble({ message }: { message: AgentMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={clsx('flex', isUser ? 'justify-end' : 'justify-start')}>
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
    </div>
  );
}

/**
 * 画布右侧的 Agent 会话面板。
 * 收起时坍缩成右下角的 FAB，展开时是历史消息 + 底部输入框。
 */
function AgentPanel({ isOpen, isBusy, messages, onToggle, onSend }: AgentPanelProps) {
  const [draft, setDraft] = useState('');
  /* 从输入框上传的图片，落进 My assets 后在这里给个回执。 */
  const [attachments, setAttachments] = useState<LibraryAsset[]>([]);
  const historyRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files) {
      return;
    }
    setAttachments((current) => [...current, ...[...files].map((file) => addImageToMyAssets(file))]);
  };

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
    <aside className="absolute bottom-4 right-4 z-20 flex h-[50vh] w-[320px] flex-col overflow-hidden rounded-2xl border border-solid border-neutral-fillLow bg-neutral-surface shadow-[0_10px_30px_rgba(16,24,40,0.16)]">
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
          <MessageBubble key={message.id} message={message} />
        ))}
      </div>

      <div className="shrink-0 border-t border-solid border-neutral-fillLow p-2.5">
        {attachments.length > 0 ? (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {attachments.map((asset) => (
              <span
                key={asset.id}
                title={`"${asset.name}" was added to My assets`}
                className="flex max-w-full items-center gap-1.5 rounded-lg bg-neutral-surface2 py-1 pl-1 pr-2"
              >
                <span className="size-6 shrink-0 overflow-hidden rounded-md bg-neutral-surface3">
                  {asset.url ? <img src={asset.url} alt={asset.name} className="size-full object-cover" draggable={false} /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-medium leading-[13px] text-neutral-highOnSurface">
                    {asset.name}
                  </span>
                  <span className="block text-[9px] leading-[11px] text-neutral-lowOnSurface">Added to My assets</span>
                </span>
              </span>
            ))}
          </div>
        ) : null}
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
          <div className="flex items-center justify-between">
            <button
              type="button"
              title="Upload an image to My assets"
              onClick={() => fileInputRef.current?.click()}
              className="flex size-7 items-center justify-center rounded-lg text-neutral-mediumOnSurface transition-colors hover:bg-neutral-surface2"
            >
              <KsIconUpload size={14} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                handleFiles(event.target.files);
                event.target.value = '';
              }}
            />
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
