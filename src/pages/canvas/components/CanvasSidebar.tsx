import {
  KsIconDelete,
  KsIconFolder,
  KsIconFullScreen,
  KsIconPlus,
  KsIconZoomIn,
  KsIconZoomOut
} from '@fe-infra/keystone-icons-react';
import clsx from 'clsx';
import { useEffect, useRef } from 'react';

import type { CanvasNodeKind, LibraryAsset } from '../types';
import AssetLibraryPanel from './AssetLibraryPanel';
import NodePalette from './NodePalette';

/** 左侧工具栏当前展开的浮层。 */
export type SidebarPanel = 'nodes' | 'library' | null;

/** 画布交互工具：选择（框选节点）/ 手型（拖动画布）/ 评论。 */
export type CanvasTool = 'select' | 'hand' | 'comment';

interface CanvasSidebarProps {
  zoom: number;
  canDelete: boolean;
  tool: CanvasTool;
  openPanel: SidebarPanel;
  onSelectTool: (tool: CanvasTool) => void;
  onTogglePanel: (panel: Exclude<SidebarPanel, null>) => void;
  onClosePanel: () => void;
  onAddNode: (kind: CanvasNodeKind) => void;
  onPickAsset: (asset: LibraryAsset) => void;
  onDeleteSelected: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onResetZoom: () => void;
}

/** 箭头选择工具图标。 */
function CursorIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-[18px]">
      <path
        d="M4 1.8 12.6 9c.4.34.16 1-.37 1l-3.6.06-1.9 3.2c-.27.45-.95.33-1.06-.18L3.2 2.4c-.1-.5.42-.9.8-.6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 手型平移工具图标。 */
function HandIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-[18px]">
      <path
        d="M5.2 7.4V3.6a1 1 0 0 1 2 0v3m0-3.6a1 1 0 0 1 2 0v3.6m0-2.8a1 1 0 0 1 2 0v3.2m0-1.8a1 1 0 0 1 2 0v4.2c0 2.6-1.8 4.6-4.5 4.6-2.2 0-3.3-1-4.4-2.8L2.6 9.1c-.5-.8.5-1.7 1.3-1.2l1.3 1V7.4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 评论工具图标。 */
function CommentIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-[18px]">
      <path
        d="M8 2.2c3.4 0 6 2.2 6 5.1s-2.6 5.1-6 5.1c-.6 0-1.2-.06-1.75-.2L3.2 13.6l.7-2.6C2.7 10.1 2 8.9 2 7.3c0-2.9 2.6-5.1 6-5.1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const ICON_SIZE = 18;

function PillButton({
  children,
  disabled,
  isActive,
  title,
  onClick
}: {
  children: React.ReactNode;
  disabled?: boolean;
  isActive?: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'flex size-10 items-center justify-center rounded-full transition-colors',
        disabled && 'cursor-not-allowed opacity-40',
        !disabled && isActive && 'bg-neutral-onFill/25',
        !disabled && !isActive && 'hover:bg-neutral-onFill/15 active:bg-neutral-onFill/25'
      )}
    >
      {children}
    </button>
  );
}

/**
 * 画布左侧竖向药丸工具栏，占据原侧边导航的位置。
 * 深色 + 全圆角；节点新增收在 "+"，素材库收在文件夹入口。
 */
function CanvasSidebar({
  zoom,
  canDelete,
  tool,
  openPanel,
  onSelectTool,
  onTogglePanel,
  onClosePanel,
  onAddNode,
  onPickAsset,
  onDeleteSelected,
  onZoomIn,
  onZoomOut,
  onFitView,
  onResetZoom
}: CanvasSidebarProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  /* 点击浮层和工具栏之外的区域收起浮层。 */
  useEffect(() => {
    if (!openPanel) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        onClosePanel();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [openPanel, onClosePanel]);

  return (
    <div ref={wrapperRef} className="absolute left-4 top-1/2 z-30 -translate-y-1/2">
      <div className="flex flex-col items-center gap-1 rounded-full bg-neutral-fillHigh p-2 text-neutral-onFill shadow-[0_10px_30px_rgba(16,24,40,0.16)]">
        {/* 主 CTA：新增节点 + 素材库，保持在最顶部 */}
        <button
          type="button"
          title="Add node"
          onClick={() => onTogglePanel('nodes')}
          className={clsx(
            'flex size-10 items-center justify-center rounded-full bg-neutral-onFill text-neutral-fill transition-transform',
            openPanel === 'nodes' && 'rotate-45'
          )}
        >
          <KsIconPlus size={20} />
        </button>

        <PillButton
          title="Add assets from library"
          isActive={openPanel === 'library'}
          onClick={() => onTogglePanel('library')}
        >
          <KsIconFolder size={ICON_SIZE} />
        </PillButton>

        <span className="my-1 h-px w-6 bg-neutral-onFill/20" />

        {/* 交互工具：选择 / 手型 / 评论 */}
        <PillButton title="Select — marquee nodes (V)" isActive={tool === 'select'} onClick={() => onSelectTool('select')}>
          <CursorIcon />
        </PillButton>
        <PillButton title="Hand — drag the canvas (H)" isActive={tool === 'hand'} onClick={() => onSelectTool('hand')}>
          <HandIcon />
        </PillButton>
        <PillButton title="Comment — click the canvas to leave a note (C)" isActive={tool === 'comment'} onClick={() => onSelectTool('comment')}>
          <CommentIcon />
        </PillButton>

        <span className="my-1 h-px w-6 bg-neutral-onFill/20" />

        <PillButton title="Zoom in" onClick={onZoomIn}>
          <KsIconZoomIn size={ICON_SIZE} />
        </PillButton>
        <button
          type="button"
          title="Reset zoom to 100%"
          onClick={onResetZoom}
          className="h-7 w-10 rounded-full text-[10px] font-semibold tabular-nums transition-colors hover:bg-neutral-onFill/15"
        >
          {Math.round(zoom * 100)}%
        </button>
        <PillButton title="Zoom out" onClick={onZoomOut}>
          <KsIconZoomOut size={ICON_SIZE} />
        </PillButton>
        <PillButton title="Fit all nodes to view" onClick={onFitView}>
          <KsIconFullScreen size={ICON_SIZE} />
        </PillButton>

        <span className="my-1 h-px w-6 bg-neutral-onFill/20" />

        <PillButton title="Delete selected node (Backspace)" disabled={!canDelete} onClick={onDeleteSelected}>
          <KsIconDelete size={ICON_SIZE} />
        </PillButton>
      </div>

      {openPanel ? (
        <div className="absolute left-full top-0 ml-3">
          {openPanel === 'nodes' ? <NodePalette onSelect={onAddNode} /> : <AssetLibraryPanel onPick={onPickAsset} />}
        </div>
      ) : null}
    </div>
  );
}

export default CanvasSidebar;
