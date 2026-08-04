import {
  KsIconAiAssistant,
  KsIconClose,
  KsIconCopyContent,
  KsIconCut,
  KsIconDelete,
  KsIconSend,
  KsIconSound,
  KsIconZoomIn,
  KsIconZoomOut
} from '@fe-infra/keystone-icons-react';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';

/** 右侧 agent 坞的宽度；index 里算聚焦视口时要把它从可视区里扣掉。 */
export const EDIT_DOCK_RIGHT_W = 340;
/** 底部时间线坞的高度；同上参与聚焦视口计算。 */
export const EDIT_DOCK_BOTTOM_H = 252;

/** 演示时间线的总时长（秒），对齐参考稿的 00:19.15。 */
const DEMO_DURATION = 19.15;
/** 时间线基准密度，缩放滑杆在此基础上乘系数。 */
const BASE_PX_PER_SECOND = 56;
const PLAYBACK_TICK_MS = 100;
/** agent 假装思考的时长（毫秒），演示用。 */
const AGENT_REPLY_MS = 900;

/** 视频轨按广告结构切成三段，和画布上的 Hook / Body / CTA 节点对齐。 */
const VIDEO_CLIPS = [
  { id: 'clip-hook', label: 'Hook', start: 0, duration: 6.4 },
  { id: 'clip-body', label: 'Body', start: 6.4, duration: 6.6 },
  { id: 'clip-cta', label: 'Flower Exchange Joy', start: 13, duration: DEMO_DURATION - 13 }
];
/** 图形轨：品牌 logo 动画贴在开头，模拟参考稿的绿色条。 */
const GRAPHIC_CLIP = { id: 'clip-logo', label: 'Flora Logo Design', start: 0, duration: 5.2 };

/** 常驻在输入区上方的快捷诉求，点了就当一条用户消息发出去。 */
const QUICK_ACTIONS = ['Trim silences', 'Add captions', 'Motion graphics', 'Swap product'];

/** 波形条的高度序列（0-1），循环铺满音频/图形条。 */
const WAVE_PATTERN = [0.35, 0.7, 0.5, 0.9, 0.4, 0.65, 0.3, 0.8, 0.55, 0.45];

interface DockMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
}

let messageSeq = 0;
const nextMessageId = () => {
  messageSeq += 1;
  return `dock-msg-${messageSeq}`;
};

/** 00:07.30 这样的 mm:ss.cs 格式。 */
const formatTime = (seconds: number) => {
  const clamped = Math.max(0, seconds);
  const mins = Math.floor(clamped / 60);
  const secs = Math.floor(clamped % 60);
  const centis = Math.floor((clamped % 1) * 100);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(mins)}:${pad(secs)}.${pad(centis)}`;
};

interface NodeEditDockProps {
  /** 正在编辑的节点标题，出现在欢迎语与轨道占位上。 */
  nodeTitle: string;
  /** 视频封面，用来铺视频轨的缩略图。 */
  posterUrl?: string;
  /** 画布快捷入口带进来的第一条指令，打开即发送。 */
  initialPrompt?: string;
  onClose: () => void;
}

/**
 * 节点内联剪辑模式：不再整页接管画布。
 * 画布把镜头推近节点后，右侧滑入编辑 agent，底部滑入时间线轨道，
 * 参考 Flora 的 Timeline Editor 布局。
 */
function NodeEditDock({ nodeTitle, posterUrl, initialPrompt, onClose }: NodeEditDockProps) {
  const [messages, setMessages] = useState<DockMessage[]>(() => [
    {
      id: nextMessageId(),
      role: 'agent',
      content: `“${nodeTitle}” is on the timeline. Tell me the cut you want — trim, captions, motion graphics, or swap assets — and I'll apply it here.`
    }
  ]);
  const [isBusy, setIsBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const historyRef = useRef<HTMLDivElement>(null);
  const replyTimerRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [timelineZoom, setTimelineZoom] = useState(1);

  const pxPerSecond = BASE_PX_PER_SECOND * timelineZoom;
  const timelineWidth = DEMO_DURATION * pxPerSecond;

  /* Esc 直接退出编辑模式，回到画布。 */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  /* 新消息进来时滚到底部。 */
  useEffect(() => {
    const history = historyRef.current;
    if (history) {
      history.scrollTop = history.scrollHeight;
    }
  }, [messages, isBusy]);

  useEffect(
    () => () => {
      if (replyTimerRef.current !== null) {
        window.clearTimeout(replyTimerRef.current);
      }
    },
    []
  );

  /* 播放：按真实节奏推进播放头，到尾停住。 */
  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    const timer = window.setInterval(() => {
      setCurrentTime((time) => {
        const next = time + PLAYBACK_TICK_MS / 1000;
        if (next >= DEMO_DURATION) {
          setIsPlaying(false);
          return DEMO_DURATION;
        }
        return next;
      });
    }, PLAYBACK_TICK_MS);
    return () => window.clearInterval(timer);
  }, [isPlaying]);

  const send = (content: string) => {
    const prompt = content.trim();
    if (!prompt || isBusy) {
      return;
    }
    setMessages((current) => [...current, { id: nextMessageId(), role: 'user', content: prompt }]);
    setIsBusy(true);
    replyTimerRef.current = window.setTimeout(() => {
      replyTimerRef.current = null;
      setIsBusy(false);
      setMessages((current) => [
        ...current,
        {
          id: nextMessageId(),
          role: 'agent',
          content: `Done — applied to the timeline below. Scrub through the cut and tell me what to adjust: pacing, captions, or assets.`
        }
      ]);
    }, AGENT_REPLY_MS);
  };

  /* 画布工具条带进来的指令：坞一挂上就替用户发出去。 */
  const initialSentRef = useRef(false);
  useEffect(() => {
    if (initialPrompt && !initialSentRef.current) {
      initialSentRef.current = true;
      send(initialPrompt);
    }
    // send 依赖 isBusy，只在挂载时发一次即可
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  const seekFromRuler = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const time = (event.clientX - rect.left + event.currentTarget.scrollLeft) / pxPerSecond;
    setCurrentTime(Math.min(DEMO_DURATION, Math.max(0, time)));
  };

  const rulerMarks = [];
  for (let second = 0; second <= Math.ceil(DEMO_DURATION / 5) * 5; second += 5) {
    rulerMarks.push(second);
  }

  const waveBars = (width: number) => {
    const count = Math.max(8, Math.floor(width / 7));
    return Array.from({ length: count }, (_, index) => WAVE_PATTERN[index % WAVE_PATTERN.length]);
  };

  return (
    <>
      {/* 右侧：编辑 agent 会话 */}
      <aside
        data-edit-dock-agent
        className="absolute inset-y-0 right-0 z-30 flex animate-dock-in-right flex-col border-l border-solid border-neutral-fillLow bg-neutral-surface shadow-[-12px_0_32px_rgba(16,24,40,0.10)]"
        style={{ width: EDIT_DOCK_RIGHT_W }}
      >
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-solid border-neutral-fillLow px-3">
          <span className="flex size-7 items-center justify-center rounded-full bg-primary-surface2 text-primary-onSurface">
            <KsIconAiAssistant size={16} />
          </span>
          <span className="flex-1 truncate text-[13px] font-semibold text-neutral-highOnSurface">Editing agent</span>
          <button
            type="button"
            title="Close editor"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-lg text-neutral-mediumOnSurface transition-colors hover:bg-neutral-surface2"
          >
            <KsIconClose size={14} />
          </button>
        </header>

        <div ref={historyRef} className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-3">
          {messages.map((message) => (
            <div key={message.id} className={clsx('flex flex-col', message.role === 'user' ? 'items-end' : 'items-start')}>
              <div
                className={clsx(
                  'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-[19px] text-neutral-highOnSurface',
                  message.role === 'user' ? 'rounded-br-md bg-primary-surface2' : 'rounded-bl-md bg-neutral-surface2'
                )}
              >
                {message.content}
              </div>
            </div>
          ))}
          {isBusy ? (
            <div className="flex items-center gap-1.5 text-[12px] text-neutral-lowOnSurface">
              <span className="size-1.5 animate-pulse rounded-full bg-primary-fill" />
              Editing…
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-solid border-neutral-fillLow p-2.5">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {QUICK_ACTIONS.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => send(label)}
                className="rounded-full border border-solid border-neutral-fillLow bg-neutral-surface px-2.5 py-1 text-[11px] font-medium text-neutral-highOnSurface transition-colors hover:bg-neutral-surface2"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="rounded-xl border border-solid border-neutral-fillLow bg-neutral-surface1 p-2 focus-within:border-primary-fill">
            <textarea
              value={draft}
              rows={2}
              placeholder={isBusy ? 'Working…' : 'Describe the edit…'}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  send(draft);
                  setDraft('');
                }
              }}
              className="w-full resize-none bg-transparent text-[13px] leading-[18px] text-neutral-highOnSurface outline-none placeholder:text-neutral-lowOnSurface"
            />
            <div className="flex justify-end">
              <button
                type="button"
                title="Send"
                disabled={!draft.trim() || isBusy}
                onClick={() => {
                  send(draft);
                  setDraft('');
                }}
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

      {/* 底部：时间线轨道，宽度让出右侧 agent 坞 */}
      <section
        data-edit-dock-timeline
        className="absolute bottom-0 left-0 z-30 flex animate-dock-in-up flex-col border-t border-solid border-neutral-fillLow bg-neutral-surface shadow-[0_-12px_32px_rgba(16,24,40,0.10)]"
        style={{ height: EDIT_DOCK_BOTTOM_H, right: EDIT_DOCK_RIGHT_W }}
      >
        {/* 走带条：剪辑工具 / 播放控制 / 缩放 */}
        <div className="flex shrink-0 items-center gap-1 border-b border-solid border-neutral-fillLow px-3 py-1.5">
          <button
            type="button"
            title="Split clip at playhead"
            className="flex size-7 items-center justify-center rounded-lg text-neutral-mediumOnSurface transition-colors hover:bg-neutral-surface2"
          >
            <KsIconCut size={14} />
          </button>
          <button
            type="button"
            title="Duplicate clip"
            className="flex size-7 items-center justify-center rounded-lg text-neutral-mediumOnSurface transition-colors hover:bg-neutral-surface2"
          >
            <KsIconCopyContent size={14} />
          </button>
          <button
            type="button"
            title="Delete clip"
            className="flex size-7 items-center justify-center rounded-lg text-neutral-mediumOnSurface transition-colors hover:bg-neutral-surface2"
          >
            <KsIconDelete size={14} />
          </button>

          <span className="flex-1" />

          <span className="text-[13px] font-medium tabular-nums text-neutral-highOnSurface">
            {formatTime(currentTime)}
            <span className="text-neutral-lowOnSurface"> / {formatTime(DEMO_DURATION)}</span>
          </span>
          <button
            type="button"
            title="Jump to start"
            onClick={() => setCurrentTime(0)}
            className="ml-2 flex size-7 items-center justify-center rounded-lg text-[11px] text-neutral-mediumOnSurface transition-colors hover:bg-neutral-surface2"
          >
            ⏮
          </button>
          <button
            type="button"
            title={isPlaying ? 'Pause' : 'Play'}
            onClick={() => {
              if (!isPlaying && currentTime >= DEMO_DURATION) {
                setCurrentTime(0);
              }
              setIsPlaying((playing) => !playing);
            }}
            className="flex size-8 items-center justify-center rounded-full bg-neutral-fillHigh text-[12px] text-neutral-onFill transition-opacity hover:opacity-85"
          >
            {isPlaying ? '❚❚' : '▶'}
          </button>
          <button
            type="button"
            title="Jump to end"
            onClick={() => setCurrentTime(DEMO_DURATION)}
            className="flex size-7 items-center justify-center rounded-lg text-[11px] text-neutral-mediumOnSurface transition-colors hover:bg-neutral-surface2"
          >
            ⏭
          </button>

          <span className="flex-1" />

          <div className="flex items-center gap-2">
            <KsIconZoomOut size={13} className="text-neutral-lowOnSurface" />
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={timelineZoom}
              title="Timeline zoom"
              onChange={(event) => setTimelineZoom(Number(event.target.value))}
              className="w-24 accent-primary-fill"
            />
            <KsIconZoomIn size={13} className="text-neutral-lowOnSurface" />
          </div>
        </div>

        {/* 轨道区：左侧 gutter 固定，右侧标尺 + 轨道横向滚动 */}
        <div className="flex min-h-0 flex-1">
          <div className="flex w-14 shrink-0 flex-col border-r border-solid border-neutral-fillLow">
            <div className="h-7 shrink-0" />
            {[2, 1].map((trackNo) => (
              <div
                key={trackNo}
                className="flex h-14 items-center justify-center gap-1 text-neutral-mediumOnSurface"
              >
                <span className="text-[11px] font-medium tabular-nums">{trackNo}</span>
                <KsIconSound size={11} />
              </div>
            ))}
          </div>

          <div className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
            <div className="relative" style={{ width: timelineWidth + 48 }}>
              {/* 标尺：点击定位播放头 */}
              <div
                className="relative h-7 cursor-pointer border-b border-solid border-neutral-fillLow"
                onClick={seekFromRuler}
              >
                {rulerMarks.map((second) => (
                  <span
                    key={second}
                    className="absolute top-1.5 text-[10px] tabular-nums text-neutral-lowOnSurface"
                    style={{ left: second * pxPerSecond + 4 }}
                  >
                    {formatTime(second).slice(0, 5)}
                  </span>
                ))}
              </div>

              {/* 轨道 2：视频分段，铺封面缩略图 */}
              <div className="relative h-14 py-1.5">
                {VIDEO_CLIPS.map((clip) => (
                  <div
                    key={clip.id}
                    title={clip.label}
                    className="absolute inset-y-1.5 overflow-hidden rounded-md border border-solid border-neutral-fillLow bg-neutral-surface2"
                    style={{ left: clip.start * pxPerSecond, width: clip.duration * pxPerSecond - 2 }}
                  >
                    {posterUrl ? (
                      <div
                        className="absolute inset-0"
                        style={{
                          backgroundImage: `url(${posterUrl})`,
                          backgroundSize: 'auto 100%',
                          backgroundRepeat: 'repeat-x'
                        }}
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-primary-surface2 to-neutral-surface2" />
                    )}
                    <span className="absolute left-1.5 top-1 rounded bg-neutral-fillHigh/70 px-1 text-[10px] font-medium text-neutral-onFill">
                      {clip.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* 轨道 1:品牌图形条 + 波形 */}
              <div className="relative h-14 py-1.5">
                <div
                  title={GRAPHIC_CLIP.label}
                  className="absolute inset-y-1.5 overflow-hidden rounded-md border border-solid border-primary-fill/40 bg-primary-surface2"
                  style={{ left: GRAPHIC_CLIP.start * pxPerSecond, width: GRAPHIC_CLIP.duration * pxPerSecond - 2 }}
                >
                  <span className="absolute left-1.5 top-1 text-[10px] font-semibold text-primary-onSurface">
                    {GRAPHIC_CLIP.label}
                  </span>
                  <div className="absolute inset-x-1.5 bottom-1 flex h-3 items-end gap-px">
                    {waveBars(GRAPHIC_CLIP.duration * pxPerSecond).map((height, index) => (
                      // 波形是纯装饰，序列固定，用下标当 key 没问题
                      // eslint-disable-next-line react/no-array-index-key
                      <span key={index} className="w-1 rounded-sm bg-primary-fill/50" style={{ height: `${height * 100}%` }} />
                    ))}
                  </div>
                </div>
              </div>

              {/* 播放头：绿旗 + 竖线，贯穿标尺和轨道 */}
              <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: currentTime * pxPerSecond }}>
                <div className="absolute -left-[5px] top-0 h-3.5 w-2.5 rounded-sm rounded-bl-none bg-primary-fill" />
                <div className="absolute inset-y-0 w-px bg-primary-fill" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export default NodeEditDock;
