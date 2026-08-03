import { KsIconSearch, KsIconUpload } from '@fe-infra/keystone-icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { LIBRARY_ASSETS } from '../const';
import { addImageToMyAssets, getMyAssets, subscribeMyAssets } from '../services/my-assets';
import { fetchLibraryAssets } from '../services/node-runner';
import type { LibraryAsset } from '../types';
import { NODE_KIND_ICON } from './nodeIcons';

interface AssetLibraryPanelProps {
  onPick: (asset: LibraryAsset) => void;
}

/** 单条素材：有真实图片地址时用缩略图，否则退回节点类型图标。 */
function AssetRow({ asset, onPick }: { asset: LibraryAsset; onPick: (asset: LibraryAsset) => void }) {
  return (
    <button
      type="button"
      title={`Add ${asset.name} to canvas`}
      onClick={() => onPick(asset)}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-neutral-surface2 active:bg-neutral-surface3"
    >
      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-neutral-surface2 text-neutral-mediumOnSurface">
        {asset.kind === 'image' && asset.url ? (
          <img src={asset.url} alt={asset.name} className="size-full object-cover" draggable={false} />
        ) : (
          NODE_KIND_ICON[asset.kind]
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-neutral-highOnSurface">{asset.name}</span>
        <span className="block truncate text-[11px] text-neutral-lowOnSurface">{asset.meta}</span>
      </span>
    </button>
  );
}

/**
 * 「从素材库添加」面板，挂在左侧工具栏的素材库入口上。
 * 「My assets」是用户上传的素材（services/my-assets),下方是平台素材库；
 * 平台素材目前用 LIBRARY_ASSETS 示例数据，接入真实素材库接口后只需替换数据源。
 */
function AssetLibraryPanel({ onPick }: AssetLibraryPanelProps) {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<LibraryAsset[]>(LIBRARY_ASSETS);
  const [mine, setMine] = useState<LibraryAsset[]>(getMyAssets);
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* 用户上传随时可能发生（比如从 Agent 输入框),订阅保持同步。 */
  useEffect(() => subscribeMyAssets(() => setMine(getMyAssets())), []);

  /* 拉真实素材库；接口不可用时保留示例数据，面板不至于空着。 */
  useEffect(() => {
    let cancelled = false;
    fetchLibraryAssets()
      .then((list) => {
        if (!cancelled && list.length > 0) {
          setSource(list);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const keyword = query.trim().toLowerCase();
  const matches = (asset: LibraryAsset) => !keyword || asset.name.toLowerCase().includes(keyword);
  const myAssets = useMemo(() => mine.filter(matches), [keyword, mine]);
  const assets = useMemo(() => source.filter(matches), [keyword, source]);

  const handleFiles = (files: FileList | null) => {
    if (!files) {
      return;
    }
    [...files].forEach((file) => addImageToMyAssets(file));
  };

  return (
    <div className="w-[280px] rounded-2xl border border-solid border-neutral-fillLow bg-neutral-surface p-2 shadow-[0_10px_30px_rgba(16,24,40,0.16)]">
      <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-lowOnSurface">
        Add from library
      </div>

      <div className="mb-1 flex items-center gap-2 rounded-lg bg-neutral-surface1 px-2">
        <KsIconSearch size={14} className="shrink-0 text-neutral-lowOnSurface" />
        <input
          value={query}
          placeholder="Search assets"
          onChange={(event) => setQuery(event.target.value)}
          className="h-8 w-full bg-transparent text-[13px] text-neutral-highOnSurface outline-none placeholder:text-neutral-lowOnSurface"
        />
      </div>

      <div className="max-h-[300px] overflow-y-auto">
        {myAssets.length > 0 ? (
          <>
            <div className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-lowOnSurface">
              My assets
            </div>
            {myAssets.map((asset) => (
              <AssetRow key={asset.id} asset={asset} onPick={onPick} />
            ))}
            <div className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-lowOnSurface">
              Library
            </div>
          </>
        ) : null}

        {assets.map((asset) => (
          <AssetRow key={asset.id} asset={asset} onPick={onPick} />
        ))}

        {assets.length === 0 && myAssets.length === 0 ? (
          <div className="px-2 py-6 text-center text-[12px] text-neutral-lowOnSurface">
            {isLoading ? 'Loading assets…' : 'No matching assets'}
          </div>
        ) : null}
      </div>

      <div className="mt-1 border-t border-solid border-neutral-fillLow pt-1">
        <button
          type="button"
          title="Upload from this device"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] font-medium text-neutral-highOnSurface transition-colors hover:bg-neutral-surface2"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-neutral-surface2 text-neutral-mediumOnSurface">
            <KsIconUpload size={14} />
          </span>
          Upload from device
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

export default AssetLibraryPanel;
