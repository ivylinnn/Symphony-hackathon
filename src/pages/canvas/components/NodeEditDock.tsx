import {
  KsIconClose,
  KsIconCopyContent,
  KsIconCut,
  KsIconDelete,
  KsIconSound,
  KsIconZoomIn,
  KsIconZoomOut
} from '@fe-infra/keystone-icons-react';
import { useEffect, useRef, useState } from 'react';

/** 右侧 Creative agent 面板的宽度；聚焦视口和时间线右缘都以它让位。 */
export const EDIT_DOCK_RIGHT_W = 340;
/** 底部时间线坞的高度；参与聚焦视口计算。 */
export const EDIT_DOCK_BOTTOM_H = 252;

/** 没有真实视频可绑定时（纯封面变体卡等）时间线的兜底时长（秒）。 */
const DEMO_DURATION = 19.15;
/** 时间线基准密度，缩放滑杆在此基础上乘系数。 */
const BASE_PX_PER_SECOND = 56;
const PLAYBACK_TICK_MS = 100;
/** 从视频里抽多少帧铺进视频轨。 */
const FILMSTRIP_FRAMES = 8;

/** 视频轨按广告结构切成 Hook / Body / CTA 三段，跨度随真实时长等比伸缩。 */
const buildVideoClips = (duration: number) => [
  { id: 'clip-hook', label: 'Hook', start: 0, duration: duration / 3 },
  { id: 'clip-body', label: 'Body', start: duration / 3, duration: duration / 3 },
  { id: 'clip-cta', label: 'CTA', start: (duration * 2) / 3, duration: duration / 3 }
];

/** 卖点动效应用后，预览切到的成片（带 selling-point 贴片的渲染版本）。 */
export const SELLING_POINT_VIDEO_URL = '/video-with-selling-points.mp4';

/**
 * 离屏抽帧：同源视频逐点 seek，canvas 抓帧转 dataURL。
 * 解不了码（无编解码器的无头环境等）就抛出，调用方退回封面平铺。
 */
const extractFilmstrip = async (src: string, count: number): Promise<string[]> => {
  const video = document.createElement('video');
  video.src = src;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error('video load failed'));
  });
  if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoHeight) {
    throw new Error('no decodable video');
  }
  const canvas = document.createElement('canvas');
  const scale = 96 / video.videoHeight;
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = 96;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('no canvas context');
  }
  const frames: string[] = [];
  for (let index = 0; index < count; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      video.currentTime = ((index + 0.5) / count) * video.duration;
    });
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push(canvas.toDataURL('image/jpeg', 0.6));
  }
  video.removeAttribute('src');
  video.load();
  return frames;
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
  /** 正在编辑的节点 id，用来在 DOM 里找到卡片上的 <video> 做播放同步。 */
  nodeId: string;
  /** 节点的真实视频；有值时时间线用它的时长、抽帧和播放进度。 */
  videoUrl?: string;
  /** 视频封面，抽不了帧时铺视频轨的兜底缩略图。 */
  posterUrl?: string;
  /** Creative agent 确认的卖点，按顺序落成图形轨上的 callout。 */
  sellingPoints: string[];
  onClose: () => void;
}

/**
 * 内联编辑模式的底部时间线坞（agent 对话在右侧的 Creative agent 面板里）。
 * 画布把镜头推近节点后，本组件从底部滑入，绑定该节点的视频做播放同步。
 */
function NodeEditDock({ nodeId, videoUrl, posterUrl, sellingPoints, onClose }: NodeEditDockProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [timelineZoom, setTimelineZoom] = useState(1);
  /** 真实视频时长；绑不到视频时用兜底值。 */
  const [duration, setDuration] = useState(DEMO_DURATION);
  /** 从视频里抽出来的胶片帧，铺在视频轨上。 */
  const [filmstrip, setFilmstrip] = useState<string[]>([]);
  /** 画布卡片上的 <video>：时间线的播放/进度/seek 都以它为准。 */
  const boundVideoRef = useRef<HTMLVideoElement | null>(null);
  /** 视频解不了码（缺编解码器等）：解绑，播放头退回本地推进。 */
  const [videoBroken, setVideoBroken] = useState(false);

  const pxPerSecond = BASE_PX_PER_SECOND * timelineZoom;
  const timelineWidth = duration * pxPerSecond;

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

  /* 换了视频（卖点渲染版等）就重置解码状态，重新绑定。 */
  useEffect(() => {
    setVideoBroken(false);
  }, [videoUrl]);

  /*
   * 绑定画布卡片上的 <video>：时长、播放态、播放头全部跟着真实视频走。
   * 用户用卡片上的原生控制条播放，时间线也会同步。
   */
  useEffect(() => {
    if (!videoUrl || videoBroken) {
      return;
    }
    const video = document.querySelector<HTMLVideoElement>(`[data-node-id="${nodeId}"] video`);
    if (!video) {
      return;
    }
    boundVideoRef.current = video;

    const syncDuration = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        setDuration(video.duration);
      }
    };
    const markBroken = () => setVideoBroken(true);
    syncDuration();
    video.addEventListener('loadedmetadata', syncDuration);
    video.addEventListener('error', markBroken);

    const poll = window.setInterval(() => {
      setCurrentTime(video.currentTime);
      setIsPlaying(!video.paused && !video.ended);
    }, PLAYBACK_TICK_MS);

    return () => {
      video.removeEventListener('loadedmetadata', syncDuration);
      video.removeEventListener('error', markBroken);
      window.clearInterval(poll);
      video.pause();
      boundVideoRef.current = null;
    };
  }, [nodeId, videoBroken, videoUrl]);

  /* 抽帧铺视频轨；解不了码就保持空数组，渲染层退回封面平铺。 */
  useEffect(() => {
    setFilmstrip([]);
    if (!videoUrl) {
      return;
    }
    let cancelled = false;
    extractFilmstrip(videoUrl, FILMSTRIP_FRAMES)
      .then((frames) => {
        if (!cancelled) {
          setFilmstrip(frames);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [videoUrl]);

  /* 兜底播放：没有真实视频可绑时，本地推进播放头，到尾停住。 */
  useEffect(() => {
    if (!isPlaying || boundVideoRef.current) {
      return;
    }
    const timer = window.setInterval(() => {
      setCurrentTime((time) => {
        const next = time + PLAYBACK_TICK_MS / 1000;
        if (next >= duration) {
          setIsPlaying(false);
          return duration;
        }
        return next;
      });
    }, PLAYBACK_TICK_MS);
    return () => window.clearInterval(timer);
  }, [duration, isPlaying]);

  const seekTo = (time: number) => {
    const clamped = Math.min(duration, Math.max(0, time));
    const video = boundVideoRef.current;
    if (video) {
      video.currentTime = clamped;
    }
    setCurrentTime(clamped);
  };

  const togglePlay = () => {
    const video = boundVideoRef.current;
    if (video) {
      if (video.paused || video.ended) {
        if (video.ended || video.currentTime >= duration) {
          video.currentTime = 0;
        }
        video.play().catch(() => {
          // 环境放不了这个编码：解绑视频，本地推进播放头
          setVideoBroken(true);
          setIsPlaying(true);
        });
      } else {
        video.pause();
      }
      return;
    }
    if (!isPlaying && currentTime >= duration) {
      setCurrentTime(0);
    }
    setIsPlaying((playing) => !playing);
  };

  const seekFromRuler = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    seekTo((event.clientX - rect.left + event.currentTarget.scrollLeft) / pxPerSecond);
  };

  const rulerMarks = [];
  for (let second = 0; second <= Math.ceil(duration / 5) * 5; second += 5) {
    rulerMarks.push(second);
  }

  const videoClips = buildVideoClips(duration);
  /** 每帧覆盖的秒数，胶片条按它换算像素宽。 */
  const frameSpanSeconds = duration / Math.max(1, filmstrip.length);

  /** 卖点 callout：避开开头，等距铺在时间线上（占比存储，缩放不跑位）。 */
  const sellingGraphics = sellingPoints.map((label, index) => ({
    id: `selling-${index}-${label}`,
    label,
    startFrac: 0.1 + index * (0.8 / sellingPoints.length),
    durationFrac: Math.min(0.18, 0.6 / sellingPoints.length)
  }));

  return (
    <section
      data-edit-dock-timeline
      className="absolute bottom-0 left-0 z-30 flex animate-dock-in-up flex-col border-t border-solid border-neutral-fillLow bg-neutral-surface shadow-[0_-12px_32px_rgba(16,24,40,0.10)]"
      style={{ height: EDIT_DOCK_BOTTOM_H, right: EDIT_DOCK_RIGHT_W }}
    >
      {/* 走带条：剪辑工具 / 播放控制 / 缩放 / 关闭 */}
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
          <span className="text-neutral-lowOnSurface"> / {formatTime(duration)}</span>
        </span>
        <button
          type="button"
          title="Jump to start"
          onClick={() => seekTo(0)}
          className="ml-2 flex size-7 items-center justify-center rounded-lg text-[11px] text-neutral-mediumOnSurface transition-colors hover:bg-neutral-surface2"
        >
          ⏮
        </button>
        <button
          type="button"
          title={isPlaying ? 'Pause' : 'Play'}
          onClick={togglePlay}
          className="flex size-8 items-center justify-center rounded-full bg-neutral-fillHigh text-[12px] text-neutral-onFill transition-opacity hover:opacity-85"
        >
          {isPlaying ? '❚❚' : '▶'}
        </button>
        <button
          type="button"
          title="Jump to end"
          onClick={() => seekTo(duration)}
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
        <button
          type="button"
          title="Close editor"
          onClick={onClose}
          className="ml-1 flex size-7 items-center justify-center rounded-lg text-neutral-mediumOnSurface transition-colors hover:bg-neutral-surface2"
        >
          <KsIconClose size={14} />
        </button>
      </div>

      {/* 轨道区：左侧 gutter 固定，右侧标尺 + 轨道横向滚动 */}
      <div className="flex min-h-0 flex-1">
        <div className="flex w-14 shrink-0 flex-col border-r border-solid border-neutral-fillLow">
          <div className="h-7 shrink-0" />
          {[2, 1].map((trackNo) => (
            <div key={trackNo} className="flex h-14 items-center justify-center gap-1 text-neutral-mediumOnSurface">
              <span className="text-[11px] font-medium tabular-nums">{trackNo}</span>
              <KsIconSound size={11} />
            </div>
          ))}
        </div>

        <div className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
          <div className="relative" style={{ width: timelineWidth + 48 }}>
            {/* 标尺：点击定位播放头 */}
            <div className="relative h-7 cursor-pointer border-b border-solid border-neutral-fillLow" onClick={seekFromRuler}>
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

            {/* 轨道 2：视频分段。抽到帧就铺真实胶片条，否则退回封面平铺 */}
            <div className="relative h-14 py-1.5">
              {videoClips.map((clip) => (
                <div
                  key={clip.id}
                  title={clip.label}
                  className="absolute inset-y-1.5 overflow-hidden rounded-md border border-solid border-neutral-fillLow bg-neutral-surface2"
                  style={{ left: clip.start * pxPerSecond, width: clip.duration * pxPerSecond - 2 }}
                >
                  {filmstrip.length > 0 ? (
                    // 整条胶片按 -start 偏移，各段裁出自己覆盖的帧，拼起来正好是完整视频
                    <div className="absolute inset-y-0 flex" style={{ left: -clip.start * pxPerSecond, width: timelineWidth }}>
                      {filmstrip.map((frame, index) => (
                        <img
                          // 胶片帧顺序固定，用下标当 key 没问题
                          // eslint-disable-next-line react/no-array-index-key
                          key={index}
                          src={frame}
                          alt=""
                          draggable={false}
                          className="h-full object-cover"
                          style={{ width: frameSpanSeconds * pxPerSecond }}
                        />
                      ))}
                    </div>
                  ) : posterUrl ? (
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

            {/* 轨道 1：卖点动效轨。空着等 agent 问答落 callout，一个卖点一条 */}
            <div className="relative h-14 py-1.5">
              {sellingGraphics.length === 0 ? (
                <span className="absolute inset-y-1.5 flex items-center px-2 text-[10px] text-neutral-lowOnSurface">
                  Motion graphics land here — ask the Creative agent to call out selling points.
                </span>
              ) : null}
              {sellingGraphics.map((graphic) => (
                <div
                  key={graphic.id}
                  title={`Motion graphic — ${graphic.label}`}
                  data-selling-graphic
                  className="absolute inset-y-1.5 overflow-hidden rounded-md border border-solid border-amber-300 bg-amber-100"
                  style={{
                    left: graphic.startFrac * duration * pxPerSecond,
                    width: graphic.durationFrac * duration * pxPerSecond - 2
                  }}
                >
                  <span className="absolute left-1.5 top-1 truncate text-[10px] font-semibold text-amber-700">
                    ✦ {graphic.label}
                  </span>
                </div>
              ))}
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
  );
}

export default NodeEditDock;
