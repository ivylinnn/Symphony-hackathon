import {
  KsIconAiGeneration,
  KsIconChevronDown,
  KsIconCopyContent,
  KsIconDelete,
  KsIconDownload,
  KsIconExpand,
  KsIconFilledLock,
  KsIconToolbox
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
