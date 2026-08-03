import type { LibraryAsset } from '../types';

/**
 * 「My assets」：用户自己上传的素材，会话内存储。
 * Agent 面板的上传入口和素材库面板的「Upload from device」都写到这里，
 * 素材库面板订阅变化实时刷新。接入真实上传接口后替换 addImageToMyAssets 即可。
 */
const uploads: LibraryAsset[] = [
  // 预置的品牌端板（AURAK end card),真实素材在 public/end-card.webp
  { id: 'upload-end-card', name: 'End card', kind: 'image', meta: 'WEBP · 1080×1920', url: '/end-card.webp' }
];

const listeners = new Set<() => void>();
let uploadSeq = 0;

const emit = () => listeners.forEach((listener) => listener());

export const getMyAssets = (): LibraryAsset[] => [...uploads];

export const subscribeMyAssets = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** 本机图片 → My assets 条目;尺寸异步探测出来后再补进 meta。 */
export const addImageToMyAssets = (file: File): LibraryAsset => {
  uploadSeq += 1;
  const ext = (file.name.split('.').pop() ?? 'IMAGE').toUpperCase();
  const asset: LibraryAsset = {
    id: `upload-${uploadSeq}`,
    name: file.name.replace(/\.[^.]+$/, '') || file.name,
    kind: 'image',
    meta: ext,
    url: URL.createObjectURL(file)
  };
  uploads.unshift(asset);
  emit();

  const probe = new Image();
  probe.onload = () => {
    asset.meta = `${ext} · ${probe.naturalWidth}×${probe.naturalHeight}`;
    emit();
  };
  probe.src = asset.url as string;

  return asset;
};
