import {
  KsIconAiGeneration,
  KsIconArrowRight,
  KsIconCamera,
  KsIconChevronDown,
  KsIconCopyContent,
  KsIconCut,
  KsIconDelete,
  KsIconDownload,
  KsIconExpand,
  KsIconFilledLock,
  KsIconFullScreen,
  KsIconHd,
  KsIconImageCollection,
  KsIconPen,
  KsIconPeople,
  KsIconRotate,
  KsIconSeperateAudio,
  KsIconSound,
  KsIconSpeed,
  KsIconTextFile,
  KsIconTips,
  KsIconToolbox,
  KsIconUndo,
  KsIconVideoClip
} from '@fe-infra/keystone-icons-react';
import clsx from 'clsx';
import { useState } from 'react';

import type { EditNodeKind } from '../types';

interface NodeHoverToolbarProps {
  /** Tools 菜单里选中的编辑动作，会在下游新建对应的 Edit 节点。 */
  onRunTool: (kind: EditNodeKind) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** Tools 下拉里的编辑动作，前两项落到真实的 Edit 节点。 */
const TOOL_ACTIONS: Array<{ label: string; kind?: EditNodeKind }> = [
  { label: 'Split A/V', kind: 'split-av' },
  { label: 'Split Audio Tracks', kind: 'split-tracks' },
  { label: 'Upscale' },
  { label: 'Extract frame' },
  { label: 'Remove background' },
  { label: 'Add subtitles' },
  { label: 'Stitch videos' },
  { label: 'Color grade' }
];

const ICON_SIZE = 14;

function IconButton({
  children,
  title,
  onClick
}: {
  children: React.ReactNode;
  title: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-md text-neutral-onFill/80 transition-colors hover:bg-neutral-onFill/15 hover:text-neutral-onFill"
    >
      {children}
    </button>
  );
}

/**
 * 悬浮在节点卡片正上方的操作条，参考 Flora。
 * 只在 hover / 选中时出现，深色药丸压在画布之上。
 */
function NodeHoverToolbar({ onRunTool, onDuplicate, onDelete }: NodeHoverToolbarProps) {
  const [isToolsOpen, setIsToolsOpen] = useState(false);

  return (
    <div
      className="absolute bottom-full left-0 z-30 mb-2"
      // 操作条不参与画布平移，也不触发卡片拖拽
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-0.5 rounded-xl bg-neutral-fillHigh px-1.5 py-1 text-neutral-onFill shadow-[0_10px_30px_rgba(16,24,40,0.16)]">
        <button
          type="button"
          title="Auto — let the agent choose settings"
          className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-neutral-onFill/90 transition-colors hover:bg-neutral-onFill/15"
        >
          <KsIconAiGeneration size={ICON_SIZE} />
          Auto
          <KsIconChevronDown size={12} />
        </button>

        <button
          type="button"
          title="Tools"
          onClick={() => setIsToolsOpen((open) => !open)}
          className={clsx(
            'flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium transition-colors',
            isToolsOpen ? 'bg-neutral-onFill/20 text-neutral-onFill' : 'text-neutral-onFill/90 hover:bg-neutral-onFill/15'
          )}
        >
          <KsIconToolbox size={ICON_SIZE} />
          Tools
          <KsIconChevronDown size={12} />
        </button>

        <span className="mx-0.5 h-4 w-px bg-neutral-onFill/20" />

        <IconButton title="Lock node">
          <KsIconFilledLock size={ICON_SIZE} />
        </IconButton>
        <IconButton title="Duplicate node" onClick={onDuplicate}>
          <KsIconCopyContent size={ICON_SIZE} />
        </IconButton>
        <IconButton title="Download output">
          <KsIconDownload size={ICON_SIZE} />
        </IconButton>
        <IconButton title="Open full screen">
          <KsIconExpand size={ICON_SIZE} />
        </IconButton>
        <IconButton title="Delete node" onClick={onDelete}>
          <KsIconDelete size={ICON_SIZE} />
        </IconButton>
      </div>

      {isToolsOpen ? (
        <div className="absolute left-0 top-full mt-1 w-[208px] rounded-xl border border-solid border-neutral-fillLow bg-neutral-surface p-1 shadow-[0_10px_30px_rgba(16,24,40,0.16)]">
          {TOOL_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              title={action.label}
              disabled={!action.kind}
              onClick={() => {
                if (action.kind) {
                  onRunTool(action.kind);
                }
                setIsToolsOpen(false);
              }}
              className={clsx(
                'flex w-full items-center rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors',
                action.kind
                  ? 'text-neutral-highOnSurface hover:bg-neutral-surface2'
                  : 'cursor-not-allowed text-neutral-lowOnSurface'
              )}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default NodeHoverToolbar;

interface VideoHoverToolbarProps {
  /** 抽帧：抓当前画面存成 PNG。 */
  onExtractFrame: () => void;
  /** 高清：切换画质增强滤镜。 */
  onToggleEnhance: () => void;
  isEnhanced: boolean;
  /** 音频分离：走真实的 Split A/V 编辑节点。 */
  onSeparateAudio: () => void;
  /** 旋转：卡片内视频转 90°。 */
  onRotate: () => void;
  onOpenEditor: () => void;
  /** 打开剪辑器并把一条指令直接交给编辑 agent。 */
  onEditorPrompt: (prompt: string) => void;
  /** 打开剪辑器并直接进入圈选（Draw to edit）模式。 */
  onEditorDraw: () => void;
  onDownload: () => void;
  onFullscreen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/**
 * 视频卡片专属的悬浮操作条（剪映风格，文案已译成英文）。
 * 画布上能就地完成的（抽帧/高清/旋转/下载/全屏/音频分离）直接执行，
 * 需要剪辑能力的动作则带着对应指令跳进全屏编辑器。
 */
export function VideoHoverToolbar({
  onExtractFrame,
  onToggleEnhance,
  isEnhanced,
  onSeparateAudio,
  onRotate,
  onOpenEditor,
  onEditorPrompt,
  onEditorDraw,
  onDownload,
  onFullscreen,
  onDuplicate,
  onDelete
}: VideoHoverToolbarProps) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const mainActions: Array<{
    label: string;
    hint: string;
    icon: React.ReactNode;
    active?: boolean;
    onClick: () => void;
  }> = [
    { label: 'AI fix', hint: 'Let the agent clean up the cut', icon: <KsIconAiGeneration size={ICON_SIZE} />, onClick: () => onEditorPrompt('Fix the issues in this cut') },
    { label: 'Modify', hint: 'Circle an area and describe the change', icon: <KsIconPen size={ICON_SIZE} />, onClick: onEditorDraw },
    { label: 'Swap product', hint: 'Replace the product shown in the shot', icon: <KsIconImageCollection size={ICON_SIZE} />, onClick: () => onEditorPrompt('Swap the product in this shot') },
    { label: 'Character', hint: 'Change who appears in the cut', icon: <KsIconPeople size={ICON_SIZE} />, onClick: () => onEditorPrompt('Change the character in this cut') },
    { label: 'Extend', hint: 'Make the cut run longer', icon: <KsIconArrowRight size={ICON_SIZE} />, onClick: () => onEditorPrompt('Extend the cut to 20 seconds') },
    { label: 'Caption', hint: 'Add or rewrite the on-screen captions', icon: <KsIconTextFile size={ICON_SIZE} />, onClick: () => onEditorPrompt('Add captions to this cut') },
    { label: 'Camera control', hint: 'Change the camera move', icon: <KsIconVideoClip size={ICON_SIZE} />, onClick: () => onEditorPrompt('Add a slow push-in camera move') },
    { label: 'Lighting', hint: 'Relight the scene', icon: <KsIconTips size={ICON_SIZE} />, onClick: () => onEditorPrompt('Relight the scene with warm golden-hour light') },
    { label: 'Audio', hint: 'Adjust the audio mix', icon: <KsIconSound size={ICON_SIZE} />, onClick: () => onEditorPrompt('Adjust the audio mix') }
  ];

  /* 画布上能就地完成的那几个（抽帧/高清/旋转/音频分离）收进 ⋯，主条留给 AI 编辑动作。 */
  const moreActions: Array<{ label: string; icon: React.ReactNode; onClick: () => void }> = [
    { label: 'Open in editor', icon: <KsIconCut size={13} />, onClick: onOpenEditor },
    { label: 'Extract frame', icon: <KsIconCamera size={13} />, onClick: onExtractFrame },
    { label: isEnhanced ? 'Enhance · on' : 'Enhance', icon: <KsIconHd size={13} />, onClick: onToggleEnhance },
    { label: 'Rotate', icon: <KsIconRotate size={13} />, onClick: onRotate },
    { label: 'Separate audio', icon: <KsIconSeperateAudio size={13} />, onClick: onSeparateAudio },
    { label: 'Reverse', icon: <KsIconUndo size={13} />, onClick: () => onEditorPrompt('Play the cut in reverse') },
    { label: 'Speed', icon: <KsIconSpeed size={13} />, onClick: () => onEditorPrompt('Speed up the whole cut') }
  ];

  return (
    <div
      className="absolute bottom-full left-0 z-30 mb-2"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-0.5 whitespace-nowrap rounded-xl bg-neutral-fillHigh px-1.5 py-1 text-neutral-onFill shadow-[0_10px_30px_rgba(16,24,40,0.16)]">
        {mainActions.map((action) => (
          <button
            key={action.label}
            type="button"
            title={action.hint}
            onClick={action.onClick}
            className={clsx(
              'flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-colors',
              action.active
                ? 'bg-neutral-onFill/20 text-neutral-onFill'
                : 'text-neutral-onFill/90 hover:bg-neutral-onFill/15'
            )}
          >
            {action.icon}
            {action.label}
          </button>
        ))}

        <button
          type="button"
          title="More"
          onClick={() => setIsMoreOpen((open) => !open)}
          className={clsx(
            'flex h-7 items-center rounded-md px-1.5 text-[13px] font-semibold transition-colors',
            isMoreOpen ? 'bg-neutral-onFill/20 text-neutral-onFill' : 'text-neutral-onFill/90 hover:bg-neutral-onFill/15'
          )}
        >
          ⋯
        </button>

        <span className="mx-0.5 h-4 w-px bg-neutral-onFill/20" />

        <IconButton title="Download video" onClick={onDownload}>
          <KsIconDownload size={ICON_SIZE} />
        </IconButton>
        <IconButton title="Full screen" onClick={onFullscreen}>
          <KsIconFullScreen size={ICON_SIZE} />
        </IconButton>
      </div>

      {isMoreOpen ? (
        <div className="absolute right-0 top-full mt-1 w-[196px] rounded-xl border border-solid border-neutral-fillLow bg-neutral-surface p-1 shadow-[0_10px_30px_rgba(16,24,40,0.16)]">
          {moreActions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => {
                action.onClick();
                setIsMoreOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-neutral-highOnSurface transition-colors hover:bg-neutral-surface2"
            >
              <span className="text-neutral-mediumOnSurface">{action.icon}</span>
              {action.label}
            </button>
          ))}
          <div className="my-1 h-px bg-neutral-fillLow" />
          <button
            type="button"
            onClick={() => {
              onDuplicate();
              setIsMoreOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-neutral-highOnSurface transition-colors hover:bg-neutral-surface2"
          >
            <span className="text-neutral-mediumOnSurface"><KsIconCopyContent size={13} /></span>
            Duplicate node
          </button>
          <button
            type="button"
            onClick={() => {
              onDelete();
              setIsMoreOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-error-fill transition-colors hover:bg-neutral-surface2"
          >
            <span><KsIconDelete size={13} /></span>
            Delete node
          </button>
        </div>
      ) : null}
    </div>
  );
}
