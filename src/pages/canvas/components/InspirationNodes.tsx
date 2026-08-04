import { KsIconAiGeneration, KsIconFolder, KsIconPlus, KsIconSound, KsIconUpload } from '@fe-infra/keystone-icons-react';
import clsx from 'clsx';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { LIBRARY_ASSETS } from '../const';
import type { CanvasNode } from '../types';

/* ------------------------------------------------------------------ */
/* 共用件                                                              */
/* ------------------------------------------------------------------ */

/**
 * 卡片内的滚动区域。
 * wheel 必须在原生捕获阶段拦下来，否则画布容器的 passive:false 监听会把
 * 滚动劫持成平移；pointerdown 也要拦住，避免拖滚动条变成拖卡片。
 */
export function ScrollArea({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const stopWheel = (event: WheelEvent) => event.stopPropagation();
    element.addEventListener('wheel', stopWheel);
    return () => element.removeEventListener('wheel', stopWheel);
  }, []);

  return (
    <div
      ref={ref}
      className={clsx('overflow-y-auto overscroll-contain', className)}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}

/** 字段标签，与 Product brief 截图的排版一致。 */
function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-0.5 mt-2 text-[9px] font-semibold uppercase tracking-wide text-neutral-lowOnSurface first:mt-0">
      {children}
    </div>
  );
}

const svgDataUri = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

/* ------------------------------------------------------------------ */
/* Product images（版式对齐 Image input 参考：标题副行 + 虚线格 + 计数） */
/* ------------------------------------------------------------------ */

/** 产品图上限：本机上传或素材库挑选共用同一个池子。 */
const MAX_PRODUCT_IMAGES = 20;

interface ProductImage {
  id: string;
  name: string;
  /** 真实图片地址；素材库示例条目没有，用渐变占位。 */
  url?: string;
}

/** 短袖连帽衫产品图，来自用户提供的素材。 */
const INITIAL_PRODUCT_IMAGES: ProductImage[] = [
  { id: 'hoodie-back', name: 'Back view', url: '/hoodie-back.webp' },
  { id: 'hoodie-front', name: 'Front view', url: '/hoodie-front.webp' },
  { id: 'hoodie-pocket', name: 'Pocket detail', url: '/hoodie-pocket.webp' }
];

let productImageSeq = 0;

/** Product images 节点：最多 20 张产品图，支持本机上传或素材库挑选。 */
export function ProductImagesBody() {
  const [images, setImages] = useState<ProductImage[]>(INITIAL_PRODUCT_IMAGES);
  const [picker, setPicker] = useState<'closed' | 'menu' | 'library'>('closed');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const remaining = MAX_PRODUCT_IMAGES - images.length;

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }
    setImages((current) => [
      ...current,
      ...[...files].slice(0, MAX_PRODUCT_IMAGES - current.length).map((file) => {
        productImageSeq += 1;
        return { id: `upload-${productImageSeq}`, name: file.name, url: URL.createObjectURL(file) };
      })
    ]);
    setPicker('closed');
  };

  return (
    <div onPointerDown={(event) => event.stopPropagation()}>
      <div className="mb-1.5 text-[10px] text-neutral-lowOnSurface">1 image or a batch of {MAX_PRODUCT_IMAGES}</div>

      <ScrollArea className="max-h-[122px]">
        <div className="grid grid-cols-4 gap-1.5">
          {images.map((image) => (
            <div
              key={image.id}
              title={image.name}
              className="aspect-square overflow-hidden rounded-lg border border-solid border-neutral-fillLow bg-neutral-surface1"
            >
              {image.url ? (
                <img src={image.url} alt={image.name} className="size-full object-cover" draggable={false} />
              ) : (
                <div className="size-full bg-gradient-to-br from-primary-surface2 to-neutral-surface2" />
              )}
            </div>
          ))}
          {remaining > 0 ? (
            <button
              type="button"
              title="Add product images"
              onClick={() => setPicker((current) => (current === 'closed' ? 'menu' : 'closed'))}
              className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-neutral-fillLow text-neutral-lowOnSurface transition-colors hover:border-primary-fill hover:text-primary-fill"
            >
              <KsIconPlus size={16} />
            </button>
          ) : null}
        </div>
      </ScrollArea>

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

      {picker === 'menu' ? (
        <div className="mt-1.5 flex gap-1.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-7 flex-1 items-center justify-center gap-1 rounded-lg bg-neutral-surface2 text-[11px] font-medium text-neutral-highOnSurface transition-colors hover:bg-neutral-surface3"
          >
            <KsIconUpload size={12} />
            From computer
          </button>
          <button
            type="button"
            onClick={() => setPicker('library')}
            className="flex h-7 flex-1 items-center justify-center gap-1 rounded-lg bg-neutral-surface2 text-[11px] font-medium text-neutral-highOnSurface transition-colors hover:bg-neutral-surface3"
          >
            <KsIconFolder size={12} />
            From library
          </button>
        </div>
      ) : null}

      {picker === 'library' ? (
        <div className="mt-1.5 max-h-[84px] overflow-y-auto rounded-lg border border-solid border-neutral-fillLow bg-neutral-surface p-1">
          {LIBRARY_ASSETS.filter((asset) => asset.kind === 'image').map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => {
                productImageSeq += 1;
                setImages((current) =>
                  current.length < MAX_PRODUCT_IMAGES
                    ? [...current, { id: `library-${productImageSeq}`, name: asset.name }]
                    : current
                );
                setPicker('closed');
              }}
              className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] text-neutral-highOnSurface transition-colors hover:bg-neutral-surface2"
            >
              <span className="size-4 shrink-0 rounded-sm bg-gradient-to-br from-primary-surface2 to-neutral-surface2" />
              <span className="truncate">{asset.name}</span>
              <span className="ml-auto shrink-0 text-[9px] text-neutral-lowOnSurface">{asset.meta}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-1.5 text-[10px] text-neutral-lowOnSurface">
        {images.length}/{MAX_PRODUCT_IMAGES} · from computer or asset library
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Brand kit                                                           */
/* ------------------------------------------------------------------ */

const BRAND_COLORS = ['#26262a', '#e8e9ec', '#2f6bff', '#ff5a1f'];

interface BrandAsset {
  id: string;
  name: string;
  /** 本地上传的文件会带 objectURL 缩略图；素材库条目没有。 */
  url?: string;
}

let brandAssetSeq = 0;

/** Brand kit 节点：支持本机上传或从素材库挑选品牌素材。 */
export function BrandKitBody() {
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addAssets = (added: BrandAsset[]) => {
    setAssets((current) => [...current, ...added]);
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }
    addAssets(
      [...files].map((file) => {
        brandAssetSeq += 1;
        return {
          id: `upload-${brandAssetSeq}`,
          name: file.name,
          url: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
        };
      })
    );
  };

  return (
    <div onPointerDown={(event) => event.stopPropagation()}>
      {/* 品牌基调：logo、色板、字体 */}
      <div className="flex items-center gap-2">
        <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded-lg bg-neutral-fillHigh text-[10px] font-bold tracking-[3px] text-neutral-onFill">
          AURAK
        </span>
        <div className="flex-1">
          <div className="flex gap-1">
            {BRAND_COLORS.map((color) => (
              <span
                key={color}
                title={color}
                className="size-4 rounded-full border border-solid border-neutral-fillLow"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <div className="mt-1 text-[10px] text-neutral-lowOnSurface">Inter · Bold / Medium</div>
        </div>
      </div>

      {/* 已挑选的品牌素材 */}
      <div className="mt-2 min-h-[56px] rounded-lg bg-neutral-surface1 p-1.5">
        {assets.length === 0 ? (
          <p className="px-1 py-2 text-[10px] leading-[14px] text-neutral-lowOnSurface">
            No extra assets yet — upload a logo pack or pick from the library.
          </p>
        ) : (
          assets.map((asset) => (
            <div key={asset.id} className="flex items-center gap-1.5 rounded-md px-1 py-0.5">
              {asset.url ? (
                <img src={asset.url} alt="" className="size-5 shrink-0 rounded-sm object-cover" draggable={false} />
              ) : (
                <span className="size-5 shrink-0 rounded-sm bg-gradient-to-br from-primary-surface2 to-neutral-surface2" />
              )}
              <span className="truncate text-[11px] text-neutral-mediumOnSurface">{asset.name}</span>
            </div>
          ))
        )}
      </div>

      {/* 入口：本机上传 / 素材库 */}
      <div className="mt-2 flex gap-1.5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-7 flex-1 items-center justify-center gap-1 rounded-lg bg-neutral-surface2 text-[11px] font-medium text-neutral-highOnSurface transition-colors hover:bg-neutral-surface3"
        >
          <KsIconUpload size={12} />
          Upload
        </button>
        <button
          type="button"
          onClick={() => setIsLibraryOpen((open) => !open)}
          className={clsx(
            'flex h-7 flex-1 items-center justify-center gap-1 rounded-lg text-[11px] font-medium transition-colors',
            isLibraryOpen
              ? 'bg-primary-surface2 text-primary-onSurface'
              : 'bg-neutral-surface2 text-neutral-highOnSurface hover:bg-neutral-surface3'
          )}
        >
          <KsIconFolder size={12} />
          Library
        </button>
      </div>

      {isLibraryOpen ? (
        <div className="mt-1.5 max-h-[88px] overflow-y-auto rounded-lg border border-solid border-neutral-fillLow bg-neutral-surface p-1">
          {LIBRARY_ASSETS.filter((asset) => asset.kind === 'image' || asset.kind === 'video').map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => {
                brandAssetSeq += 1;
                addAssets([{ id: `library-${brandAssetSeq}`, name: asset.name }]);
                setIsLibraryOpen(false);
              }}
              className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] text-neutral-highOnSurface transition-colors hover:bg-neutral-surface2"
            >
              <span className="size-4 shrink-0 rounded-sm bg-gradient-to-br from-primary-surface2 to-neutral-surface2" />
              <span className="truncate">{asset.name}</span>
              <span className="ml-auto shrink-0 text-[9px] text-neutral-lowOnSurface">{asset.meta}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Product brief（内容对齐用户提供的截图）                              */
/* ------------------------------------------------------------------ */

/** Additional requests 里的 @Image 引用小胶囊。 */
function ImageMention({ image, index }: { image: ProductImage; index: number }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-primary-surface2 px-1.5 py-px align-middle text-[10px] font-medium text-primary-onSurface">
      {image.url ? <img src={image.url} alt="" className="size-3 rounded-sm object-cover" draggable={false} /> : null}
      @Image {index + 1}
    </span>
  );
}

export function ProductBriefBody({ heightClass = 'h-full' }: { heightClass?: string } = {}) {
  return (
    <ScrollArea className={clsx(heightClass, 'pr-1')}>
      <FieldLabel>Product name</FieldLabel>
      <div className="rounded-lg bg-neutral-surface1 p-2">
        <div className="mb-1.5 flex gap-1.5">
          {INITIAL_PRODUCT_IMAGES.map((image) => (
            <img
              key={image.id}
              src={image.url}
              alt={image.name}
              title={image.name}
              className="size-10 rounded-md border border-solid border-neutral-fillLow object-cover"
              draggable={false}
            />
          ))}
        </div>
        <div className="text-[12px] text-neutral-highOnSurface">Short-Sleeve Hoodie</div>
      </div>

      <FieldLabel>Product description</FieldLabel>
      <div className="rounded-lg bg-neutral-surface1 px-2 py-1.5 text-[11px] leading-[15px] text-neutral-mediumOnSurface">
        <p>
          This versatile, modern short-sleeve hoodie is perfect for warm-weather layering, gym wear, or casual
          lounging. Featuring a breathable construction, a comfortable hood, and a functional front kangaroo pocket,
          it offers a relaxed fit for active lifestyles. Simply pull it over your head for an easy, stylish
          transition into any seasonal outfit.
        </p>
        <p className="mt-1.5">
          Core selling point: Breathable fabric, Versatile layering, Functional kangaroo pocket, Relaxed comfortable
          fit, Ideal for active and everyday wear
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-2">
        <div>
          <FieldLabel>Brand name</FieldLabel>
          <div className="rounded-lg bg-neutral-surface1 px-2 py-1.5 text-[12px] text-neutral-highOnSurface">N/A</div>
        </div>
        <div>
          <FieldLabel>Region</FieldLabel>
          <div className="rounded-lg bg-neutral-surface1 px-2 py-1.5 text-[12px] text-neutral-highOnSurface">
            United States
          </div>
        </div>
        <div>
          <FieldLabel>Language</FieldLabel>
          <div className="rounded-lg bg-neutral-surface1 px-2 py-1.5 text-[12px] text-neutral-highOnSurface">
            English
          </div>
        </div>
        <div>
          <FieldLabel>Brand tone</FieldLabel>
          <div className="rounded-lg bg-neutral-surface1 px-2 py-1.5 text-[11px] italic text-neutral-lowOnSurface">
            Tell us via chat (optional).
          </div>
        </div>
      </div>

      <FieldLabel>Target audience</FieldLabel>
      <div className="rounded-lg bg-neutral-surface1 px-2 py-1.5 text-[11px] leading-[15px] text-neutral-mediumOnSurface">
        Active individuals and fashion-conscious consumers looking for comfortable, modern casual wear.
      </div>

      <FieldLabel>Additional requests</FieldLabel>
      <div className="rounded-lg bg-neutral-surface1 p-2">
        <div className="mb-1.5 flex gap-1.5">
          {INITIAL_PRODUCT_IMAGES.map((image, index) => (
            <div key={image.id} className="relative overflow-hidden rounded-md" title={image.name}>
              <img
                src={image.url}
                alt={image.name}
                className="size-10 border border-solid border-neutral-fillLow object-cover"
                draggable={false}
              />
              <span className="absolute inset-x-0 bottom-0 bg-neutral-fillHigh/70 text-center text-[7px] font-medium text-neutral-onFill">
                Image {index + 1}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[11px] leading-[17px] text-neutral-mediumOnSurface">
          Create an ad for the product using media assets <ImageMention image={INITIAL_PRODUCT_IMAGES[0]} index={0} />
          , <ImageMention image={INITIAL_PRODUCT_IMAGES[1]} index={1} />,{' '}
          <ImageMention image={INITIAL_PRODUCT_IMAGES[2]} index={2} /> inspired by template ID 7653898416390045703.
        </p>
      </div>
    </ScrollArea>
  );
}

/* ------------------------------------------------------------------ */
/* TikTok trend（真实 Top Ads 趋势 + 换趋势弹窗）                       */
/* ------------------------------------------------------------------ */

export interface TrendSpec {
  id: string;
  title: string;
  brand: string;
  duration: string;
  industry: string;
  region: string;
  /** Top ads insights 的表现数据。 */
  performance: { views: string; ctr: string; engagement: string; viewThrough: string };
  /** 时间轴分析结论（如 CTR 峰值出现在第几秒）。 */
  insight: string;
  description: string;
  /** 可播放的真实趋势视频；没有时用渐变占位。 */
  videoUrl?: string;
  /** 缩略图底色（CSS 渐变），视频加载前/缺省时显示。 */
  background: string;
}

/** Top Ads 趋势库；默认选中录屏里的 tracksuit 趋势（Velvet Amsterdam）。 */
export const TIKTOK_TRENDS: TrendSpec[] = [
  {
    id: 'matching-tracksuits',
    title: 'matching tracksuits with the day one',
    brand: 'Velvet Amsterdam',
    duration: '00:13',
    industry: 'Apparel & accessories',
    region: 'France, Greece, Switzerland, Czech Republic, Portugal, Austria, Sweden, Finland, Denmark, Italy, United Kingdom…',
    performance: { views: '3.8M', ctr: 'Top 9%', engagement: '0.64%', viewThrough: 'Top 21%' },
    insight: 'Top 9% of the industry average. CTR peaks at 13s.',
    description:
      'A streetwear-focused trend showcasing coordinated outfits between two friends using rhythmic movement and urban backdrops.',
    videoUrl: '/tracksuit-trend.mp4',
    background: 'linear-gradient(160deg,#5a4a3a 0%,#32281e 55%,#1d1712 100%)'
  },
  {
    id: 'garlic-paste',
    title: 'Garlic Paste Ad',
    brand: 'Don Quijote PB',
    duration: '00:06',
    industry: 'Food & Cooking',
    region: 'Japan, United States',
    performance: { views: '2.4M', ctr: 'Top 12%', engagement: '0.51%', viewThrough: 'Top 18%' },
    insight: 'CTR spikes in the first 2s on the chore-relief hook.',
    description:
      'Names a universally hated kitchen chore and promises instant relief while the frustration is still on screen.',
    videoUrl: '/garlic-paste-ad.mp4',
    background: 'linear-gradient(160deg,#4a3527 0%,#2c1f15 55%,#1e1610 100%)'
  },
  {
    id: 'desk-makeover',
    title: 'Desk Makeover ASMR',
    brand: 'Nordic Supply Co.',
    duration: '00:14',
    industry: 'Home & Office',
    region: 'United States, Canada, United Kingdom',
    performance: { views: '1.9M', ctr: 'Top 15%', engagement: '0.47%', viewThrough: 'Top 24%' },
    insight: 'View-through carried by the before/after reveal at 9s.',
    description: 'Opens on the cluttered before-state so the transformation carries the product.',
    background: 'linear-gradient(160deg,#3e4a54 0%,#242c33 55%,#161b1f 100%)'
  },
  {
    id: 'closet-restock',
    title: 'Closet Restock',
    brand: 'Arket Studio',
    duration: '00:09',
    industry: 'Fashion',
    region: 'United Kingdom, Ireland, Netherlands',
    performance: { views: '2.7M', ctr: 'Top 11%', engagement: '0.58%', viewThrough: 'Top 19%' },
    insight: 'Engagement clusters on the outfit-swap beat-matched cuts.',
    description: 'Confesses a relatable habit, then reframes it as intentional capsule style.',
    background: 'linear-gradient(160deg,#3a3650 0%,#252238 55%,#171523 100%)'
  }
];

/** 趋势缩略：有真实视频时直接播放，否则渐变占位 + 标题。 */
function TrendThumb({ trend, compact }: { trend: TrendSpec; compact?: boolean }) {
  return (
    <div
      className={clsx('relative shrink-0 overflow-hidden rounded-lg', compact ? 'h-20 w-full' : 'h-[168px] w-[96px]')}
      style={{ background: trend.background }}
    >
      {trend.videoUrl ? (
        <video
          src={trend.videoUrl}
          muted
          playsInline
          loop
          controls={!compact}
          preload="metadata"
          onPointerDown={(event) => event.stopPropagation()}
          className="size-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-1 text-center">
          <span className="text-[9px] font-bold tracking-wide text-neutral-onFill/90">{trend.title}</span>
          <span className="mt-0.5 text-[7px] text-neutral-onFill/60">{trend.brand}</span>
        </div>
      )}
      <span className="pointer-events-none absolute left-1 top-1 rounded bg-neutral-fillHigh/80 px-1 py-px text-[8px] font-semibold tabular-nums text-neutral-onFill">
        {trend.duration}
      </span>
    </div>
  );
}

/** CTR 时间轴小曲线，形态对齐 Top ads insights 的分析图。 */
function CtrSparkline() {
  return (
    <svg viewBox="0 0 120 28" className="h-7 w-full">
      <path
        d="M2 26 C 8 12, 14 10, 24 11 S 44 15, 54 13 S 74 9, 84 11 S 102 14, 108 10 L 118 3"
        fill="none"
        strokeWidth={1.5}
        className="stroke-primary-fill"
      />
    </svg>
  );
}

/** 生成一条仅用于弹窗陈列的简版趋势（可选中，数据合理但无真实视频）。 */
const makeLibraryTrend = (
  id: string,
  title: string,
  brand: string,
  views: string,
  duration: string,
  industry: string,
  background: string
): TrendSpec => ({
  id,
  title,
  brand,
  duration,
  industry,
  region: 'United States, United Kingdom, Canada',
  performance: { views, ctr: 'Top 15%', engagement: '0.52%', viewThrough: 'Top 22%' },
  insight: 'CTR builds steadily and peaks on the closing beat.',
  description: `${title} — a proven ${industry.toLowerCase()} structure from Top Ads.`,
  background
});

/** Top ads 库：真实趋势 + 陈列位。 */
const TREND_LIBRARY: TrendSpec[] = [
  makeLibraryTrend(
    'lib-mukbang-bowl',
    "One more bite before it's gone",
    'Mukbang creator',
    '44.6M',
    '01:29',
    'Food & Beverage',
    'linear-gradient(160deg,#6b4a2a,#2c1c10)'
  ),
  ...TIKTOK_TRENDS,
  makeLibraryTrend('lib-milk', 'Slow pour ASMR', 'Oat&Co', '40.5M', '00:09', 'Food & Beverage', 'linear-gradient(160deg,#5b7d8a,#1d3038)'),
  makeLibraryTrend('lib-coffee', 'Handoff iced latte', 'Daily Drip', '27.1M', '00:11', 'Food & Beverage', 'linear-gradient(160deg,#7a6a4a,#2c2416)'),
  makeLibraryTrend('lib-podcast', 'Creator talks numbers', 'Bright', '473.1M', '00:34', 'Finance', 'linear-gradient(160deg,#3f4145,#141517)'),
  makeLibraryTrend('lib-travel', '67 hour travel day', 'Opodo Prime', '76.5M', '00:57', 'Travel', 'linear-gradient(160deg,#4a5a7a,#161c2c)'),
  makeLibraryTrend('lib-credit', 'Get approved today', 'Bright', '64.7M', '00:05', 'Finance', 'linear-gradient(160deg,#2f5a3e,#0f2416)'),
  makeLibraryTrend('lib-bridge', "What's going on?", 'IHG Hotels', '13.9M', '00:15', 'Travel', 'linear-gradient(160deg,#527a8a,#15262c)'),
  makeLibraryTrend('lib-mosaic', 'Pebble mosaic build', 'Craftly', '33M', '00:15', 'Home & Garden', 'linear-gradient(160deg,#6a6a5a,#22221a)'),
  makeLibraryTrend('lib-couch', 'Sofa or bed?', 'Loungely', '130.6M', '00:07', 'Furniture', 'linear-gradient(160deg,#7a5a4a,#2c1e16)')
];

/** Templates 库：同样可选，选中后按趋势规格落到节点上。 */
const TEMPLATE_LIBRARY: TrendSpec[] = [
  makeLibraryTrend('tpl-viral-1', 'Hook-first viral cut', 'Symphony', '00:15 template', '00:15', 'Viral ads', 'linear-gradient(160deg,#3a3650,#171523)'),
  makeLibraryTrend('tpl-life-1', 'Morning routine beat', 'Symphony', '00:15 template', '00:15', 'Lifestyle', 'linear-gradient(160deg,#4a5568,#1a202c)'),
  makeLibraryTrend('tpl-prod-1', 'Hero pack shot spin', 'Symphony', '00:15 template', '00:15', 'Product-only', 'linear-gradient(160deg,#6b5b8a,#2a2340)'),
  makeLibraryTrend('tpl-higgs', 'Higgsfield x Symphony', 'Symphony', '00:15 template', '00:15', 'Visual styles', 'linear-gradient(160deg,#26262a,#0e0e10)'),
  makeLibraryTrend('tpl-life-2', 'Golden hour lookbook', 'Symphony', '00:15 template', '00:15', 'Lifestyle', 'linear-gradient(160deg,#7a4a3a,#301b14)'),
  makeLibraryTrend('tpl-viral-2', 'Duet reaction frame', 'Symphony', '00:15 template', '00:15', 'Viral ads', 'linear-gradient(160deg,#2f5a5e,#12262a)'),
  makeLibraryTrend('tpl-prod-2', 'Unbox to reveal', 'Symphony', '00:15 template', '00:15', 'Product-only', 'linear-gradient(160deg,#5a4326,#211810)'),
  makeLibraryTrend('tpl-visual', '90s editorial grade', 'Symphony', '00:15 template', '00:15', 'Visual styles', 'linear-gradient(160deg,#2c2440,#141020)')
];

/** 弹窗卡片高度节奏，仿 Top ads 瀑布流。 */
const MODAL_CARD_RATIOS = ['aspect-[9/16]', 'aspect-[4/5]', 'aspect-[5/7]'];

function TrendLibraryCard({
  trend,
  index,
  isActive,
  badge,
  onPick
}: {
  trend: TrendSpec;
  index: number;
  isActive: boolean;
  badge: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={clsx(
        'relative mb-3 block w-full break-inside-avoid overflow-hidden rounded-xl text-left transition-transform hover:-translate-y-0.5',
        MODAL_CARD_RATIOS[index % MODAL_CARD_RATIOS.length],
        isActive && 'ring-2 ring-primary-fill'
      )}
      style={{ background: trend.background }}
    >
      {trend.videoUrl ? (
        <video
          src={trend.videoUrl}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={(event) => {
            event.currentTarget.currentTime = 1.2;
          }}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <span className="absolute inset-x-2 bottom-8 text-[11px] font-semibold leading-[14px] text-neutral-onFill/85">
          {trend.title}
        </span>
      )}
      <span className="absolute left-2 top-2 rounded-full bg-neutral-fillHigh/70 px-2 py-0.5 text-[10px] font-medium text-neutral-onFill">
        {badge}
      </span>
      <span className="absolute bottom-2 left-2 rounded bg-neutral-fillHigh/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-neutral-onFill">
        {trend.duration}
      </span>
    </button>
  );
}

/** 圆圈问号，标签后的说明符号。 */
function HelpDot() {
  return (
    <span className="ml-1 inline-flex size-3.5 items-center justify-center rounded-full border border-solid border-neutral-fillLow text-[9px] text-neutral-lowOnSurface">
      ?
    </span>
  );
}

/**
 * Select a trend 弹窗：Top ads / Templates 两个库 + 筛选行。
 * portal 到 body，避免被画布 transform 锚定。
 */
export function TrendModal({
  activeId,
  onPick,
  onClose
}: {
  activeId: string;
  onPick: (trend: TrendSpec) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'top-ads' | 'templates'>('top-ads');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const library = tab === 'top-ads' ? TREND_LIBRARY : TEMPLATE_LIBRARY;
  const keyword = query.trim().toLowerCase();
  const cards = keyword ? library.filter((trend) => trend.title.toLowerCase().includes(keyword)) : library;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-neutral-fillHigh/40" onPointerDown={onClose} />
      <div className="relative flex h-[84vh] w-[1180px] max-w-[95vw] flex-col overflow-hidden rounded-2xl bg-neutral-surface shadow-[0_24px_80px_rgba(16,24,40,0.24)]">
        <div className="flex items-center justify-between px-6 pt-5">
          <h2 className="text-[18px] font-semibold text-neutral-highOnSurface">Select a trend</h2>
          <button
            type="button"
            title="Close"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full text-neutral-mediumOnSurface transition-colors hover:bg-neutral-surface2"
          >
            ✕
          </button>
        </div>

        {/* Top ads / Templates 页签 */}
        <div className="mt-2 flex gap-6 border-b border-solid border-neutral-fillLow px-6">
          {(
            [
              ['top-ads', 'Top ads'],
              ['templates', 'Templates']
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={clsx(
                'flex items-center border-b-2 border-solid pb-2 text-[14px] transition-colors',
                tab === id
                  ? 'border-primary-fill font-semibold text-neutral-highOnSurface'
                  : 'border-transparent text-neutral-lowOnSurface hover:text-neutral-mediumOnSurface'
              )}
            >
              {label}
              <HelpDot />
            </button>
          ))}
        </div>

        {/* 筛选行 */}
        <div className="flex items-center gap-3 px-6 py-4">
          <div className="flex h-10 w-[260px] items-center gap-2 rounded-full border border-solid border-neutral-fillLow px-3">
            <span className="text-neutral-lowOnSurface">⌕</span>
            <input
              value={query}
              placeholder="Product"
              onChange={(event) => setQuery(event.target.value)}
              className="w-full bg-transparent text-[13px] text-neutral-highOnSurface outline-none placeholder:text-neutral-lowOnSurface"
            />
          </div>
          {['Industry', 'Region', 'Objective'].map((filter) => (
            <button
              key={filter}
              type="button"
              className="flex h-10 items-center justify-between gap-8 rounded-full border border-solid border-neutral-fillLow px-4 text-[13px] text-neutral-mediumOnSurface transition-colors hover:bg-neutral-surface1"
            >
              {filter}
              <span className="text-[10px]">▾</span>
            </button>
          ))}
        </div>

        {/* 瀑布流卡片库 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          <div className="columns-5 gap-3">
            {cards.map((trend, index) => (
              <TrendLibraryCard
                key={trend.id}
                trend={trend}
                index={index}
                isActive={trend.id === activeId}
                badge={tab === 'top-ads' ? `${trend.performance.views} views` : trend.industry}
                onPick={() => {
                  onPick(trend);
                  onClose();
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** TikTok trend 节点：展示被复刻的真实趋势，可打开弹窗换一条。 */
export function TikTokTrendBody({ initialTrendId }: { initialTrendId?: string } = {}) {
  // 没有预设趋势时从空态开始，等用户主动挑选
  const [trend, setTrend] = useState<TrendSpec | null>(
    () => TREND_LIBRARY.find((item) => item.id === initialTrendId) ?? null
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!trend) {
    return (
      <div onPointerDown={(event) => event.stopPropagation()}>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-fillLow bg-neutral-surface1 text-neutral-lowOnSurface transition-colors hover:border-primary-fill hover:text-primary-fill"
        >
          <KsIconAiGeneration size={20} />
          <span className="text-[12px] font-medium">Select a trend</span>
          <span className="max-w-[80%] text-center text-[10px] leading-[13px] text-neutral-lowOnSurface">
            Pick a Top Ad or template to replicate
          </span>
        </button>

        {isModalOpen ? (
          <TrendModal
            activeId=""
            onPick={(picked) => setTrend(picked)}
            onClose={() => setIsModalOpen(false)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div onPointerDown={(event) => event.stopPropagation()}>
      <div className="flex gap-2">
        <TrendThumb trend={trend} />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold leading-[15px] text-neutral-highOnSurface">{trend.title}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            <span className="rounded-full bg-neutral-surface2 px-1.5 py-0.5 text-[9px] font-medium text-neutral-mediumOnSurface">
              {trend.industry}
            </span>
            <span className="rounded-full bg-neutral-surface2 px-1.5 py-0.5 text-[9px] font-medium text-neutral-mediumOnSurface">
              {trend.brand}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-[9px] leading-[13px] text-neutral-lowOnSurface" title={trend.region}>
            {trend.region}
          </p>
          <div className="mt-1.5 rounded-lg bg-neutral-surface1 p-1.5">
            <div className="text-[8px] font-semibold uppercase tracking-wide text-neutral-lowOnSurface">
              Description
            </div>
            <p className="mt-0.5 text-[10px] leading-[14px] text-neutral-mediumOnSurface">{trend.description}</p>
          </div>
        </div>
      </div>

      <div className="mt-2 text-[9px] font-semibold uppercase tracking-wide text-neutral-lowOnSurface">Performance</div>
      <div className="mt-1 grid grid-cols-2 gap-1.5">
        {(
          [
            ['Video views', trend.performance.views],
            ['CTR', trend.performance.ctr],
            ['Engagement rate', trend.performance.engagement],
            ['6s view-through', trend.performance.viewThrough]
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-lg border border-solid border-neutral-fillLow px-1.5 py-1">
            <div className="text-[8px] font-semibold uppercase tracking-wide text-neutral-lowOnSurface">{label}</div>
            <div className="text-[12px] font-semibold text-neutral-highOnSurface">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-wide text-neutral-lowOnSurface">
          Interactive time analysis
        </span>
        <span className="text-[9px] text-neutral-lowOnSurface">CTR</span>
      </div>
      <div className="mt-1 rounded-lg border border-solid border-neutral-fillLow px-1.5 pb-1 pt-1.5">
        <CtrSparkline />
        <p className="mt-0.5 text-[9px] leading-[13px] text-neutral-mediumOnSurface">{trend.insight}</p>
      </div>

      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="mt-2 flex h-7 w-full items-center justify-center rounded-lg bg-neutral-surface2 text-[11px] font-medium text-neutral-highOnSurface transition-colors hover:bg-neutral-surface3"
      >
        Change trend
      </button>

      {isModalOpen ? (
        <TrendModal activeId={trend.id} onPick={setTrend} onClose={() => setIsModalOpen(false)} />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Storyboard（内容来自录屏：AURAK 四镜分镜 + 旁白）                    */
/* ------------------------------------------------------------------ */

interface StoryboardFrame {
  id: string;
  title: string;
  description: string;
  /** 镜头调度说明。 */
  action: string;
  voiceover: string;
  /** 生成该帧用的图像提示词。 */
  prompt: string;
  /** 分镜草图。 */
  image?: string;
  /** 本地录制的旁白音频（objectURL）。 */
  recordingUrl?: string;
}

const INITIAL_FRAMES: StoryboardFrame[] = [
  {
    id: 'frame-1',
    title: 'Backstreet Push-Off',
    description:
      'A young male skater in a dark short-sleeve hoodie pushes fast through a sun-drenched LA alley. Fisheye angle captures the cracked ground and fence. Hoodie fabric snaps in the wind, showing the hood and kangaroo pocket clearly.',
    action:
      'Skater pushes hard down alley. Dramatic lighting. Wide fisheye view captures cracked pavement and chain-link fence. Hoodie and kangaroo pocket visible.',
    voiceover: '“Upgrade your daily”',
    prompt:
      'Monochrome storyboard sketch, low-fidelity pencil sketch style, wide fisheye lens view of a young male skateboarder pushing fast down an alley, cracked concrete, chain-link fence, short-sleeve hoodie, dramatic sunlight, clean storyboarding lines, white background with text box at the bottom --ar 16:9',
    image: '/sb-frame-1.png'
  },
  {
    id: 'frame-2',
    title: 'Kickflip Sparks',
    description:
      'Skater launches a kickflip over a curb. Sparks erupt from the board, and a neon trail follows the movement. The hoodie construction, hem, and cuffs remain fully visible during the jump.',
    action: 'Kickflip over curb.',
    voiceover: '“style with this”',
    prompt:
      'Storyboarding sketch panel, black and white pencil drawing, skater mid-air performing a kickflip over a street curb, stylized speed lines and sparks beneath the board, detailed short-sleeve hoodie folds, low-fidelity sketch aesthetics --ar 16:9',
    image: '/sb-frame-2.png'
  },
  {
    id: 'frame-3',
    title: 'Fence Grind',
    description:
      'Skater grinds a low metal rail by a chain-link fence. Metal sparks fly; neon streaks skim the rail. The hoodie sleeve and collar flutter, highlighting the relaxed construction against the urban backdrop.',
    action:
      'Skater grinds metal rail. Hoodie fabric flutters. Sparks fly. Urban background. Fence in backdrop.',
    voiceover: '“versatile hoodie layer”',
    prompt:
      'Hand-drawn storyboard frame, low-fidelity charcoal sketch, close action shot of a skateboard grinding a metal handrail along a fence, sparks flying, relaxed fit short-sleeve hoodie fluttering, urban backdrop --ar 16:9',
    image: '/sb-frame-3.png'
  },
  {
    id: 'frame-4',
    title: 'Detail Motion',
    description:
      'Close tracking shot passes a mural. Camera focuses on the kangaroo pocket and hood stitching. Skater ollies off a sidewalk edge; a neon streak outlines the shoulders and sleeves briefly.',
    action:
      'Close-up tracking shot. Focus is sharp on the hoodie details and muscular torso as the skater maneuvers through the alley. Background graffiti and fences are an absolute blur. Emphasis on textile texture and action.',
    voiceover: '“built for comfort”',
    prompt:
      'Hand-drawn storyboard frame, low-fidelity charcoal sketch, close action shot of a skateboard grinding a metal handrail along a fence, sparks flying, relaxed fit short-sleeve hoodie fluttering, urban backdrop --ar 16:9',
    image: '/sb-frame-4.png'
  },
  {
    id: 'frame-5',
    title: 'Wall Ride Flare',
    description:
      'Skater performs a wall ride on a stucco wall. Golden sunlight flares through palm shadows. Sparks scatter, and a bright neon trail follows the board path beneath the relaxed-fit hoodie.',
    action: 'Skater high on concrete wall. Gritty action. Palm shadows. Motion lines.',
    voiceover: '“and everyday action.”',
    prompt:
      'Low-fi storyboard panel illustration, pencil and ink sketch, skater doing a wall ride on a concrete wall, palm leaf shadows, motion streaks, loose relaxed fit short-sleeve hoodie --ar 16:9',
    image: '/sb-frame-5.png'
  },
  {
    id: 'frame-6',
    title: 'Final Lookbook',
    description:
      'Skater rolls toward camera and glances back. A neon trail fades over the pavement. The shot holds like a premium 90s editorial cover, showing the full hoodie construction clearly.',
    action:
      'Low-angle, tracking shot. Focus is soft but clear. Sunset colors saturate the frame. Skater is still. Holds look to camera. Fades to logo.',
    voiceover: '“Grab your hoodie today.”',
    prompt:
      '90s editorial style storyboard frame, sketch drawing of a cool male skater holding a skateboard looking back at the camera, wearing a stylish short-sleeve hoodie, sun set lighting, clean outline illustration --ar 16:9',
    image: '/sb-frame-6.png'
  }
];

/** 分镜格里的可编辑文本域；随内容自适应高度，不吃画布拖拽。 */
function FrameTextarea({
  value,
  italic,
  mono,
  bold,
  onChange
}: {
  value: string;
  italic?: boolean;
  mono?: boolean;
  bold?: boolean;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  /* 高度跟着内容走，分镜格里不出现内部滚动条。 */
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [value, mono, bold]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      spellCheck={false}
      onPointerDown={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.value)}
      className={clsx(
        'w-full resize-none overflow-hidden rounded bg-transparent text-[10px] leading-[14px] text-neutral-mediumOnSurface outline-none transition-colors placeholder:text-neutral-lowOnSurface hover:bg-neutral-surface2/60 focus:bg-neutral-surface2',
        italic && 'italic',
        mono && 'font-mono text-[9px] leading-[13px]',
        bold && 'text-[11px] font-semibold text-neutral-highOnSurface'
      )}
    />
  );
}

/** 带标签的分镜字段。 */
function FrameField({
  label,
  value,
  italic,
  mono,
  bold,
  onChange
}: {
  label: string;
  value: string;
  italic?: boolean;
  mono?: boolean;
  bold?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <>
      <div className="mt-1.5 text-[8px] font-semibold uppercase tracking-wide text-neutral-lowOnSurface">{label}</div>
      <FrameTextarea value={value} italic={italic} mono={mono} bold={bold} onChange={onChange} />
    </>
  );
}

let frameSeq = INITIAL_FRAMES.length;

/** Storyboard 节点：分镜 + 旁白 + 描述，支持拖拽排序、追加分镜和逐帧录音。 */

/** 生成中的旋转光晕：conic-gradient 背景在遮罩下只露出一圈边框，靠 transform 旋转，不依赖 @property 插值。 */
function GeneratingGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute animate-[spin_2.2s_linear_infinite]"
      style={{
        inset: '-50%',
        background:
          'conic-gradient(from 0deg, transparent 0deg, transparent 260deg, rgba(255,255,255,0.95) 300deg, transparent 340deg)'
      }}
    />
  );
}

/**
 * 空态 → 生成中 → 落满 6 帧，三段状态全部由 node.storyboardReady / node.status 驱动，
 * 不在组件内部另存一份 phase —— 这样不管是这里的输入框触发，还是卡片通用的运行按钮触发，
 * 结局都保证是同一条路径、同一个「落满 6 帧」的 outcome，不会半路撞上「没接后端」的报错。
 */
export function StoryboardBody({
  node,
  onGenerate
}: {
  node: CanvasNode;
  /** 触发生成；text 有值时先把它存成节点文案。 */
  onGenerate: (nodeId: string, text?: string) => void;
}) {
  const [draft, setDraft] = useState(node.text ?? '');
  const isGenerating = node.status === 'generating' && !node.storyboardReady;

  if (!node.storyboardReady) {
    return (
      <div onPointerDown={(event) => event.stopPropagation()}>
        <div className="relative overflow-hidden rounded-xl p-[2px]">
          {isGenerating ? <GeneratingGlow /> : null}
          <div className="relative flex aspect-video w-full flex-col items-center justify-center gap-1.5 rounded-[10px] bg-neutral-fillHigh px-4 text-center">
            {isGenerating ? (
              <>
                <span className="size-5 animate-spin rounded-full border-2 border-solid border-neutral-onFill/25 border-t-neutral-onFill" />
                <span className="text-[11px] font-medium text-neutral-onFill">Generating storyboard…</span>
              </>
            ) : (
              <button
                type="button"
                title="Generate storyboard"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => onGenerate(node.id, draft.trim() || undefined)}
                className="flex flex-col items-center gap-1.5"
              >
                <span className="text-neutral-onFill/70 transition-colors hover:text-neutral-onFill">
                  <KsIconAiGeneration size={20} />
                </span>
                <span className="text-[11px] font-medium leading-[15px] text-neutral-onFill/85">
                  Describe the ad below to generate a storyboard
                </span>
              </button>
            )}
          </div>
        </div>

        <div className="mt-2 rounded-lg border border-solid border-neutral-fillLow bg-neutral-surface1 px-2 py-1.5">
          <input
            value={draft}
            disabled={isGenerating}
            placeholder={isGenerating ? 'Generating…' : 'Describe the ad, then press Enter…'}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (draft.trim()) {
                  onGenerate(node.id, draft.trim());
                }
              }
            }}
            className="w-full bg-transparent text-[12px] text-neutral-highOnSurface outline-none placeholder:text-neutral-lowOnSurface disabled:cursor-not-allowed"
          />
        </div>
      </div>
    );
  }

  return <StoryboardReadyBody />;
}

/** 落满 6 帧后的完整分镜：拖拽排序、逐帧录音、可编辑字段。 */
function StoryboardReadyBody() {
  const [frames, setFrames] = useState<StoryboardFrame[]>(INITIAL_FRAMES);
  /** 正在录音的分镜 id；同一时间只允许录一条。 */
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  /** 拖拽排序状态：被拖的下标 + 当前悬停的下标。 */
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const reorderFrames = (from: number, to: number) => {
    if (from === to) {
      return;
    }
    setFrames((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  /* 卸载时兜底停掉麦克风。 */
  useEffect(
    () => () => {
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    },
    []
  );

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecordingId(null);
  };

  const startRecording = async (frameId: string) => {
    setRecordError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => chunksRef.current.push(event.data);
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setFrames((current) =>
          current.map((frame) => (frame.id === frameId ? { ...frame, recordingUrl: url } : frame))
        );
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecordingId(frameId);
    } catch {
      setRecordError('Microphone unavailable — check browser permission.');
    }
  };

  const addFrame = () => {
    frameSeq += 1;
    setFrames((current) => [
      ...current,
      {
        id: `frame-${frameSeq}`,
        title: 'New frame',
        description: 'Describe the shot — framing, subject, motion…',
        action: 'Describe the camera move and staging…',
        voiceover: '“…”',
        prompt: 'Storyboard sketch, low-fidelity pencil style… --ar 16:9'
      }
    ]);
  };

  const patchFrame = (id: string, patch: Partial<StoryboardFrame>) => {
    setFrames((current) => current.map((frame) => (frame.id === id ? { ...frame, ...patch } : frame)));
  };

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[10px] text-neutral-lowOnSurface">Scene-by-scene plan · {frames.length} frames</span>
        <span className="text-[9px] text-neutral-lowOnSurface">Click any field to edit</span>
      </div>

      {/* 2 行 × 3 格 */}
      <div>
        <div className="grid grid-cols-3 gap-2">
          {frames.map((frame, index) => {
            const isRecording = recordingId === frame.id;
            return (
              <div
                key={frame.id}
                // 原生拖拽排序：整格可拖，松手落到悬停位置。
                // pointerdown 必须拦在这里，否则会冒泡到卡片触发「拖动节点」并抢走指针捕获，
                // 原生 dragstart 就永远不会发生。
                draggable
                onPointerDown={(event) => event.stopPropagation()}
                onDragStart={(event) => {
                  setDragIndex(index);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOverIndex(index);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragIndex !== null) {
                    reorderFrames(dragIndex, index);
                  }
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                className={clsx(
                  'flex flex-col rounded-xl bg-neutral-surface1 p-2 transition-shadow',
                  dragIndex === index && 'opacity-50',
                  overIndex === index && dragIndex !== null && dragIndex !== index && 'ring-2 ring-primary-fill'
                )}
              >
                {/* 分镜草图 */}
                <div className="aspect-video w-full overflow-hidden rounded-lg bg-neutral-surface2">
                  {frame.image ? (
                    <img src={frame.image} alt={frame.title} className="size-full object-cover" draggable={false} />
                  ) : (
                    <div className="flex size-full items-center justify-center text-[10px] text-neutral-lowOnSurface">
                      No sketch yet
                    </div>
                  )}
                </div>

                <div className="mt-1.5 flex items-center gap-1">
                  <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary-surface2 text-[9px] font-semibold text-primary-onSurface">
                    {index + 1}
                  </span>
                  <span className="text-[8px] font-semibold uppercase tracking-wide text-neutral-lowOnSurface">
                    Frame {index + 1}
                  </span>
                </div>

                <FrameField label="Title" value={frame.title} bold onChange={(v) => patchFrame(frame.id, { title: v })} />
                <FrameField
                  label="Description"
                  value={frame.description}
                  onChange={(v) => patchFrame(frame.id, { description: v })}
                />
                <FrameField label="Action" value={frame.action} onChange={(v) => patchFrame(frame.id, { action: v })} />

                <div className="mt-1.5 flex items-center gap-1">
                  <span className="text-[8px] font-semibold uppercase tracking-wide text-neutral-lowOnSurface">
                    Voiceover
                  </span>
                  <button
                    type="button"
                    title={isRecording ? 'Stop recording' : 'Record this voiceover'}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => (isRecording ? stopRecording() : startRecording(frame.id))}
                    className={clsx(
                      'ml-auto flex h-4 shrink-0 items-center gap-1 rounded-full px-1.5 text-[8px] font-semibold transition-colors',
                      isRecording
                        ? 'bg-error-fill text-neutral-onFill'
                        : 'bg-neutral-surface2 text-neutral-mediumOnSurface hover:bg-neutral-surface3'
                    )}
                  >
                    <span
                      className={clsx(
                        'block size-1.5 rounded-full',
                        isRecording ? 'animate-pulse bg-neutral-onFill' : 'bg-error-fill'
                      )}
                    />
                    {isRecording ? 'Stop' : frame.recordingUrl ? 'Re-rec' : 'Rec'}
                  </button>
                </div>
                <FrameTextarea
                  value={frame.voiceover}
                  italic
                  onChange={(v) => patchFrame(frame.id, { voiceover: v })}
                />
                {frame.recordingUrl ? <audio src={frame.recordingUrl} controls className="mt-1 h-6 w-full" /> : null}

                <FrameField
                  label="Prompt"
                  value={frame.prompt}
                  mono
                  onChange={(v) => patchFrame(frame.id, { prompt: v })}
                />

                {/* 每格独立的重新生成入口 */}
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    // eslint-disable-next-line no-console
                    console.info('[canvas] regenerate storyboard frame', { id: frame.id, prompt: frame.prompt });
                  }}
                  className="mt-2 flex h-7 w-full shrink-0 items-center justify-center gap-1 rounded-lg bg-neutral-fillHigh text-[11px] font-semibold text-neutral-onFill transition-opacity hover:opacity-90"
                >
                  <KsIconAiGeneration size={12} />
                  Generate
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {recordError ? <div className="mt-1 text-[9px] text-error-fill">{recordError}</div> : null}
      <div
        className="mt-2 flex items-center justify-between border-t border-solid border-neutral-fillLow pt-1.5"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={addFrame}
          className="text-[11px] font-medium text-neutral-mediumOnSurface transition-colors hover:text-primary-onSurface"
        >
          + Add frame
        </button>
        <button
          type="button"
          onClick={() => {
            // eslint-disable-next-line no-console
            console.info('[canvas] storyboard redraft requested');
          }}
          className="text-[11px] font-medium text-neutral-mediumOnSurface transition-colors hover:text-primary-onSurface"
        >
          Redraft all
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Audio Clips Generation（版式对齐 Flora 的音频节点）                   */
/* ------------------------------------------------------------------ */

/** 静态波形柱高，中间密两侧疏，观感对齐 Flora。 */
const AUDIO_WAVEFORM = [
  10, 22, 34, 18, 42, 26, 12, 30, 48, 20, 36, 14, 28, 44, 16, 32, 24, 40, 12, 26,
  50, 18, 34, 22, 44, 14, 30, 38, 20, 46, 24, 12, 36, 28, 16, 42, 22, 32, 14, 26
];

const AUDIO_CLIP_DURATION = 20;

/** Audio Clips Generation 节点：按分镜旁白生成 6 段配音，可试听。 */
interface AudioTrackClip {
  id: string;
  /** 轨道上的短标（F1…F6 / BGM）。 */
  label: string;
  /** 旁白台词或曲目名，作为 tooltip 与替换后的显示名。 */
  caption: string;
  /** 用户上传或从素材库换入的音频。 */
  url?: string;
  sourceName?: string;
}

const buildVoiceClips = (): AudioTrackClip[] =>
  INITIAL_FRAMES.map((frame, index) => ({
    id: `vo-${frame.id}`,
    label: `F${index + 1}`,
    caption: frame.voiceover
  }));

let audioUploadSeq = 0;

/**
 * Audio Clips Generation 节点。
 * 上轨是逐帧旁白（可拖拽换位、可替换音源），下轨是背景音乐；
 * 两条轨都支持本机上传或从素材库换入。
 */
export function AudioClipsBody() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [voClips, setVoClips] = useState<AudioTrackClip[]>(buildVoiceClips);
  const [bgm, setBgm] = useState<AudioTrackClip | null>({
    id: 'bgm-1',
    label: 'BGM',
    caption: 'Brand BGM — upbeat'
  });
  /** 当前打开换音菜单的 clip；'bgm' 表示背景音乐轨。 */
  const [picker, setPicker] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  /** 等待接收上传的目标 clip。 */
  const pendingTargetRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* 试听为演示态：走一个 0:20 的假进度，播完自动归位。 */
  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    const timer = window.setInterval(() => {
      setElapsed((current) => {
        if (current >= AUDIO_CLIP_DURATION) {
          setIsPlaying(false);
          return 0;
        }
        return current + 0.5;
      });
    }, 500);
    return () => window.clearInterval(timer);
  }, [isPlaying]);

  const formatTime = (seconds: number) => `0:${String(Math.floor(seconds)).padStart(2, '0')}`;
  const progress = Math.min(1, elapsed / AUDIO_CLIP_DURATION);

  /** 把音源写回目标 clip：'bgm' 走背景轨，其余按 id 匹配旁白轨。 */
  const applySource = (targetId: string, source: { url?: string; sourceName: string }) => {
    if (targetId === 'bgm') {
      setBgm((current) => ({
        id: current?.id ?? 'bgm-1',
        label: 'BGM',
        caption: source.sourceName,
        url: source.url,
        sourceName: source.sourceName
      }));
      return;
    }
    setVoClips((current) =>
      current.map((clip) =>
        clip.id === targetId ? { ...clip, url: source.url, sourceName: source.sourceName } : clip
      )
    );
  };

  const openUpload = (targetId: string) => {
    pendingTargetRef.current = targetId;
    fileInputRef.current?.click();
    setPicker(null);
  };

  const handleFile = (files: FileList | null) => {
    const target = pendingTargetRef.current;
    const file = files?.[0];
    if (!target || !file) {
      return;
    }
    audioUploadSeq += 1;
    applySource(target, { url: URL.createObjectURL(file), sourceName: file.name });
    pendingTargetRef.current = null;
  };

  const reorderClips = (from: number, to: number) => {
    if (from === to) {
      return;
    }
    setVoClips((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  /** 换音菜单：本机上传 / 素材库。 */
  const renderPicker = (targetId: string) => (
    <div className="absolute left-0 top-full z-30 mt-1 w-[190px] rounded-lg border border-solid border-neutral-fillLow bg-neutral-surface p-1 shadow-[0_10px_30px_rgba(16,24,40,0.16)]">
      <button
        type="button"
        onClick={() => openUpload(targetId)}
        className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] text-neutral-highOnSurface transition-colors hover:bg-neutral-surface2"
      >
        <KsIconUpload size={12} />
        Upload from computer
      </button>
      <div className="mt-1 border-t border-solid border-neutral-fillLow pt-1">
        {LIBRARY_ASSETS.filter((asset) => asset.kind === 'audio').map((asset) => (
          <button
            key={asset.id}
            type="button"
            onClick={() => {
              applySource(targetId, { sourceName: asset.name });
              setPicker(null);
            }}
            className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] text-neutral-highOnSurface transition-colors hover:bg-neutral-surface2"
          >
            <KsIconFolder size={12} />
            <span className="truncate">{asset.name}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div onPointerDown={(event) => event.stopPropagation()}>
      <div className="flex items-baseline justify-between text-[10px] text-neutral-lowOnSurface">
        <span>ElevenLabs Multilingual v2</span>
        <span>Rachel</span>
      </div>

      <p className="mt-1.5 text-[11px] font-medium text-neutral-highOnSurface">Generate 6 clips audios for me</p>

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(event) => {
          handleFile(event.target.files);
          event.target.value = '';
        }}
      />

      <div className="relative mt-1.5 rounded-xl bg-neutral-surface1 p-2">
        {/* 轨道 1：逐帧旁白，可拖拽换位、点击换音源 */}
        <div className="flex items-center gap-2">
          <span className="w-[76px] shrink-0 text-[9px] font-semibold uppercase tracking-wide text-neutral-lowOnSurface">
            Voiceover
          </span>
          <div className="flex h-11 min-w-0 flex-1 gap-[3px] rounded-md bg-neutral-surface2/60 p-[3px]">
            {voClips.map((clip, index) => (
              <div
                key={clip.id}
                className={clsx('relative min-w-0 flex-1', dragIndex === index && 'opacity-50')}
                draggable
                onDragStart={(event) => {
                  setDragIndex(index);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOverIndex(index);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragIndex !== null) {
                    reorderClips(dragIndex, index);
                  }
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
              >
                <button
                  type="button"
                  title={`${clip.sourceName ?? clip.caption} — click to replace, drag to reorder`}
                  onClick={() => setPicker((current) => (current === clip.id ? null : clip.id))}
                  className={clsx(
                    // pr-5 给右侧的删除按钮让位，波形不会钻到它底下
                    'flex size-full cursor-grab items-center gap-[2px] overflow-hidden rounded border border-solid pl-1 pr-5 text-left transition-colors active:cursor-grabbing',
                    clip.url || clip.sourceName
                      ? 'border-success-fill/40 bg-success-fill/10'
                      : 'border-primary-fill/30 bg-primary-surface2 hover:bg-primary-surface3',
                    overIndex === index && dragIndex !== null && dragIndex !== index && 'ring-2 ring-primary-fill'
                  )}
                >
                  <span className="shrink-0 text-[7px] font-semibold text-primary-onSurface">{clip.label}</span>
                  {AUDIO_WAVEFORM.slice(index * 5, index * 5 + 7).map((height, barIndex) => (
                    // 静态装饰，无业务 key
                    // eslint-disable-next-line react/no-array-index-key
                    <span
                      key={barIndex}
                      className="w-[2px] shrink-0 rounded-full bg-primary-fill/50"
                      style={{ height: Math.max(6, height / 2.4) }}
                    />
                  ))}
                </button>
                {/* 每段配音右端的删除按钮，和 BGM 那条保持一致 */}
                <button
                  type="button"
                  title={`Remove ${clip.label}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    setVoClips((current) => current.filter((item) => item.id !== clip.id));
                  }}
                  className="absolute right-0.5 top-1/2 z-10 -translate-y-1/2 rounded-full px-1 text-[13px] leading-none text-neutral-lowOnSurface transition-colors hover:text-error-fill"
                >
                  ×
                </button>
                {picker === clip.id ? renderPicker(clip.id) : null}
              </div>
            ))}
          </div>
        </div>

        {/* 轨道 2：背景音乐 */}
        <div className="relative mt-1.5 flex items-center gap-2">
          <span className="w-[76px] shrink-0 text-[9px] font-semibold uppercase tracking-wide text-neutral-lowOnSurface">
            Background
          </span>
          <div className="flex h-11 min-w-0 flex-1 rounded-md bg-neutral-surface2/60 p-[3px]">
            {bgm ? (
              <button
                type="button"
                title={`${bgm.sourceName ?? bgm.caption} — click to replace`}
                onClick={() => setPicker((current) => (current === 'bgm' ? null : 'bgm'))}
                className="flex size-full items-center gap-[3px] overflow-hidden rounded border border-solid border-amber-400/50 bg-amber-100/60 px-2 text-left transition-colors hover:bg-amber-100"
              >
                <span className="shrink-0 text-[8px] font-semibold text-neutral-highOnSurface">BGM</span>
                {AUDIO_WAVEFORM.map((height, barIndex) => (
                  // 静态装饰，无业务 key
                  // eslint-disable-next-line react/no-array-index-key
                  <span
                    key={barIndex}
                    className="w-[2px] shrink-0 rounded-full bg-amber-500/50"
                    style={{ height: Math.max(5, height / 3) }}
                  />
                ))}
                <span className="ml-1 truncate text-[9px] text-neutral-mediumOnSurface">
                  {bgm.sourceName ?? bgm.caption}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setPicker((current) => (current === 'bgm' ? null : 'bgm'))}
                className="flex size-full items-center justify-center gap-1 rounded border border-dashed border-neutral-fillLow text-[10px] text-neutral-lowOnSurface transition-colors hover:border-primary-fill hover:text-primary-fill"
              >
                <KsIconPlus size={12} />
                Add background music
              </button>
            )}
          </div>
          {picker === 'bgm' ? (
            <div className="absolute left-[76px] top-full z-30">{renderPicker('bgm')}</div>
          ) : null}
          {bgm ? (
            <button
              type="button"
              title="Remove background music"
              onClick={() => setBgm(null)}
              className="shrink-0 rounded-full px-1.5 text-[14px] leading-none text-neutral-lowOnSurface transition-colors hover:text-error-fill"
            >
              ×
            </button>
          ) : null}
        </div>

        {isPlaying ? (
          <span
            className="pointer-events-none absolute inset-y-2 w-px bg-neutral-fillMedHigh"
            style={{ left: `calc(84px + ${progress} * (100% - 96px))` }}
          />
        ) : null}
      </div>

      {/* 播放条：试听 / 音量 / 进度 */}
      <div className="mt-1.5 flex items-center gap-1.5">
        <button
          type="button"
          title={isPlaying ? 'Pause preview' : 'Play preview'}
          onClick={() => setIsPlaying((playing) => !playing)}
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-surface2 text-neutral-highOnSurface transition-colors hover:bg-neutral-surface3"
        >
          {isPlaying ? (
            <span className="flex gap-[2px]">
              <span className="h-2 w-[2px] bg-neutral-highOnSurface" />
              <span className="h-2 w-[2px] bg-neutral-highOnSurface" />
            </span>
          ) : (
            <svg viewBox="0 0 10 10" className="ml-px size-2.5">
              <path d="M1.5 0.7 L9 5 L1.5 9.3 Z" fill="currentColor" />
            </svg>
          )}
        </button>
        <span className="text-neutral-lowOnSurface">
          <KsIconSound size={12} />
        </span>
        <span className="shrink-0 text-[10px] tabular-nums text-neutral-mediumOnSurface">
          {formatTime(elapsed)} / 0:{AUDIO_CLIP_DURATION}
        </span>
        <span className="relative h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-neutral-surface2">
          <span className="absolute inset-y-0 left-0 bg-primary-fill" style={{ width: `${progress * 100}%` }} />
        </span>
        <span className="shrink-0 text-[9px] text-neutral-lowOnSurface">Click a clip to upload or swap audio</span>
      </div>
    </div>
  );
}

/** 蒜蓉酱趋势视频的封面占位（9:16 竖版，和播放框同构），交给下游 Video 节点当 assetUrl 用。 */
export const GARLIC_TREND_VIDEO_POSTER = svgDataUri(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 180 320'>
<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#4a3527'/><stop offset='0.55' stop-color='#2c1f15'/><stop offset='1' stop-color='#1e1610'/></linearGradient></defs>
<rect width='180' height='320' fill='url(#g)'/>
<circle cx='90' cy='140' r='24' fill='rgba(255,255,255,0.92)'/>
<path d='M83 127 L107 140 L83 153 Z' fill='#26262a'/>
<text x='90' y='206' font-family='Helvetica,Arial' font-size='13' font-weight='700' letter-spacing='2' fill='#f2ede7' text-anchor='middle'>GARLIC</text>
<text x='90' y='224' font-family='Helvetica,Arial' font-size='13' font-weight='700' letter-spacing='2' fill='#f2ede7' text-anchor='middle'>PASTE AD</text>
<text x='90' y='246' font-family='Helvetica,Arial' font-size='9' letter-spacing='1' fill='rgba(242,237,231,0.65)' text-anchor='middle'>Don Quijote PB · 00:06</text>
</svg>`);
