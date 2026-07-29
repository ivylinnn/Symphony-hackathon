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

interface CanvasSidebarProps {
  zoom: number;
  canDelete: boolean;
  openPanel: SidebarPanel;
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
  openPanel,
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
