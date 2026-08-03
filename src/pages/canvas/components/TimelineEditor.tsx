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
import { applyOperations, buildPreview, summarizePreview, timelineDuration } from '../timeline-ops';
import type { ClipDiffStatus, TimelineEditPlan, TimelineTrack } from '../types';
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
  const [tracks, setTracks] = useState<TimelineTrack[]>(INITIAL_TIMELINE_TRACKS);
  const [selectedClipId, setSelectedClipId] = useState<string | null>('clip-1');
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const rulerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

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

  /*
   * 时间线是时钟，视频只是预览：多轨内容可能比这条视频长，所以播放头仍由定时器推进，
   * 视频跟随播放头走，偏差超过 DRIFT_TOLERANCE 才回拉一次，避免每帧 seek 造成卡顿。
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
        if (video && !video.seeking && Math.abs(video.currentTime - next) > DRIFT_TOLERANCE) {
          video.currentTime = Math.min(next, video.duration || next);
        }
        return next;
      });
    }, PLAYBACK_TICK_MS);
    return () => clearInterval(timer);
  }, [duration, isPlaying]);

  /* 把播放/暂停同步给预览视频；浏览器挡下带声播放时退回静音再试一次。 */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (!isPlaying) {
      video.pause();
      return;
    }
    video.play().catch(() => {
      video.muted = true;
      video.play().catch(() => undefined);
    });
  }, [isPlaying, videoUrl]);

  /** 统一的跳转入口：播放头和预览视频一起挪。 */
  const seekTo = (seconds: number) => {
    const clamped = Math.max(0, Math.min(duration, seconds));
    setCurrentTime(clamped);
    const video = videoRef.current;
    if (video) {
      video.currentTime = Math.min(clamped, video.duration || clamped);
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

  /** 在播放头处切开选中片段。 */
  const splitSelectedClip = () => {
    if (!selectedClipId) {
      return;
    }
    setTracks((current) =>
      current.map((track) => ({
        ...track,
        clips: track.clips.flatMap((clip) => {
          const cutAt = currentTime - clip.start;
          if (clip.id !== selectedClipId || cutAt <= 0 || cutAt >= clip.duration) {
            return [clip];
          }
          return [
            { ...clip, duration: cutAt },
            { ...clip, id: `${clip.id}-b`, start: clip.start + cutAt, duration: clip.duration - cutAt }
          ];
        })
      }))
    );
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

            {/* 来源节点带视频就直接放它，播放由下方走带控制；否则退回占位块 */}
            {videoUrl ? (
              <video
                key={videoUrl}
                ref={videoRef}
                src={videoUrl}
                poster={posterUrl}
                playsInline
                preload="metadata"
                title={sourceLabel}
                className="h-full max-h-[420px] rounded-xl bg-neutral-fillHigh object-contain"
              />
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
              <ToolButton title="Duplicate clip">
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
              <div className="w-[112px] shrink-0 border-r border-solid border-neutral-fillLow">
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
                        'w-4 text-[11px] tabular-nums',
                        isNewTrack ? 'text-success-onSurface' : 'text-neutral-lowOnSurface'
                      )}
                      title={isNewTrack ? 'New track from the pending AI edit' : undefined}
                    >
                      {isNewTrack ? '+' : index + 1}
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
                                ? 'border-neutral-fillLow bg-neutral-surface2 hover:bg-neutral-surface3'
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
