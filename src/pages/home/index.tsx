import { KsIconArrowRight, KsIconChevronDown, KsIconPlus } from '@fe-infra/keystone-icons-react';
import clsx from 'clsx';
import { Fragment } from 'react';
import type { ReactNode } from 'react';

import {
  KsIconAiLined,
  KsIconAllApps,
  KsIconFolderF,
  KsIconHome,
  KsIconLayout,
  KsIconLightbulb,
  KsIconToolboxF,
  KsIconTransitions
} from './keystone-nav-icons';

/** 跳到画布页；demo 里用 hash 路由。 */
const goToCanvas = () => {
  window.location.hash = '#/canvas';
};

/* ------------------------------------------------------------------ */
/* 顶栏：对齐 Symphony Creative Studio 线上版                            */
/* ------------------------------------------------------------------ */

function TopBar() {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 bg-neutral-fillHigh px-4 text-neutral-onFill">
      {/* 汉堡菜单 */}
      <span className="flex flex-col gap-[3px] px-1">
        <span className="h-[2px] w-4 rounded bg-neutral-onFill" />
        <span className="h-[2px] w-4 rounded bg-neutral-onFill" />
        <span className="h-[2px] w-4 rounded bg-neutral-onFill" />
      </span>

      <span className="flex items-center gap-1.5">
        <span className="text-[16px] font-black tracking-tight">♪ TikTok</span>
        <span className="text-[13px] text-neutral-onFill/90">Symphony Creative Studio</span>
      </span>

      <div className="ml-auto flex items-center gap-2">
        {/* 铃铛 */}
        <svg viewBox="0 0 16 16" className="size-4 opacity-90">
          <path
            d="M8 1.5a4.2 4.2 0 0 0-4.2 4.2v2.6L2.6 10.6c-.3.5 0 1.1.6 1.1h9.6c.6 0 .9-.6.6-1.1l-1.2-2.3V5.7A4.2 4.2 0 0 0 8 1.5Zm-1.5 11.2a1.5 1.5 0 0 0 3 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="flex items-center gap-1 rounded-full bg-neutral-onFill/10 px-2.5 py-1 text-[11px]">
          <svg viewBox="0 0 14 14" className="size-3 opacity-90">
            <circle cx="7" cy="7" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.1" />
            <path d="M1.4 7h11.2M7 1.4c-3.4 3.4-3.4 7.8 0 11.2 3.4-3.4 3.4-7.8 0-11.2Z" fill="none" stroke="currentColor" strokeWidth="1.1" />
          </svg>
          English
        </span>
        <span className="flex items-center gap-1 rounded-full bg-neutral-onFill/10 px-2.5 py-1 text-[11px] tabular-nums">
          <span className="inline-block size-3 rounded-full bg-amber-400" />
          975
        </span>
        <span className="rounded-md bg-error-fill px-2 py-0.5 text-[11px] font-semibold">Test</span>
        <span className="flex items-center gap-1">
          <span className="flex size-7 items-center justify-center rounded-full bg-primary-fill text-[12px] font-semibold">
            S
          </span>
          <span className="max-w-[110px] truncate text-[11px] text-neutral-onFill/90">[Test] Creative M…</span>
          <KsIconChevronDown size={12} />
        </span>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* 侧边导航：Canvas 入口保持在 Agent 之上                                */
/* ------------------------------------------------------------------ */

interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  onClick?: () => void;
}

const NAV_ICON_SIZE = 18;

/** 图标取自 Keystone Icon Figma 库，统一 fillMedHigh 配色。 */
const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', icon: <KsIconHome size={NAV_ICON_SIZE} /> },
  { id: 'inspire', label: 'Inspire', icon: <KsIconLightbulb size={NAV_ICON_SIZE} /> },
  // Canvas 挂在 Agent 上方，点击进入画布
  { id: 'canvas', label: 'Canvas', icon: <KsIconLayout size={NAV_ICON_SIZE} />, onClick: goToCanvas },
  { id: 'agent', label: 'Agent', icon: <KsIconAiLined size={NAV_ICON_SIZE} /> },
  { id: 'create', label: 'Create', icon: <KsIconTransitions size={NAV_ICON_SIZE} /> },
  { id: 'tools', label: 'Tools', icon: <KsIconToolboxF size={NAV_ICON_SIZE} /> },
  { id: 'library', label: 'Library', icon: <KsIconFolderF size={NAV_ICON_SIZE} /> },
  { id: 'products', label: 'Products', icon: <KsIconAllApps size={NAV_ICON_SIZE} /> }
];

function SideNavigation() {
  return (
    // justify-center：导航项垂直居中悬在屏幕中段，与录屏一致
    <nav className="fixed left-0 top-12 z-30 flex h-[calc(100vh-48px)] w-[64px] flex-col items-center justify-center gap-1 bg-neutral-surface py-3">
      {NAV_ITEMS.map((item) => {
        const isActive = item.id === 'home';
        return (
          <button
            key={item.id}
            type="button"
            title={item.label}
            onClick={item.onClick}
            className={clsx(
              'flex w-[56px] flex-col items-center gap-1 rounded-xl py-2 text-[9px] font-medium transition-colors',
              isActive
                ? 'bg-neutral-surface2 text-neutral-highOnSurface'
                : 'text-neutral-fillMedHigh hover:bg-neutral-surface2'
            )}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Hero：Generate ads with the latest TikTok trends                     */
/* ------------------------------------------------------------------ */

const COMPOSER_TABS = ['Agent', 'Video', 'Image'];

/** 提示词下方的行业快捷 chips（黑色上衣 / 口红 / 绿色沙发小图标）。 */
const SUGGESTION_CHIPS = [
  {
    id: 'apparel',
    label: 'Create an apparel ad',
    icon: (
      <svg viewBox="0 0 16 16" className="size-3.5">
        <path d="M5 2 8 3.5 11 2l3 2.5-1.5 2L11 5.6V14H5V5.6L3.5 6.5 2 4.5 5 2Z" fill="#26262a" />
      </svg>
    )
  },
  {
    id: 'beauty',
    label: 'Create a beauty product ad',
    icon: (
      <svg viewBox="0 0 16 16" className="size-3.5">
        <rect x="6" y="7" width="4" height="7" rx="1" fill="#c2452f" />
        <path d="M7 7V4c0-1 2-1 2 0v3" fill="#e5484d" />
      </svg>
    )
  },
  {
    id: 'furniture',
    label: 'Create a furniture ad',
    icon: (
      <svg viewBox="0 0 16 16" className="size-3.5">
        <path d="M2 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4H2V8Z" fill="#3d6b4f" />
        <rect x="3" y="4" width="10" height="3" rx="1.5" fill="#4f8a66" />
      </svg>
    )
  }
];

function ComposerPill({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      className="flex items-center gap-1 rounded-full bg-neutral-surface1 px-2.5 py-1.5 text-[11px] font-medium text-neutral-highOnSurface transition-colors hover:bg-neutral-surface2"
    >
      {children}
      <KsIconChevronDown size={11} />
    </button>
  );
}

function Hero() {
  return (
    <section className="pt-14 text-center">
      <h1 className="text-[30px] font-semibold text-neutral-highOnSurface">
        Generate ads with the latest TikTok trends
      </h1>

      {/* 生成器输入卡 */}
      <div className="mx-auto mt-6 w-[660px] max-w-[92vw] rounded-2xl border border-solid border-neutral-fillLow bg-neutral-surface text-left shadow-[0_10px_30px_rgba(16,24,40,0.08)]">
        <div className="flex gap-5 border-b border-solid border-neutral-fillLow px-5 pt-3">
          {COMPOSER_TABS.map((tab, index) => (
            <button
              key={tab}
              type="button"
              className={clsx(
                'border-b-2 border-solid pb-2 text-[13px] transition-colors',
                index === 0
                  ? 'border-neutral-highOnSurface font-semibold text-neutral-highOnSurface'
                  : 'border-transparent text-neutral-lowOnSurface hover:text-neutral-mediumOnSurface'
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="px-5 py-4">
          <button
            type="button"
            title="Upload product images"
            className="flex size-12 items-center justify-center rounded-xl bg-neutral-surface1 text-neutral-lowOnSurface transition-colors hover:bg-neutral-surface2 hover:text-primary-fill"
          >
            <KsIconPlus size={18} />
          </button>
          <p className="mt-3 text-[13px] text-neutral-lowOnSurface">
            Upload product images, select a trend, and describe your ad vision. Type @ to reference added content.
          </p>
        </div>

        <div className="flex items-center gap-1.5 px-4 pb-4">
          <ComposerPill>Dreamina Seedance 2.5</ComposerPill>
          <ComposerPill>English · 1 video</ComposerPill>
          <ComposerPill>15s</ComposerPill>
          <div className="ml-auto flex items-center gap-2">
            <ComposerPill>Manual</ComposerPill>
            <span className="flex items-center gap-1 text-[11px] tabular-nums text-neutral-mediumOnSurface">
              <span className="inline-block size-3 rounded-full bg-amber-400" />
              30
            </span>
            <button
              type="button"
              title="Generate"
              onClick={goToCanvas}
              className="flex size-8 items-center justify-center rounded-full bg-primary-fill text-neutral-onFill transition-opacity hover:opacity-90"
            >
              <KsIconArrowRight size={14} className="-rotate-90" />
            </button>
          </div>
        </div>
      </div>

      {/* 行业快捷入口 */}
      <div className="mt-4 flex items-center justify-center gap-2">
        {SUGGESTION_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={goToCanvas}
            className="flex items-center gap-1.5 rounded-full border border-solid border-neutral-fillLow bg-neutral-surface px-3 py-1.5 text-[12px] font-medium text-neutral-highOnSurface transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(16,24,40,0.10)]"
          >
            {chip.icon}
            {chip.label}
          </button>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 瀑布流卡片（Top-performing ads / Ready-to-use templates）             */
/* ------------------------------------------------------------------ */

/** 卡片纵横比档位；每列的排布顺序按产品规格固定。 */
type CardRatio = '5:7' | '4:5' | '9:16';

const RATIO_CLASS: Record<CardRatio, string> = {
  '5:7': 'aspect-[5/7]',
  '4:5': 'aspect-[4/5]',
  '9:16': 'aspect-[9/16]'
};

/** Top ads 五列的纵横比顺序（第一列首位由 Promo 卡占据，同为 5:7）。 */
const TOP_ADS_COLUMNS: CardRatio[][] = [
  ['5:7', '4:5', '9:16'],
  ['9:16', '5:7', '4:5'],
  ['5:7', '4:5', '9:16'],
  ['4:5', '9:16', '5:7'],
  ['9:16', '5:7', '4:5']
];

/** Templates 五列的纵横比顺序（第一列首位由 Promo 卡占据）。 */
const TEMPLATE_COLUMNS: CardRatio[][] = [
  ['5:7', '4:5', '9:16'],
  ['4:5', '9:16', '5:7'],
  ['9:16', '5:7', '4:5'],
  ['5:7', '4:5', '9:16'],
  ['4:5', '9:16', '5:7']
];

interface AdCard {
  id: string;
  /** 顶部徽标：观看量或模板分类。 */
  badge: string;
  duration: string;
  videoUrl?: string;
  background?: string;
}

/** 按列序（第一列自上而下 → 第五列）依次填充的卡片内容；Promo 占掉第一列首位。 */
const TOP_ADS: AdCard[] = [
  { id: 'ts', badge: '37M views', duration: '00:13', videoUrl: '/tracksuit-trend.mp4' },
  { id: 'hoodie', badge: '6.8M views', duration: '00:30', videoUrl: '/hoodie-ad.mp4' },
  { id: 'garlic', badge: '110.3M views', duration: '00:06', videoUrl: '/garlic-paste-ad.mp4' },
  { id: 'laptop', badge: '4.1M views', duration: '00:12', background: 'linear-gradient(160deg,#3e4a54,#161b1f)' },
  { id: 'ihg', badge: '123.6M views', duration: '00:11', background: 'linear-gradient(160deg,#3a3650,#171523)' },
  { id: 'money', badge: '100.6M views', duration: '00:24', background: 'linear-gradient(160deg,#5a4326,#211810)' },
  { id: 'castle', badge: '44.4M views', duration: '00:15', background: 'linear-gradient(160deg,#2c2440,#141020)' },
  { id: 'sofa', badge: '157.2M views', duration: '00:07', background: 'linear-gradient(160deg,#4a4438,#1d1a14)' },
  { id: 'beach', badge: '23.6M views', duration: '00:16', background: 'linear-gradient(160deg,#2f5a5e,#12262a)' },
  { id: 'nails', badge: '9.6M views', duration: '00:53', background: 'linear-gradient(160deg,#6b5b8a,#2a2340)' },
  { id: 'travel', badge: '130.6M views', duration: '00:07', background: 'linear-gradient(160deg,#2f5a3e,#122619)' },
  { id: 'opodo', badge: '10.7M views', duration: '00:06', background: 'linear-gradient(160deg,#26262a,#0e0e10)' },
  { id: 'doordash', badge: '255.3M views', duration: '00:15', background: 'linear-gradient(160deg,#7a4a3a,#301b14)' },
  { id: 'adt', badge: '51.3M views', duration: '00:19', background: 'linear-gradient(160deg,#3f4145,#191b1f)' }
];

const TEMPLATES: AdCard[] = [
  { id: 't-ts', badge: 'Viral ads', duration: '00:15', videoUrl: '/tracksuit-trend.mp4' },
  { id: 't-hoodie', badge: 'Product-only', duration: '00:15', videoUrl: '/hoodie-ad.mp4' },
  { id: 't-garlic', badge: 'Viral ads', duration: '00:15', videoUrl: '/garlic-paste-ad.mp4' },
  { id: 't-life1', badge: 'Lifestyle', duration: '00:15', background: 'linear-gradient(160deg,#4a5568,#1a202c)' },
  { id: 't-prod1', badge: 'Product-only', duration: '00:15', background: 'linear-gradient(160deg,#6b5b8a,#2a2340)' },
  { id: 't-higgs', badge: 'Higgsfield x Symphony', duration: '00:15', background: 'linear-gradient(160deg,#26262a,#0e0e10)' },
  { id: 't-life2', badge: 'Lifestyle', duration: '00:15', background: 'linear-gradient(160deg,#7a4a3a,#301b14)' },
  { id: 't-visual', badge: 'Visual styles', duration: '00:15', background: 'linear-gradient(160deg,#3f4145,#191b1f)' },
  { id: 't-prod2', badge: 'Product-only', duration: '00:15', background: 'linear-gradient(160deg,#2f5a5e,#12262a)' },
  { id: 't-viral2', badge: 'Viral ads', duration: '00:15', background: 'linear-gradient(160deg,#3a3650,#171523)' },
  { id: 't-life3', badge: 'Lifestyle', duration: '00:15', background: 'linear-gradient(160deg,#5a4326,#211810)' },
  { id: 't-visual2', badge: 'Visual styles', duration: '00:15', background: 'linear-gradient(160deg,#2c2440,#141020)' },
  { id: 't-prod3', badge: 'Product-only', duration: '00:15', background: 'linear-gradient(160deg,#2f5a3e,#122619)' },
  { id: 't-viral3', badge: 'Viral ads', duration: '00:15', background: 'linear-gradient(160deg,#4a4438,#1d1a14)' }
];

function AdTile({ card, ratio, badgeStyle }: { card: AdCard; ratio: CardRatio; badgeStyle: 'views' | 'tag' }) {
  return (
    <button
      type="button"
      onClick={goToCanvas}
      className={clsx(
        'relative block w-full overflow-hidden rounded-2xl text-left transition-transform hover:-translate-y-0.5',
        RATIO_CLASS[ratio]
      )}
      style={card.background ? { background: card.background } : undefined}
    >
      {card.videoUrl ? (
        <video
          src={card.videoUrl}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={(event) => {
            event.currentTarget.currentTime = 1.2;
          }}
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
      <span
        className={clsx(
          'absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-medium',
          badgeStyle === 'views' ? 'bg-neutral-fillHigh/70 text-neutral-onFill' : 'bg-neutral-surface/90 text-neutral-highOnSurface'
        )}
      >
        {card.badge}
      </span>
      <span className="absolute bottom-2 left-2 rounded bg-neutral-fillHigh/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-neutral-onFill">
        {card.duration}
      </span>
    </button>
  );
}

function PromoTile({
  title,
  copy,
  background
}: {
  title: string;
  copy: string;
  background: string;
}) {
  return (
    <button
      type="button"
      onClick={goToCanvas}
      className={clsx(
        'relative block w-full overflow-hidden rounded-2xl p-5 text-left transition-transform hover:-translate-y-0.5',
        RATIO_CLASS['5:7']
      )}
      style={{ background }}
    >
      <div className="text-[24px] font-bold leading-[28px] text-neutral-onFill">{title}</div>
      <p className="mt-3 text-[12px] leading-[17px] text-neutral-onFill/80">{copy}</p>
      <span className="absolute bottom-4 right-4 flex size-8 items-center justify-center rounded-full bg-neutral-onFill/20 text-neutral-onFill">
        <KsIconArrowRight size={14} />
      </span>
    </button>
  );
}

/**
 * 五列瀑布流：每列的纵横比顺序按规格固定；Promo 卡占第一列首位，
 * 其余卡片按「第一列自上而下 → 第五列」的顺序消费 cards。
 */
function MasonrySection({
  promo,
  columns,
  cards,
  badgeStyle,
  footerLabel
}: {
  promo: ReactNode;
  columns: CardRatio[][];
  cards: AdCard[];
  badgeStyle: 'views' | 'tag';
  footerLabel: string;
}) {
  let cardIndex = -1;
  return (
    <section className="mt-16">
      <div className="grid grid-cols-5 gap-3">
        {columns.map((ratios, columnIndex) => (
          // 列结构是静态配置，索引即身份
          // eslint-disable-next-line react/no-array-index-key
          <div key={columnIndex} className="flex flex-col gap-3">
            {ratios.map((ratio, slotIndex) => {
              if (columnIndex === 0 && slotIndex === 0) {
                // promo 由父组件传入，本身不带 key；包一层 Fragment 补上列表项需要的 key
                return <Fragment key="promo">{promo}</Fragment>;
              }
              cardIndex += 1;
              const card = cards[cardIndex];
              return card ? <AdTile key={card.id} card={card} ratio={ratio} badgeStyle={badgeStyle} /> : null;
            })}
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-center">
        <button
          type="button"
          onClick={goToCanvas}
          className="flex items-center gap-1.5 rounded-full border border-solid border-neutral-fillLow bg-neutral-surface px-5 py-2 text-[12px] font-medium text-neutral-highOnSurface transition-colors hover:bg-neutral-surface2"
        >
          {footerLabel}
          <KsIconArrowRight size={13} />
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 页面                                                                */
/* ------------------------------------------------------------------ */

/** Symphony Creative Studio 首页：hero 生成器 + Top ads + 模板瀑布流。 */
function HomePage() {
  return (
    <div className="min-h-screen bg-neutral-surface1">
      <div className="fixed inset-x-0 top-0 z-40">
        <TopBar />
      </div>
      <SideNavigation />

      <main className="ml-[64px] pt-12">
        {/* 顶部淡淡的品牌渐变 */}
        <div className="pointer-events-none absolute inset-x-0 top-12 h-64 bg-gradient-to-b from-primary-surface2/50 to-transparent" />

        <div className="relative mx-auto max-w-[1180px] px-8 pb-16">
          <Hero />

          <MasonrySection
            promo={
              <PromoTile
                title="Top-performing ads"
                copy="We decode secrets behind why top ads work — skip the guesswork, get inspired."
                background="linear-gradient(150deg,#8a7bd8 0%,#5b6bd6 45%,#3b4fc4 100%)"
              />
            }
            columns={TOP_ADS_COLUMNS}
            cards={TOP_ADS}
            badgeStyle="views"
            footerLabel="View all top ads"
          />

          <MasonrySection
            promo={
              <PromoTile
                title="Ready-to-use templates"
                copy="Pick a proven structure, drop in your product, and publish in minutes."
                background="linear-gradient(150deg,#5bb8d6 0%,#3b8fc4 55%,#2f6bff 100%)"
              />
            }
            columns={TEMPLATE_COLUMNS}
            cards={TEMPLATES}
            badgeStyle="tag"
            footerLabel="View all templates"
          />
        </div>
      </main>
    </div>
  );
}

export default HomePage;
