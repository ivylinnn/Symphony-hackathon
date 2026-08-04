import { KsIconAiAssistant, KsIconAiGeneration, KsIconChevronDown, KsIconSend } from '@fe-infra/keystone-icons-react';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';

import { EDIT_DOCK_RIGHT_W, END_CARD_VIDEO_URL } from './NodeEditDock';

export interface AgentMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  /** 气泡下方的后续动作按钮，第一个按主按钮渲染。 */
  actions?: string[];
  /** product brief 这类长内容，面板要撑高才读得下。 */
  variant?: 'brief';
}

/** 编辑上下文：进入剪辑步骤时由画布传入，同一个面板切换成剪辑对话。 */
export interface AgentEditingContext {
  /** 正在剪辑的节点标题。 */
  nodeTitle: string;
  /** 画布快捷入口带进来的第一条指令，进入即发送。 */
  initialPrompt?: string;
  /** 卖点动效确认后回调：由画布落时间线贴片并换成渲染版视频。 */
  onApplySellingPoints: (points: string[]) => void;
  /** 片尾卡：用户附上的视频整段替换 CTA 段（传素材地址）。 */
  onApplyEndCard: (url: string) => void;
  /** 促销贴片：把优惠文案落到时间线上。 */
  onApplyPromotion: (text: string) => void;
}

interface AgentPanelProps {
  isOpen: boolean;
  /** Agent 正在生成，禁用发送避免重复触发。 */
  isBusy: boolean;
  messages: AgentMessage[];
  /** 有值时面板处于剪辑步骤：显示该节点的剪辑对话与快捷动作。 */
  editing?: AgentEditingContext | null;
  /** 退出编辑模式的过场：面板向右滑出，动画结束由画布收起。 */
  isClosing?: boolean;
  onToggle: () => void;
  onSend: (content: string) => void;
  /** 点击气泡下方的后续动作。 */
  onAction: (label: string) => void;
}

/* ------------------------------------------------------------------ */
/* 剪辑对话的本地剧本（原 Editing agent，并入 Creative agent）             */
/* ------------------------------------------------------------------ */

/** 剪辑步骤的快捷诉求。 */
const EDIT_QUICK_ACTIONS = [
  'Trim silences',
  'Add captions',
  'Add selling points',
  'Add promotion',
  'Add end card',
  'Swap product'
];
/** 促销入口：先问打什么优惠，再落 promo 贴片。 */
const PROMOTION_ACTION = 'Add promotion';
/** 促销文案建议，第一条来自 brief 的默认 offer。 */
const PROMO_SUGGESTIONS = ['20% off summer sale', 'Free shipping this week', 'Buy 2, get 1 free'];
/** 片尾卡入口：把品牌 end card 贴到时间线结尾。 */
const END_CARD_ACTION = 'Add end card';
/** 卖点动效的追问入口：先问卖点，再按卖点落图形。 */
const MOTION_GRAPHICS_ACTION = 'Add selling points';
/** 卖点建议，来自 hoodie 产品 brief 的核心卖点。 */
const SELLING_POINT_SUGGESTIONS = ['Breathable fabric', 'Kangaroo pocket', '20% off summer sale'];
/** agent 假装思考的时长（毫秒），演示用。 */
const AGENT_REPLY_MS = 900;

interface EditMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  /** 气泡下方的多选选项（卖点建议）。 */
  options?: string[];
  /** 片尾卡附件入口：渲染「上传视频 / 用品牌默认」按钮。 */
  upload?: boolean;
}

let editMessageSeq = 0;
const nextEditMessageId = () => {
  editMessageSeq += 1;
  return `edit-msg-${editMessageSeq}`;
};

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
 * Creative agent：画布唯一的 agent 面板。
 * 展开时是右侧全高面板；收起时坍缩成右下角的悬浮球。
 * 平时承接画布搭建对话；进入剪辑步骤后切换成该节点的剪辑对话（含 motion graphics 问答）。
 */
function AgentPanel({ isOpen, isBusy, messages, editing, isClosing, onToggle, onSend, onAction }: AgentPanelProps) {
  const [draft, setDraft] = useState('');
  const historyRef = useRef<HTMLDivElement>(null);

  /* —— 剪辑对话的本地状态 —— */
  const [editMessages, setEditMessages] = useState<EditMessage[]>([]);
  const [isEditBusy, setIsEditBusy] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<'motion-graphics' | 'promotion' | 'end-card' | null>(null);
  const [selectedPoints, setSelectedPoints] = useState<string[]>([]);
  const replyTimerRef = useRef<number | null>(null);
  /** 片尾卡附件的本地文件选择框。 */
  const endCardFileRef = useRef<HTMLInputElement>(null);

  const isEditing = Boolean(editing);
  const busy = isEditing ? isEditBusy : isBusy;

  useEffect(
    () => () => {
      if (replyTimerRef.current !== null) {
        window.clearTimeout(replyTimerRef.current);
      }
    },
    []
  );

  /* 新消息进来时滚到底部。 */
  useEffect(() => {
    const history = historyRef.current;
    if (history) {
      history.scrollTop = history.scrollHeight;
    }
  }, [messages, editMessages, isEditBusy, isOpen]);

  const editReply = (build: () => EditMessage) => {
    setIsEditBusy(true);
    replyTimerRef.current = window.setTimeout(() => {
      replyTimerRef.current = null;
      setIsEditBusy(false);
      setEditMessages((current) => [...current, build()]);
    }, AGENT_REPLY_MS);
  };

  const sendEdit = (content: string) => {
    const prompt = content.trim();
    if (!prompt || isEditBusy || !editing) {
      return;
    }
    setEditMessages((current) => [...current, { id: nextEditMessageId(), role: 'user', content: prompt }]);

    // Motion graphics：先追问卖点，确认后交给画布落贴片、换渲染版视频
    if (pendingIntent === 'motion-graphics') {
      setPendingIntent(null);
      setSelectedPoints([]);
      const points = prompt
        .split(/[,，;；\n]/)
        .map((point) => point.trim())
        .filter(Boolean)
        .slice(0, 3);
      setIsEditBusy(true);
      replyTimerRef.current = window.setTimeout(() => {
        replyTimerRef.current = null;
        setIsEditBusy(false);
        editing.onApplySellingPoints(points);
        setEditMessages((current) => [
          ...current,
          {
            id: nextEditMessageId(),
            role: 'agent',
            content: `Added ${points.length} motion graphic${points.length > 1 ? 's' : ''} — one callout per selling point (${points.join(', ')}) on track 1 — and updated the preview with the selling-point render.`
          }
        ]);
      }, AGENT_REPLY_MS);
      return;
    }

    // 促销：拿到优惠文案就落贴片
    if (pendingIntent === 'promotion') {
      setPendingIntent(null);
      editReply(() => {
        editing.onApplyPromotion(prompt);
        return {
          id: nextEditMessageId(),
          role: 'agent',
          content: `Added the promotion — “${prompt}” runs as a banner over the back half of the cut, clear of the hook.`
        };
      });
      return;
    }

    if (prompt === PROMOTION_ACTION) {
      setPendingIntent('promotion');
      editReply(() => ({
        id: nextEditMessageId(),
        role: 'agent',
        content: 'What offer should the promotion show? Pick one below or type your own.',
        options: PROMO_SUGGESTIONS
      }));
      return;
    }

    if (prompt === END_CARD_ACTION) {
      setPendingIntent('end-card');
      editReply(() => ({
        id: nextEditMessageId(),
        role: 'agent',
        content: 'Attach the end card video — it will replace the CTA section at the end of the cut. Upload your own, or use the brand default.',
        upload: true
      }));
      return;
    }

    if (prompt === MOTION_GRAPHICS_ACTION) {
      setPendingIntent('motion-graphics');
      setSelectedPoints([]);
      editReply(() => ({
        id: nextEditMessageId(),
        role: 'agent',
        content: 'Which selling points should the graphics call out? Pick any below, or type up to three, comma-separated.',
        options: SELLING_POINT_SUGGESTIONS
      }));
      return;
    }

    editReply(() => ({
      id: nextEditMessageId(),
      role: 'agent',
      content: 'Done — applied to the timeline below. Scrub through the cut and tell me what to adjust: pacing, captions, or assets.'
    }));
  };

  /**
   * 片尾卡落地：视频整段替换 CTA 段并可在预览里直接播放，
   * 然后顺势接上 Add promotion 的问答（选优惠 → 落贴片）。
   */
  const applyEndCard = (url: string, label: string) => {
    if (!editing || isEditBusy) {
      return;
    }
    setPendingIntent(null);
    setEditMessages((current) => [...current, { id: nextEditMessageId(), role: 'user', content: `Attached ${label}` }]);
    setIsEditBusy(true);
    replyTimerRef.current = window.setTimeout(() => {
      replyTimerRef.current = null;
      setIsEditBusy(false);
      editing.onApplyEndCard(url);
      setPendingIntent('promotion');
      setEditMessages((current) => [
        ...current,
        {
          id: nextEditMessageId(),
          role: 'agent',
          content:
            'End card is in — it replaces the CTA section, so pressing play runs straight into it in the preview. Want a promotion over the cut too? Pick an offer below or type your own.',
          options: PROMO_SUGGESTIONS
        }
      ]);
    }, AGENT_REPLY_MS);
  };

  /* 进入剪辑步骤：重开一段该节点的对话，并把入口带来的指令替用户发出去。 */
  const editingKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editing) {
      editingKeyRef.current = null;
      setPendingIntent(null);
      setSelectedPoints([]);
      return;
    }
    if (editingKeyRef.current === editing.nodeTitle) {
      return;
    }
    editingKeyRef.current = editing.nodeTitle;
    setPendingIntent(null);
    setSelectedPoints([]);
    setEditMessages([
      {
        id: nextEditMessageId(),
        role: 'agent',
        content: `“${editing.nodeTitle}” is on the timeline. Tell me the cut you want — trim, captions, motion graphics, or swap assets — and I'll apply it here.`
      }
    ]);
    if (editing.initialPrompt) {
      // 让欢迎语先渲染，再补上入口指令
      window.setTimeout(() => sendEdit(editing.initialPrompt ?? ''), 0);
    }
    // sendEdit 依赖易变状态；这段只在换编辑对象时跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  /** 只有最新的带选项消息才渲染可点选项，旧问题不再响应。 */
  const lastOptionsMessageId = [...editMessages].reverse().find((message) => message.options)?.id ?? null;
  /** 同理：只有最新的附件请求消息渲染上传按钮。 */
  const lastUploadMessageId = [...editMessages].reverse().find((message) => message.upload)?.id ?? null;

  const togglePoint = (point: string) =>
    setSelectedPoints((current) =>
      current.includes(point) ? current.filter((item) => item !== point) : [...current, point]
    );

  const submit = () => {
    const content = draft.trim();
    if (!content || busy) {
      return;
    }
    if (isEditing) {
      sendEdit(content);
    } else {
      onSend(content);
    }
    setDraft('');
  };

  if (!isOpen) {
    // 收起态：右下角悬浮球（参考稿的深色圆钮）
    return (
      <button
        type="button"
        title="Open Creative agent"
        onClick={onToggle}
        className="absolute bottom-6 right-6 z-30 flex size-14 items-center justify-center rounded-full bg-neutral-fillHigh text-neutral-onFill shadow-[0_10px_30px_rgba(16,24,40,0.24)] transition-transform hover:scale-105"
      >
        <KsIconAiGeneration size={24} />
      </button>
    );
  }

  return (
    <aside
      data-creative-agent
      className={clsx(
        'absolute inset-y-0 right-0 z-30 flex flex-col border-l border-solid border-neutral-fillLow bg-neutral-surface shadow-[-12px_0_32px_rgba(16,24,40,0.10)]',
        isClosing ? 'animate-dock-out-right' : 'animate-dock-in-right'
      )}
      style={{ width: EDIT_DOCK_RIGHT_W }}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-solid border-neutral-fillLow px-3">
        <span className="flex size-7 items-center justify-center rounded-full bg-primary-surface2 text-primary-onSurface">
          <KsIconAiAssistant size={16} />
        </span>
        <span className="flex-1 truncate text-[13px] font-semibold text-neutral-highOnSurface">Creative agent</span>
        <button
          type="button"
          title="Collapse Creative agent"
          onClick={onToggle}
          className="flex size-7 items-center justify-center rounded-lg text-neutral-mediumOnSurface transition-colors hover:bg-neutral-surface2"
        >
          <KsIconChevronDown size={16} />
        </button>
      </header>

      <div ref={historyRef} className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-3">
        {isEditing ? (
          <>
            {editMessages.map((message) => (
              <div key={message.id} className={clsx('flex flex-col', message.role === 'user' ? 'items-end' : 'items-start')}>
                <div
                  className={clsx(
                    'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-[19px] text-neutral-highOnSurface',
                    message.role === 'user' ? 'rounded-br-md bg-primary-surface2' : 'rounded-bl-md bg-neutral-surface2'
                  )}
                >
                  {message.content}
                </div>
                {/* 追问的多选选项：勾选后由确认按钮统一发送 */}
                {message.options && message.id === lastOptionsMessageId && pendingIntent === 'promotion' ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {message.options.map((option) => (
                      <button
                        key={option}
                        type="button"
                        data-promo-option
                        onClick={() => sendEdit(option)}
                        className="rounded-full border border-solid border-primary-fill bg-neutral-surface px-2.5 py-1 text-[11px] font-medium text-primary-onSurface transition-colors hover:bg-primary-surface2"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                ) : message.options && message.id === lastOptionsMessageId && pendingIntent ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {message.options.map((option) => {
                      const isPicked = selectedPoints.includes(option);
                      return (
                        <button
                          key={option}
                          type="button"
                          data-selling-point-option
                          aria-pressed={isPicked}
                          onClick={() => togglePoint(option)}
                          className={clsx(
                            'rounded-full border border-solid px-2.5 py-1 text-[11px] font-medium transition-colors',
                            isPicked
                              ? 'border-primary-fill bg-primary-fill text-neutral-onFill'
                              : 'border-primary-fill bg-neutral-surface text-primary-onSurface hover:bg-primary-surface2'
                          )}
                        >
                          {isPicked ? '✓ ' : ''}
                          {option}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      data-selling-points-confirm
                      disabled={selectedPoints.length === 0}
                      onClick={() => sendEdit(selectedPoints.join(', '))}
                      className={clsx(
                        'rounded-full px-3 py-1 text-[11px] font-semibold transition-opacity',
                        selectedPoints.length > 0
                          ? 'bg-neutral-fillHigh text-neutral-onFill hover:opacity-90'
                          : 'cursor-not-allowed bg-neutral-surface2 text-neutral-lowOnSurface'
                      )}
                    >
                      Add {selectedPoints.length || ''} selling point{selectedPoints.length === 1 ? '' : 's'}
                    </button>
                  </div>
                ) : null}
                {/* 片尾卡附件入口：本地上传或用品牌默认素材 */}
                {message.upload && message.id === lastUploadMessageId && pendingIntent === 'end-card' ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      data-end-card-upload
                      onClick={() => endCardFileRef.current?.click()}
                      className="rounded-full bg-neutral-fillHigh px-3 py-1 text-[11px] font-semibold text-neutral-onFill transition-opacity hover:opacity-90"
                    >
                      ⇪ Upload end card video
                    </button>
                    <button
                      type="button"
                      data-end-card-default
                      onClick={() => applyEndCard(END_CARD_VIDEO_URL, 'the brand end card')}
                      className="rounded-full border border-solid border-primary-fill bg-neutral-surface px-2.5 py-1 text-[11px] font-medium text-primary-onSurface transition-colors hover:bg-primary-surface2"
                    >
                      Use brand end card (5s)
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
            {isEditBusy ? (
              <div className="flex items-center gap-1.5 text-[12px] text-neutral-lowOnSurface">
                <span className="size-1.5 animate-pulse rounded-full bg-primary-fill" />
                Editing…
              </div>
            ) : null}
          </>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} onAction={onAction} />)
        )}
      </div>

      {/* 片尾卡的本地视频选择框：选中即以 object URL 附给时间线 */}
      <input
        ref={endCardFileRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/*"
        data-end-card-file
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            applyEndCard(URL.createObjectURL(file), `“${file.name}”`);
          }
          event.target.value = '';
        }}
      />

      <div className="shrink-0 border-t border-solid border-neutral-fillLow p-2.5">
        {isEditing ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {EDIT_QUICK_ACTIONS.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => sendEdit(label)}
                className="rounded-full border border-solid border-neutral-fillLow bg-neutral-surface px-2.5 py-1 text-[11px] font-medium text-neutral-highOnSurface transition-colors hover:bg-neutral-surface2"
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="rounded-xl border border-solid border-neutral-fillLow bg-neutral-surface1 p-2 focus-within:border-primary-fill">
          <textarea
            value={draft}
            rows={2}
            placeholder={
              busy ? 'Working…' : isEditing ? 'Describe the edit…' : 'Ask the agent to build or edit nodes…'
            }
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
              disabled={!draft.trim() || busy}
              onClick={submit}
              className={clsx(
                'flex size-7 items-center justify-center rounded-lg transition-colors',
                draft.trim() && !busy
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
