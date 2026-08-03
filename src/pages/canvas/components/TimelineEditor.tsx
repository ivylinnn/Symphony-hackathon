/* eslint-disable max-lines-per-function */
import {
  KsIconClose,
  KsIconCopyContent,
  KsIconCut,
  KsIconDelete,
  KsIconDownload,
  KsIconFolder,
  KsIconSound
} from '@fe-infra/keystone-icons-react';
import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';

import { INITIAL_TIMELINE_TRACKS } from '../const';
import { planEdit } from '../services/timeline-ai';
import {
  activeVideoClip,
  applyOperations,
  buildPreview,
  clipPlaybackRate,
  findClip,
  findTrackIdOfClip,
  sourceTimeAt,
  summarizePreview,
  timelineDuration
} from '../timeline-ops';
import type { ClipDiffStatus, TimelineEditPlan, TimelineTrack, TimelineTrackKind } from '../types';
import TimelineAgentBar from './TimelineAgentBar';

interface TimelineEditorProps {
  /** 编辑对象的名称，展示在标题和预览占位上。 */
  sourceLabel: string;
  /** 来源节点的可播放视频；有值时预览区放真实视频而不是占位块。 */
  videoUrl?: string;
  /** 视频封面，也用作没有 videoUrl 时的静态预览图。 */
  posterUrl?: string;
  onClose: () => void;
}

/** 时间轴每秒占用的像素，缩放滑杆会在此基础上乘系数。 */
const BASE_PX_PER_SECOND = 104;
/** 标尺至少画这么多秒，内容更长时按内容延展。 */
const MIN_RULER_SECONDS = 9;
const PLAYBACK_TICK_MS = 100;
/** 预览视频与播放头允许的最大偏差（秒），超过才回拉。 */
const DRIFT_TOLERANCE = 0.4;
/** 读不到素材时长时（解码失败等）建轨道用的兜底时长。 */
const FALLBACK_MEDIA_SECONDS = 6;
/** 每段分镜的目标时长（秒），用来决定把素材切成几段。 */
const TARGET_SEGMENT_SECONDS = 7;
const MIN_SEGMENTS = 2;
/** 转场元素的时长，跨在两段分镜的接缝上。 */
const TRANSITION_SECONDS = 0.5;

/** 分镜按广告结构命名，和画布上的 Hook / Body / CTA 节点对齐。 */
const SEGMENT_LABELS = ['Hook', 'Body', 'Proof', 'CTA', 'Outro'];
const TRANSITION_LABELS = ['Cross dissolve', 'Whip pan', 'Dip to black', 'Cross dissolve'];

/** 轨道头上的短标签，比纯序号更容易分辨这一行是什么。 */
const TRACK_TAG: Record<TimelineTrackKind, string> = {
  video: 'VID',
  transition: 'TRN',
  audio: 'MUS',
  caption: 'TXT'
};

/** 各类轨道的片段配色，扫一眼就能区分画面、转场、音乐和字幕。 */
const TRACK_TONE: Record<TimelineTrackKind, string> = {
  video: 'border-neutral-fillLow bg-neutral-surface2 hover:bg-neutral-surface3',
  transition: 'border-primary-fill/40 bg-primary-surface3 hover:bg-primary-surface2',
  audio: 'border-success-fill/40 bg-success-fill/10 hover:bg-success-fill/20',
  caption: 'border-neutral-fill/40 bg-neutral-surface3 hover:bg-neutral-surface2'
};

/** 预览态下片段的描边样式，全用虚线以便和「选中」的实线区分开。 */
const DIFF_CLASS: Record<ClipDiffStatus, string> = {
  added: 'border-dashed border-success-fill bg-success-fill/10',
  removed: 'border-dashed border-error-fill bg-error-fillLow opacity-60',
  changed: 'border-dashed border-primary-fill bg-primary-surface3',
  unchanged: ''
};

/** 把秒格式化成 00:00.00。 */
const formatTime = (seconds: number) => {
  const clamped = Math.max(0, seconds);
  const mm = String(Math.floor(clamped / 60)).padStart(2, '0');
  const ss = String(Math.floor(clamped % 60)).padStart(2, '0');
  const cs = String(Math.floor((clamped % 1) * 100)).padStart(2, '0');
  return `${mm}:${ss}.${cs}`;
};

function ToolButton({
  children,
  isActive,
  title,
  onClick
}: {
  children: React.ReactNode;
  isActive?: boolean;
  title: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={clsx(
        'flex size-8 items-center justify-center rounded-lg transition-colors',
        isActive
          ? 'bg-primary-surface2 text-primary-onSurface'
          : 'text-neutral-mediumOnSurface hover:bg-neutral-surface2'
      )}
    >
      {children}
    </button>
  );
}

/**
 * 全屏时间线编辑器，参考 Flora 的 Timeline Editor。
 * 上方预览、下方多轨时间线、右侧属性面板。
 */
function TimelineEditor({ sourceLabel, videoUrl, posterUrl, onClose }: TimelineEditorProps) {
  /*
   * 有真实视频时，时间线从这条视频建起来（等 loadedmetadata 拿到真实时长）；
   * 没有视频的节点仍然用示例轨道，保持原有 demo 行为。
   */
  const [tracks, setTracks] = useState<TimelineTrack[]>(videoUrl ? [] : INITIAL_TIMELINE_TRACKS);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(videoUrl ? null : 'clip-1');
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const rulerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  /** 只根据素材时长建一次轨道，避免重新加载 metadata 时冲掉用户的编辑。 */
  const seededRef = useRef(false);
  /** 复制片段的自增后缀，保证 id 唯一。 */
  const copySeqRef = useRef(1);

  /* AI 编辑：计划待确认时只做预览，应用后把上一版存进 undoSnapshot。 */
  const [plan, setPlan] = useState<TimelineEditPlan | null>(null);
  const [skippedOpIds, setSkippedOpIds] = useState<Set<string>>(new Set());
  const [isPlanning, setIsPlanning] = useState(false);
  const [undoSnapshot, setUndoSnapshot] = useState<TimelineTrack[] | null>(null);

  /** 勾选中的操作，取消勾选的不参与预览也不会被应用。 */
  const acceptedOperations = useMemo(
    () => (plan ? plan.operations.filter((operation) => !skippedOpIds.has(operation.id)) : []),
    [plan, skippedOpIds]
  );

  /** 计划待确认时，时间线画的是应用后的样子。 */
  const previewTracks = useMemo(
    () => (acceptedOperations.length > 0 ? applyOperations(tracks, acceptedOperations) : tracks),
    [tracks, acceptedOperations]
  );

  const trackPreviews = useMemo(
    () => buildPreview(tracks, previewTracks),
    [tracks, previewTracks]
  );

  const diffCounts = useMemo(
    () => (plan ? summarizePreview(trackPreviews) : null),
    [plan, trackPreviews]
  );

  const pxPerSecond = BASE_PX_PER_SECOND * zoom;
  const duration = Math.max(timelineDuration(previewTracks), 1);
  const rulerSeconds = Math.max(MIN_RULER_SECONDS, Math.ceil(duration));

  const requestPlan = async (prompt: string) => {
    setIsPlanning(true);
    try {
      const next = await planEdit(prompt, tracks, currentTime);
      setPlan(next);
      setSkippedOpIds(new Set());
    } finally {
      setIsPlanning(false);
    }
  };

  const toggleOperation = (operationId: string) => {
    setSkippedOpIds((current) => {
      const next = new Set(current);
      if (next.has(operationId)) {
        next.delete(operationId);
      } else {
        next.add(operationId);
      }
      return next;
    });
  };

  const applyPlan = () => {
    if (acceptedOperations.length === 0) {
      return;
    }
    setUndoSnapshot(tracks);
    setTracks(applyOperations(tracks, acceptedOperations));
    setPlan(null);
    setSkippedOpIds(new Set());
  };

  const discardPlan = () => {
    setPlan(null);
    setSkippedOpIds(new Set());
  };

  const undoAiEdit = () => {
    if (!undoSnapshot) {
      return;
    }
    setTracks(undoSnapshot);
    setUndoSnapshot(null);
    setSelectedClipId(null);
  };

  /** 播放头当前落在哪个有画面的片段上，决定预览播哪一段素材。 */
  const active = useMemo(() => activeVideoClip(previewTracks, currentTime), [previewTracks, currentTime]);

  /*
   * 拿到真实时长后，用整条视频建一条视频轨；只建一次，后续编辑不再被覆盖。
   * 解码失败时也要建（用兜底时长），否则时间线会一直空着，编辑器直接不可用。
   */
  const seedFromMedia = (mediaDuration: number) => {
    if (!videoUrl || seededRef.current) {
      return;
    }
    seededRef.current = true;

    /*
     * 一整条视频摊成一个片段没法剪，所以按目标段长切成若干分镜，
     * 接缝上放转场，底下铺一条音乐。每段都带自己的素材入点，
     * 因此拖动、切分、删除任意一段都只影响那一段的画面。
     */
    const segments = Math.max(
      MIN_SEGMENTS,
      Math.min(SEGMENT_LABELS.length, Math.round(mediaDuration / TARGET_SEGMENT_SECONDS))
    );
    const segmentLength = mediaDuration / segments;

    const videoClips = Array.from({ length: segments }, (_, index) => ({
      id: `clip-scene-${index + 1}`,
      label: SEGMENT_LABELS[index] ?? `Scene ${index + 1}`,
      start: index * segmentLength,
      duration: segmentLength,
      hasAudio: true,
      sourceUrl: videoUrl,
      sourceStart: index * segmentLength,
      sourceDuration: segmentLength
    }));

    // 转场跨在接缝上，所以起点要往前挪半个转场长度
    const transitionClips = Array.from({ length: segments - 1 }, (_, index) => ({
      id: `clip-transition-${index + 1}`,
      label: TRANSITION_LABELS[index % TRANSITION_LABELS.length],
      start: Math.max(0, (index + 1) * segmentLength - TRANSITION_SECONDS / 2),
      duration: TRANSITION_SECONDS,
      hasAudio: false
    }));

    setTracks([
      { id: 'track-video', kind: 'video', visible: true, muted: false, clips: videoClips },
      ...(transitionClips.length
        ? [{ id: 'track-transition', kind: 'transition' as const, visible: true, muted: false, clips: transitionClips }]
        : []),
      {
        id: 'track-music',
        kind: 'audio',
        visible: true,
        muted: false,
        clips: [
          {
            id: 'clip-music',
            label: 'Brand BGM — upbeat',
            start: 0,
            duration: mediaDuration,
            hasAudio: true
          }
        ]
      }
    ]);
    setSelectedClipId(videoClips[0].id);
  };

  const handleMetadata = () => {
    const video = videoRef.current;
    seedFromMedia(video && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : FALLBACK_MEDIA_SECONDS);
  };

  /*
   * 时间线是时钟：播放头由定时器推进，预览视频跟着播放头走。
   * 每一拍都按当前片段把「时间线时间」换算成「素材时间」，所以裁剪、切分、
   * 变速、删除都会直接改变播放内容 —— 跳过的片段就是跳过的画面。
   */
  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    const timer = setInterval(() => {
      setCurrentTime((time) => {
        const next = time + PLAYBACK_TICK_MS / 1000;
        if (next >= duration) {
          setIsPlaying(false);
          return duration;
        }
        const video = videoRef.current;
        const current = activeVideoClip(previewTracks, next);
        if (video && current && !video.seeking) {
          const target = sourceTimeAt(current.clip, next);
          if (Math.abs(video.currentTime - target) > DRIFT_TOLERANCE) {
            video.currentTime = target;
          }
        }
        return next;
      });
    }, PLAYBACK_TICK_MS);
    return () => clearInterval(timer);
  }, [duration, isPlaying, previewTracks]);

  /* 播放/暂停同步给预览视频；空隙里没有画面就停住。浏览器挡下带声播放时退回静音重试。 */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (!isPlaying || !active) {
      video.pause();
      return;
    }
    video.playbackRate = Math.min(16, Math.max(0.0625, clipPlaybackRate(active.clip)));
    video.play().catch(() => {
      video.muted = true;
      video.play().catch(() => undefined);
    });
  }, [isPlaying, active]);

  /* 轨道静音开关直接作用到预览。 */
  useEffect(() => {
    const video = videoRef.current;
    if (video && active) {
      video.muted = active.track.muted;
    }
  }, [active]);

  /** 统一的跳转入口：播放头和预览视频一起挪到对应的素材位置。 */
  const seekTo = (seconds: number) => {
    const clamped = Math.max(0, Math.min(duration, seconds));
    setCurrentTime(clamped);
    const video = videoRef.current;
    const current = activeVideoClip(previewTracks, clamped);
    if (video && current) {
      video.currentTime = sourceTimeAt(current.clip, clamped);
    }
  };

  /** 点击标尺跳转播放头。 */
  const seekFromPointer = (clientX: number) => {
    const rect = rulerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    seekTo((clientX - rect.left) / pxPerSecond);
  };

  const toggleTrackFlag = (trackId: string, flag: 'visible' | 'muted') => {
    setTracks((current) =>
      current.map((track) => (track.id === trackId ? { ...track, [flag]: !track[flag] } : track))
    );
  };

  const deleteSelectedClip = () => {
    if (!selectedClipId) {
      return;
    }
    setTracks((current) =>
      current.map((track) => ({ ...track, clips: track.clips.filter((clip) => clip.id !== selectedClipId) }))
    );
    setSelectedClipId(null);
  };

  /** 在播放头处切开选中片段；走和 AI 计划同一套算子，素材入点才会跟着分。 */
  const splitSelectedClip = () => {
    if (!selectedClipId) {
      return;
    }
    setTracks((current) =>
      applyOperations(current, [
        { id: 'manual-split', label: 'Split', op: { type: 'split', clipId: selectedClipId, at: currentTime } }
      ])
    );
  };

  /** 复制选中片段，接在它后面，并把后续片段整体后移让出位置。 */
  const duplicateSelectedClip = () => {
    if (!selectedClipId) {
      return;
    }
    const source = findClip(tracks, selectedClipId);
    const trackId = findTrackIdOfClip(tracks, selectedClipId);
    if (!source || !trackId) {
      return;
    }
    const copyId = `${source.id}-copy-${copySeqRef.current++}`;
    setTracks((current) =>
      applyOperations(current, [
        // 先给副本腾位置，再插入，否则会和后面的片段叠在一起
        ...current
          .flatMap((track) => track.clips)
          .filter((clip) => clip.start >= source.start + source.duration)
          .map((clip) => ({
            id: `shift-${clip.id}`,
            label: 'Shift',
            op: { type: 'set-timing' as const, clipId: clip.id, start: clip.start + source.duration, duration: clip.duration }
          })),
        {
          id: 'manual-duplicate',
          label: 'Duplicate',
          op: {
            type: 'add-clip' as const,
            trackId,
            clip: { ...source, id: copyId, start: source.start + source.duration }
          }
        }
      ])
    );
    setSelectedClipId(copyId);
  };

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-neutral-surface1" data-timeline-editor>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* 预览区 */}
          <div className="relative flex min-h-0 flex-1 items-center justify-center p-6">
            <div className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-1 rounded-xl bg-neutral-fillHigh px-1.5 py-1 text-neutral-onFill shadow-[0_10px_30px_rgba(16,24,40,0.16)]">
              <button
                type="button"
                title="Close timeline editor"
                onClick={onClose}
                className="flex size-7 items-center justify-center rounded-md hover:bg-neutral-onFill/15"
              >
                <KsIconClose size={14} />
              </button>
              <button
                type="button"
                title="Save to library"
                className="flex size-7 items-center justify-center rounded-md hover:bg-neutral-onFill/15"
              >
                <KsIconFolder size={14} />
              </button>
              <button
                type="button"
                title="Download"
                className="flex size-7 items-center justify-center rounded-md hover:bg-neutral-onFill/15"
              >
                <KsIconDownload size={14} />
              </button>
            </div>

            {/* 来源节点带视频就直接放它，点画面或用下方走带都能播放/暂停；否则退回占位块 */}
            {videoUrl ? (
              <div className="relative flex h-full max-h-[420px] items-center justify-center">
                <video
                  key={videoUrl}
                  ref={videoRef}
                  src={videoUrl}
                  poster={posterUrl}
                  playsInline
                  preload="metadata"
                  title={isPlaying ? `Pause ${sourceLabel}` : `Play ${sourceLabel}`}
                  onLoadedMetadata={handleMetadata}
                  onError={() => seedFromMedia(FALLBACK_MEDIA_SECONDS)}
                  onClick={() => setIsPlaying((playing) => !playing)}
                  className="h-full cursor-pointer rounded-xl bg-neutral-fillHigh object-contain"
                />
                {/* 暂停时给个可点提示，播放时不挡画面 */}
                {!isPlaying ? (
                  <span className="pointer-events-none absolute flex size-14 items-center justify-center rounded-full bg-neutral-fillHigh/60 pl-1 text-[20px] text-neutral-onFill">
                    ▶
                  </span>
                ) : null}
              </div>
            ) : posterUrl ? (
              <img
                src={posterUrl}
                alt={sourceLabel}
                className="h-full max-h-[420px] rounded-xl bg-neutral-fillHigh object-contain"
              />
            ) : (
              <div className="flex h-full max-h-[420px] w-[236px] items-center justify-center rounded-xl bg-gradient-to-br from-neutral-surface2 to-primary-surface2">
                <span className="text-[12px] font-medium text-neutral-mediumOnSurface">{sourceLabel}</span>
              </div>
            )}
          </div>

          {/* 时间线区 */}
          <div className="shrink-0 border-t border-solid border-neutral-fillLow bg-neutral-surface">
            <div className="flex items-center gap-1 px-3 py-2">
              <ToolButton title="Split clip at playhead" onClick={splitSelectedClip}>
                <KsIconCut size={15} />
              </ToolButton>
              <ToolButton title="Duplicate clip" onClick={duplicateSelectedClip}>
                <KsIconCopyContent size={15} />
              </ToolButton>
              <ToolButton title="Delete clip" onClick={deleteSelectedClip}>
                <KsIconDelete size={15} />
              </ToolButton>

              <span className="ml-3 min-w-[68px] text-[12px] tabular-nums text-neutral-highOnSurface">
                {formatTime(currentTime)}
              </span>

              <div className="flex flex-1 items-center justify-center gap-1">
                <ToolButton title="Jump to start" onClick={() => seekTo(0)}>
                  ⏮
                </ToolButton>
                <button
                  type="button"
                  title={isPlaying ? 'Pause' : 'Play'}
                  onClick={() => setIsPlaying((playing) => !playing)}
                  className="flex size-8 items-center justify-center rounded-lg bg-neutral-surface2 text-neutral-highOnSurface transition-colors hover:bg-neutral-surface3"
                >
                  {isPlaying ? '❚❚' : '▶'}
                </button>
                <ToolButton title="Jump to end" onClick={() => seekTo(duration)}>
                  ⏭
                </ToolButton>
              </div>

              <span className="min-w-[68px] text-right text-[12px] tabular-nums text-neutral-lowOnSurface">
                {formatTime(duration)}
              </span>

              <div className="ml-3 flex items-center gap-2">
                <span className="text-neutral-lowOnSurface">−</span>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.1}
                  value={zoom}
                  title="Timeline zoom"
                  onChange={(event) => setZoom(Number(event.target.value))}
                  className="w-24 accent-primary-fill"
                />
                <span className="text-neutral-lowOnSurface">+</span>
              </div>
            </div>

            <div className="flex border-t border-solid border-neutral-fillLow">
              {/* 轨道头 */}
              <div className="w-[136px] shrink-0 border-r border-solid border-neutral-fillLow">
                <div className="h-7 border-b border-solid border-neutral-fillLow" />
                {trackPreviews.map(({ track, isNewTrack }, index) => (
                  <div
                    key={track.id}
                    className={clsx(
                      'flex h-[72px] items-center gap-1.5 border-b border-solid border-neutral-fillLow px-2',
                      isNewTrack && 'bg-success-fill/5'
                    )}
                  >
                    <span
                      className={clsx(
                        'w-3 shrink-0 text-[11px] tabular-nums',
                        isNewTrack ? 'text-success-onSurface' : 'text-neutral-lowOnSurface'
                      )}
                      title={isNewTrack ? 'New track from the pending AI edit' : undefined}
                    >
                      {isNewTrack ? '+' : index + 1}
                    </span>
                    <span
                      className="shrink-0 rounded bg-neutral-surface2 px-1 text-[9px] font-semibold tracking-wide text-neutral-mediumOnSurface"
                      title={`${track.kind} track`}
                    >
                      {TRACK_TAG[track.kind]}
                    </span>
                    <button
                      type="button"
                      title={track.visible ? 'Hide track' : 'Show track'}
                      onClick={() => toggleTrackFlag(track.id, 'visible')}
                      className={clsx(
                        'flex size-6 items-center justify-center rounded-md text-[11px]',
                        track.visible ? 'text-neutral-mediumOnSurface' : 'text-neutral-lowOnSurface opacity-50'
                      )}
                    >
                      👁
                    </button>
                    <button
                      type="button"
                      title={track.muted ? 'Unmute track' : 'Mute track'}
                      onClick={() => toggleTrackFlag(track.id, 'muted')}
                      className={clsx(
                        'flex size-6 items-center justify-center rounded-md',
                        track.muted ? 'text-neutral-lowOnSurface opacity-50' : 'text-neutral-mediumOnSurface'
                      )}
                    >
                      <KsIconSound size={13} />
                    </button>
                  </div>
                ))}
              </div>

              {/* 标尺 + 轨道 */}
              <div className="relative min-w-0 flex-1 overflow-x-auto">
                <div style={{ width: rulerSeconds * pxPerSecond }}>
                  <div
                    ref={rulerRef}
                    className="relative h-7 cursor-pointer border-b border-solid border-neutral-fillLow"
                    onPointerDown={(event) => seekFromPointer(event.clientX)}
                  >
                    {Array.from({ length: rulerSeconds }, (_, second) => (
                      <span
                        key={second}
                        className="absolute top-1.5 text-[10px] tabular-nums text-neutral-lowOnSurface"
                        style={{ left: second * pxPerSecond + 4 }}
                      >
                        {`00:${String(second).padStart(2, '0')}`}
                      </span>
                    ))}
                  </div>

                  {trackPreviews.map(({ track, clips }) => (
                    <div key={track.id} className="relative h-[72px] border-b border-solid border-neutral-fillLow">
                      {clips.map(({ clip, status }) => (
                        <button
                          key={`${clip.id}-${status}`}
                          type="button"
                          title={status === 'removed' ? `${clip.label} — will be removed` : clip.label}
                          // 幽灵块只是预览，不参与选中
                          disabled={status === 'removed'}
                          onClick={() => setSelectedClipId(clip.id)}
                          className={clsx(
                            'absolute top-2 flex h-[56px] flex-col overflow-hidden rounded-md border text-left transition-colors',
                            status === 'unchanged' && selectedClipId === clip.id
                              ? 'border-primary-fill bg-primary-surface2'
                              : status === 'unchanged'
                                ? TRACK_TONE[track.kind]
                                : DIFF_CLASS[status],
                            !track.visible && 'opacity-40'
                          )}
                          style={{ left: clip.start * pxPerSecond, width: Math.max(24, clip.duration * pxPerSecond) }}
                        >
                          <span
                            className={clsx(
                              'truncate px-1.5 pt-1 text-[10px] font-medium text-neutral-highOnSurface',
                              status === 'removed' && 'line-through'
                            )}
                          >
                            {clip.label}
                          </span>
                          {clip.hasAudio ? (
                            <span className="mt-auto flex h-4 items-end gap-px px-1 pb-1">
                              {Array.from({ length: 24 }, (_, bar) => (
                                <span
                                  key={bar}
                                  className="flex-1 rounded-sm bg-primary-fill/40"
                                  style={{ height: `${30 + ((bar * 37) % 70)}%` }}
                                />
                              ))}
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ))}

                  {/* 播放头 */}
                  <div
                    className="pointer-events-none absolute top-0 z-10 h-full w-px bg-primary-fill"
                    style={{ left: currentTime * pxPerSecond }}
                  >
                    <span className="absolute -left-1 top-0 size-2 rounded-sm bg-primary-fill" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧 AI 编辑面板 */}
        <aside className="flex w-[280px] shrink-0 flex-col overflow-hidden border-l border-solid border-neutral-fillLow bg-neutral-surface">
          <div className="flex shrink-0 items-center gap-2 border-b border-solid border-neutral-fillLow px-3 py-2.5">
            <span className="flex-1 truncate text-[12px] font-semibold text-neutral-highOnSurface">
              Timeline Editor
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-neutral-lowOnSurface">
              {formatTime(duration)}
            </span>
          </div>

          <TimelineAgentBar
            isBusy={isPlanning}
            plan={plan}
            skippedOpIds={skippedOpIds}
            diff={diffCounts}
            canUndo={Boolean(undoSnapshot)}
            onSubmit={requestPlan}
            onToggleOp={toggleOperation}
            onApply={applyPlan}
            onDiscard={discardPlan}
            onUndo={undoAiEdit}
          />
        </aside>
      </div>
    </div>
  );
}

export default TimelineEditor;
