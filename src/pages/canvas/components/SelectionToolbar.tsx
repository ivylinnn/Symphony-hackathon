import {
  KsIconCopyContent,
  KsIconDelete,
  KsIconDownload,
  KsIconFilledLock,
  KsIconFolderAdd,
  KsIconFullSelect
} from '@fe-infra/keystone-icons-react';

interface SelectionToolbarProps {
  count: number;
  onSaveAsTemplate: () => void;
  onDuplicate: () => void;
  onSelectAll: () => void;
  onDelete: () => void;
  onClear: () => void;
}

const ICON_SIZE = 15;

function ToolButton({
  children,
  label,
  tone = 'default',
  onClick
}: {
  children: React.ReactNode;
  label: string;
  tone?: 'default' | 'danger';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={
        tone === 'danger'
          ? 'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-error-fillLow transition-colors hover:bg-error-fill/20'
          : 'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-neutral-onFill/90 transition-colors hover:bg-neutral-onFill/15'
      }
    >
      {children}
      {label}
    </button>
  );
}

/**
 * 选中节点后浮在画布顶部的批量操作条，参考 Flora。
 * 没有选中时不渲染。
 */
function SelectionToolbar({
  count,
  onSaveAsTemplate,
  onDuplicate,
  onSelectAll,
  onDelete,
  onClear
}: SelectionToolbarProps) {
  if (count === 0) {
    return null;
  }

  return (
    <div
      className="absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-0.5 rounded-xl bg-neutral-fillHigh px-1.5 py-1 text-neutral-onFill shadow-[0_10px_30px_rgba(16,24,40,0.16)]"
      data-selection-toolbar
    >
      <span className="px-2 text-[12px] font-semibold tabular-nums">{count} selected</span>

      <span className="mx-0.5 h-4 w-px bg-neutral-onFill/20" />

      <ToolButton label="Save as template" onClick={onSaveAsTemplate}>
        <KsIconFolderAdd size={ICON_SIZE} />
      </ToolButton>
      <ToolButton label="Duplicate" onClick={onDuplicate}>
        <KsIconCopyContent size={ICON_SIZE} />
      </ToolButton>
      <ToolButton label="Select all" onClick={onSelectAll}>
        <KsIconFullSelect size={ICON_SIZE} />
      </ToolButton>
      <ToolButton label="Export" onClick={onSaveAsTemplate}>
        <KsIconDownload size={ICON_SIZE} />
      </ToolButton>
      <ToolButton label="Lock" onClick={onClear}>
        <KsIconFilledLock size={ICON_SIZE} />
      </ToolButton>

      <span className="mx-0.5 h-4 w-px bg-neutral-onFill/20" />

      <ToolButton label="Delete" tone="danger" onClick={onDelete}>
        <KsIconDelete size={ICON_SIZE} />
      </ToolButton>
    </div>
  );
}

export default SelectionToolbar;
