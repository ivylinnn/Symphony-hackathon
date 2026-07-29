/* eslint-disable max-lines-per-function */
import {
  KsIconClose,
  KsIconCopyContent,
  KsIconCut,
  KsIconDelete,
  KsIconDownload,
  KsIconFolder,
  KsIconFullScreen,
  KsIconRedo,
  KsIconSound,
  KsIconTextFile,
  KsIconUndo
} from '@fe-infra/keystone-icons-react';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';

import { INITIAL_TIMELINE_TRACKS } from '../const';
import type { TimelineTrack } from '../types';

interface TimelineEditorProps {
  /** 编辑对象的名称，展示在 Source 区。 */
  sourceLabel: string;
  onClose: () => void;
}

/** 时间轴每秒占用的像素，缩放滑杆会在此基础上乘系数。 */
const BASE_PX_PER_SECOND = 104;
const RULER_SECONDS = 9;
const PLAYBACK_TICK_MS = 100;

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

/** 右侧属性面板的分组标题。 */
function InspectorSection({
  children,
  title,
  collapsible
}: {
  children?: React.ReactNode;
  title: string;
  collapsible?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(!collapsible);
  return (
    <div className="border-b border-solid border-neutral-fillLow">
      <button
        type="button"
        title={title}
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-[12px] font-semibold text-neutral-highOnSurface"
      >
        {title}
        <span className="text-neutral-lowOnSurface">{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && children ? <div className="px-3 pb-3">{children}</div> : null}
    </div>
  );
}

function NumberField({ label, value }: { label: string; value: string }) {
  return (
    <label className="flex flex-1 items-center gap-2 rounded-lg bg-neutral-surface1 px-2 py-1.5">
      <span className="text-[11px] text-neutral-lowOnSurface">{label}</span>
      <input
        defaultValue={value}
        className="w-full bg-transparent text-right text-[12px] tabular-nums text-neutral-highOnSurface outline-none"
      />
    </label>
  );
}

/**
 * 全屏时间线编辑器，参考 Flora 的 Timeline Editor。
 * 上方预览、下方多轨时间线、右侧属性面板。
 */
function TimelineEditor({ sourceLabel, onClose }: TimelineEditorProps) {
  const [tracks, setTracks] = useState<TimelineTrack[]>(INITIAL_TIMELINE_TRACKS);
  const [selectedClipId, setSelectedClipId] = useState<string | null>('clip-1');
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [activeTool, setActiveTool] = useState<'select' | 'text' | 'media'>('select');
  const rulerRef = useRef<HTMLDivElement>(null);

  const pxPerSecond = BASE_PX_PER_SECOND * zoom;
  const duration = Math.max(
    ...tracks.flatMap((track) => track.clips.map((clip) => clip.start + clip.duration)),
    1
  );

  /* 播放时推进播放头，到片尾自动停。 */
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
        return next;
      });
    }, PLAYBACK_TICK_MS);
    return () => clearInterval(timer);
  }, [duration, isPlaying]);

  /** 点击标尺跳转播放头。 */
  const seekFromPointer = (clientX: number) => {
    const rect = rulerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    setCurrentTime(Math.max(0, Math.min(duration, (clientX - rect.left) / pxPerSecond)));
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

            <div className="flex h-full max-h-[420px] w-[236px] items-center justify-center rounded-xl bg-gradient-to-br from-neutral-surface2 to-primary-surface2">
              <span className="text-[12px] font-medium text-neutral-mediumOnSurface">{sourceLabel}</span>
            </div>
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
                <ToolButton title="Jump to start" onClick={() => setCurrentTime(0)}>
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
                <ToolButton title="Jump to end" onClick={() => setCurrentTime(duration)}>
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
                {tracks.map((track, index) => (
                  <div
                    key={track.id}
                    className="flex h-[72px] items-center gap-1.5 border-b border-solid border-neutral-fillLow px-2"
                  >
                    <span className="w-4 text-[11px] tabular-nums text-neutral-lowOnSurface">{index + 1}</span>
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
                <div style={{ width: RULER_SECONDS * pxPerSecond }}>
                  <div
                    ref={rulerRef}
                    className="relative h-7 cursor-pointer border-b border-solid border-neutral-fillLow"
                    onPointerDown={(event) => seekFromPointer(event.clientX)}
                  >
                    {Array.from({ length: RULER_SECONDS }, (_, second) => (
                      <span
                        key={second}
                        className="absolute top-1.5 text-[10px] tabular-nums text-neutral-lowOnSurface"
                        style={{ left: second * pxPerSecond + 4 }}
                      >
                        00:0{second}
                      </span>
                    ))}
                  </div>

                  {tracks.map((track) => (
                    <div key={track.id} className="relative h-[72px] border-b border-solid border-neutral-fillLow">
                      {track.clips.map((clip) => (
                        <button
                          key={clip.id}
                          type="button"
                          title={clip.label}
                          onClick={() => setSelectedClipId(clip.id)}
                          className={clsx(
                            'absolute top-2 flex h-[56px] flex-col overflow-hidden rounded-md border text-left transition-colors',
                            selectedClipId === clip.id
                              ? 'border-primary-fill bg-primary-surface2'
                              : 'border-neutral-fillLow bg-neutral-surface2 hover:bg-neutral-surface3',
                            !track.visible && 'opacity-40'
                          )}
                          style={{ left: clip.start * pxPerSecond, width: Math.max(24, clip.duration * pxPerSecond) }}
                        >
                          <span className="truncate px-1.5 pt-1 text-[10px] font-medium text-neutral-highOnSurface">
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

        {/* 右侧属性面板 */}
        <aside className="flex w-[280px] shrink-0 flex-col overflow-y-auto border-l border-solid border-neutral-fillLow bg-neutral-surface">
          <div className="flex items-center gap-2 border-b border-solid border-neutral-fillLow px-3 py-2.5">
            <span className="flex-1 text-[12px] font-semibold text-neutral-highOnSurface">Timeline Editor</span>
          </div>

          <div className="flex items-center gap-1 border-b border-solid border-neutral-fillLow px-2 py-1.5">
            <ToolButton
              title="Select tool"
              isActive={activeTool === 'select'}
              onClick={() => setActiveTool('select')}
            >
              ▷
            </ToolButton>
            <ToolButton title="Text tool" isActive={activeTool === 'text'} onClick={() => setActiveTool('text')}>
              <KsIconTextFile size={15} />
            </ToolButton>
            <ToolButton title="Media tool" isActive={activeTool === 'media'} onClick={() => setActiveTool('media')}>
              <KsIconFolder size={15} />
            </ToolButton>
            <span className="mx-1 h-4 w-px bg-neutral-fillLow" />
            <ToolButton title="Undo">
              <KsIconUndo size={15} />
            </ToolButton>
            <ToolButton title="Redo">
              <KsIconRedo size={15} />
            </ToolButton>
            <span className="flex-1" />
            <ToolButton title="Fit to view">
              <KsIconFullScreen size={15} />
            </ToolButton>
          </div>

          <InspectorSection title="Source">
            <div className="text-[12px] text-neutral-highOnSurface">{sourceLabel}</div>
            <div className="mt-1 text-[11px] tabular-nums text-neutral-lowOnSurface">{formatTime(duration)}</div>
          </InspectorSection>

          <InspectorSection title="Layout">
            <div className="flex gap-2">
              <NumberField label="W" value="1080" />
              <NumberField label="H" value="1920" />
            </div>
            <div className="mt-2 flex gap-2">
              <NumberField label="X" value="0" />
              <NumberField label="Y" value="0" />
            </div>
            <div className="mt-2 flex gap-2">
              <NumberField label="Rotation" value="0°" />
            </div>
          </InspectorSection>

          <InspectorSection title="Fill">
            <label className="flex items-center gap-2">
              <span className="text-[11px] text-neutral-lowOnSurface">Opacity</span>
              <input type="range" min={0} max={100} defaultValue={100} className="flex-1 accent-primary-fill" />
            </label>
          </InspectorSection>

          <InspectorSection title="Crop" collapsible />
          <InspectorSection title="Video" collapsible />
          <InspectorSection title="Audio" collapsible />
        </aside>
      </div>
    </div>
  );
}

export default TimelineEditor;
