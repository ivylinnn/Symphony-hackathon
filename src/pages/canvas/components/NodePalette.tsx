import { KsIconSearch } from '@fe-infra/keystone-icons-react';
import { useMemo, useState } from 'react';

import { CATEGORY_LABEL, CATEGORY_ORDER, KINDS_BY_CATEGORY, NODE_KIND_CONFIG } from '../const';
import type { CanvasNodeKind } from '../types';
import { NODE_KIND_ICON } from './nodeIcons';

interface NodePaletteProps {
  onSelect: (kind: CanvasNodeKind) => void;
}

/**
 * 节点面板：工具栏 "+" 和卡片右侧 ⊕ 共用。
 * 顶部带搜索，下面按 Ads-native / Creative / Edit 分组。
 */
function NodePalette({ onSelect }: NodePaletteProps) {
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return CATEGORY_ORDER.map((category) => ({
      category,
      kinds: KINDS_BY_CATEGORY[category].filter(
        (kind) => !keyword || NODE_KIND_CONFIG[kind].label.toLowerCase().includes(keyword)
      )
    })).filter((group) => group.kinds.length > 0);
  }, [query]);

  return (
    <div className="w-[248px] rounded-2xl border border-solid border-neutral-fillLow bg-neutral-surface p-2 shadow-[0_10px_30px_rgba(16,24,40,0.16)]">
      <div className="mb-1 flex items-center gap-2 rounded-lg bg-neutral-surface1 px-2">
        <KsIconSearch size={14} className="shrink-0 text-neutral-lowOnSurface" />
        <input
          value={query}
          placeholder="Search nodes and actions"
          onChange={(event) => setQuery(event.target.value)}
          className="h-8 w-full bg-transparent text-[13px] text-neutral-highOnSurface outline-none placeholder:text-neutral-lowOnSurface"
        />
      </div>

      <div className="max-h-[320px] overflow-y-auto">
        {groups.map((group) => (
          <div key={group.category} className="mb-1 last:mb-0">
            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-lowOnSurface">
              {CATEGORY_LABEL[group.category]}
            </div>
            {group.kinds.map((kind) => (
              <button
                key={kind}
                type="button"
                title={`Add ${NODE_KIND_CONFIG[kind].label} node`}
                onClick={() => onSelect(kind)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] font-medium text-neutral-highOnSurface transition-colors hover:bg-neutral-surface2 active:bg-neutral-surface3"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-neutral-surface2 text-neutral-mediumOnSurface">
                  {NODE_KIND_ICON[kind]}
                </span>
                {NODE_KIND_CONFIG[kind].label}
              </button>
            ))}
          </div>
        ))}

        {groups.length === 0 ? (
          <div className="px-2 py-6 text-center text-[12px] text-neutral-lowOnSurface">No matching nodes</div>
        ) : null}
      </div>
    </div>
  );
}

export default NodePalette;
