import {
  KsIconAiGeneration,
  KsIconArrowRight,
  KsIconChevronDown,
  KsIconImageCollection,
  KsIconPeople,
  KsIconPlus,
  KsIconTextFile,
  KsIconTips,
  KsIconToolbox,
  KsIconVideoClip
} from '@fe-infra/keystone-icons-react';
import clsx from 'clsx';
import { type ReactNode, useState } from 'react';

import { LIBRARY_ASSETS } from '../const';
import { TrendModal, type TrendSpec } from './InspirationNodes';

interface CanvasComposerProps {
  /** 上传了产品图后点生成：交给画布落节点 + 打开 agent 出 brief。 */
  onGenerateBrief: () => void;
  /** 打开 TikTok ads-native templates 弹层。 */
  onOpenTemplates: () => void;
  /** 打开左侧「+」节点面板。 */
  onAddNode: () => void;
  /** 打开教程。 */
  onOpenTutorials: () => void;
  /** 提交提示词，交给 agent 生成节点。 */
  onSubmit: (prompt: string) => void;
}

/** 挂在提示词框上的引用物：产品图 / 趋势 / 视频 / 数字人。 */
interface Attachment {
  id: string;
  /** 产品图渲染成方图缩略格，其余渲染成宽胶囊。 */
  kind: 'image' | 'trend' | 'video' | 'avatar' | 'brief';
  /** 胶囊上显示的类型名。 */
  label: string;
  /** 本地上传的缩略图。 */
  thumbUrl?: string;
  /** 趋势视频，用首帧当缩略图。 */
  videoUrl?: string;
  /** 无缩略图时的底色。 */
  background?: string;
}

let attachmentSeq = 0;


function ComposerPill({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      onPointerDown={(event) => event.stopPropagation()}
      className="flex items-center gap-1 rounded-full bg-neutral-surface1 px-2.5 py-1.5 text-[11px] font-medium text-neutral-highOnSurface transition-colors hover:bg-neutral-surface2"
    >
      {children}
      <KsIconChevronDown size={11} />
    </button>
  );
}

/** 「+」菜单里的一行。 */
function MenuItem({
  icon,
  label,
  badge,
  onClick
}: {
  icon: ReactNode;
  label: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] text-neutral-highOnSurface transition-colors hover:bg-neutral-surface2"
    >
      <span className="text-neutral-mediumOnSurface">{icon}</span>
      {label}
      {badge ? (
        <span className="ml-auto rounded-full bg-primary-surface2 px-1.5 py-0.5 text-[9px] font-semibold text-primary-onSurface">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function MenuSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-solid border-neutral-fillLow py-1 last:border-b-0">
      <div className="px-2 py-1 text-[11px] font-semibold text-neutral-lowOnSurface">{title}</div>
      {children}
    </div>
  );
}

/**
 * 空画布首屏的 agent 输入区。
 * 顶部一句问句 + 提示词框，下面三个快捷入口：模板 / 加节点 / 教程。
 */
function CanvasComposer({
  onGenerateBrief,
  onOpenTemplates,
  onAddNode,
  onOpenTutorials,
  onSubmit
}: CanvasComposerProps) {
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  /** 「+」浮层：主菜单 / 素材库 / 数字人库，null 表示收起。 */
  const [menu, setMenu] = useState<'main' | 'assets' | 'avatars' | null>(null);
  const [isTrendOpen, setIsTrendOpen] = useState(false);
  const [activeTrendId, setActiveTrendId] = useState('');

  const addAttachment = (attachment: Omit<Attachment, 'id'>) => {
    attachmentSeq += 1;
    setAttachments((current) => [...current, { ...attachment, id: `att-${attachmentSeq}` }]);
  };

  /** 本机选文件：images 走图片，video 走视频。 */
  const pickFiles = (kind: 'image' | 'video') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = kind === 'image' ? 'image/*' : 'video/*';
    input.multiple = kind === 'image';
    input.onchange = () => {
      [...(input.files ?? [])].forEach((file) => {
        addAttachment(
          kind === 'image'
            ? { kind: 'image' as const, label: 'Product', thumbUrl: URL.createObjectURL(file) }
            : { kind: 'video' as const, label: 'Video', videoUrl: URL.createObjectURL(file) }
        );
      });
    };
    input.click();
    setMenu(null);
  };

  /** 本机选 PDF：作为 product brief 挂到提示词框上。 */
  const pickBriefPdf = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,.pdf';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        addAttachment({ kind: 'brief', label: file.name });
      }
    };
    input.click();
    setMenu(null);
  };

  const hasImages = attachments.some((item) => item.kind === 'image');
  const hasBrief = attachments.some((item) => item.kind === 'brief');
  /** 上传了产品图 / 挂了 product brief / 写了提示词，都可以发起生成。 */
  const canSubmit = hasImages || hasBrief || Boolean(prompt.trim());

  const submit = () => {
    if (!canSubmit) {
      return;
    }
    // 有产品图或 brief：交给画布落输入节点，brief 在 Creative agent 里出
    if (hasImages || hasBrief) {
      onGenerateBrief();
      return;
    }
    onSubmit(prompt.trim());
    setPrompt('');
  };

  const shortcuts = [
    {
      id: 'templates',
      label: 'Start from TikTok ads-native templates',
      icon: <KsIconAiGeneration size={13} />,
      onClick: onOpenTemplates
    },
    { id: 'add-node', label: 'Add a node', icon: <KsIconPlus size={13} />, onClick: onAddNode },
    { id: 'tutorials', label: 'Tutorials', icon: <KsIconTips size={13} />, onClick: onOpenTutorials }
  ];

  return (
    // 不吃指针事件，空白处仍可拖拽画布；内部元素各自开启交互
    // pl-[88px] 让出左侧工具栏的位置，内容在剩余空间里居中
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center px-6 pl-[88px]">
      <h1 className="pointer-events-auto text-[30px] font-semibold text-neutral-highOnSurface">
        What do you want to create?
      </h1>

      {/* 提示词输入卡 */}
      <div
        className="pointer-events-auto mt-6 flex w-[858px] max-w-[94vw] flex-col rounded-2xl border border-solid border-neutral-fillLow bg-neutral-surface text-left shadow-[0_10px_30px_rgba(16,24,40,0.08)]"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="px-5 pb-2 pt-4">
          <div className="flex flex-wrap items-start gap-2">
            {/* 「+」引用物入口 */}
            <div className="relative">
              <button
                type="button"
                title="Add product images, a trend, a video or an avatar"
                onClick={() => setMenu((current) => (current ? null : 'main'))}
                className={clsx(
                  'flex size-14 shrink-0 items-center justify-center rounded-xl border border-solid transition-colors',
                  menu
                    ? 'border-primary-fill bg-primary-surface2 text-primary-onSurface'
                    : 'border-transparent bg-neutral-surface1 text-neutral-lowOnSurface hover:bg-neutral-surface2 hover:text-primary-fill'
                )}
              >
                <KsIconPlus size={18} />
              </button>

              {menu ? (
                <>
                  {/* 点空白处收起 */}
                  <div className="fixed inset-0 z-20" onClick={() => setMenu(null)} />
                  <div className="absolute left-0 top-full z-30 mt-2 w-[240px] rounded-xl border border-solid border-neutral-fillLow bg-neutral-surface p-1 shadow-[0_10px_30px_rgba(16,24,40,0.16)]">
                    {menu === 'main' ? (
                      <>
                        <MenuSection title="Product">
                          <MenuItem
                            icon={<KsIconImageCollection size={14} />}
                            label="Upload images"
                            onClick={() => pickFiles('image')}
                          />
                          <MenuItem
                            icon={<KsIconToolbox size={14} />}
                            label="Select from asset library"
                            onClick={() => setMenu('assets')}
                          />
                          <MenuItem
                            icon={<KsIconTextFile size={14} />}
                            label="Upload product brief (PDF)"
                            onClick={pickBriefPdf}
                          />
                        </MenuSection>
                        <MenuSection title="Reference">
                          <MenuItem
                            icon={<KsIconAiGeneration size={14} />}
                            label="Select a trend"
                            onClick={() => {
                              setMenu(null);
                              setIsTrendOpen(true);
                            }}
                          />
                          <MenuItem
                            icon={<KsIconVideoClip size={14} />}
                            label="Upload a video"
                            onClick={() => pickFiles('video')}
                          />
                        </MenuSection>
                        <MenuSection title="Avatar">
                          <MenuItem
                            icon={<KsIconPeople size={14} />}
                            label="Select from avatar library"
                            badge="New"
                            onClick={() => setMenu('avatars')}
                          />
                        </MenuSection>
                      </>
                    ) : (
                      <div className="max-h-[220px] overflow-y-auto">
                        <button
                          type="button"
                          onClick={() => setMenu('main')}
                          className="mb-1 w-full rounded-lg px-2 py-1 text-left text-[11px] font-medium text-neutral-lowOnSurface transition-colors hover:bg-neutral-surface2"
                        >
                          ← Back
                        </button>
                        {LIBRARY_ASSETS.filter((asset) =>
                          menu === 'avatars' ? asset.kind === 'avatar' : asset.kind === 'image'
                        ).map((asset) => (
                          <MenuItem
                            key={asset.id}
                            icon={
                              menu === 'avatars' ? <KsIconPeople size={14} /> : <KsIconImageCollection size={14} />
                            }
                            label={asset.name}
                            onClick={() => {
                              addAttachment({
                                kind: menu === 'avatars' ? 'avatar' : 'image',
                                label: menu === 'avatars' ? 'Avatar' : 'Product',
                                background: 'linear-gradient(160deg,#cfe0ff,#e7eef8)'
                              });
                              setMenu(null);
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            {/* 已挂载的引用物 */}
            {attachments.map((attachment) => {
              const remove = () =>
                setAttachments((current) => current.filter((item) => item.id !== attachment.id));

              // 产品图：正方缩略格，底部压一枚「Image N」角标
              if (attachment.kind === 'image') {
                const imageIndex = attachments.filter((item) => item.kind === 'image').indexOf(attachment) + 1;
                return (
                  <span
                    key={attachment.id}
                    className="group relative size-14 shrink-0 overflow-hidden rounded-xl bg-neutral-surface1"
                    style={attachment.background ? { background: attachment.background } : undefined}
                  >
                    {attachment.thumbUrl ? (
                      <img src={attachment.thumbUrl} alt="" className="size-full object-cover" draggable={false} />
                    ) : null}
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-1">
                      <span className="rounded bg-neutral-fillHigh/75 px-1.5 py-0.5 text-[8px] font-medium text-neutral-onFill">
                        Image {imageIndex}
                      </span>
                    </span>
                    <button
                      type="button"
                      title="Remove"
                      onClick={remove}
                      className="absolute right-0.5 top-0.5 hidden size-4 items-center justify-center rounded-full bg-neutral-fillHigh/80 text-[11px] leading-none text-neutral-onFill group-hover:flex"
                    >
                      ×
                    </button>
                  </span>
                );
              }

              return (
                <span key={attachment.id} className="flex h-14 items-center gap-2 rounded-xl bg-neutral-surface1 pr-2">
                  <span
                    className="h-14 w-16 shrink-0 overflow-hidden rounded-xl"
                    style={attachment.background ? { background: attachment.background } : undefined}
                  >
                    {attachment.kind === 'brief' ? (
                      <span className="flex size-full items-center justify-center bg-primary-surface2 text-primary-onSurface">
                        <KsIconTextFile size={18} />
                      </span>
                    ) : attachment.videoUrl ? (
                      <video
                        src={attachment.videoUrl}
                        muted
                        playsInline
                        preload="metadata"
                        onLoadedMetadata={(event) => {
                          event.currentTarget.currentTime = 1.2;
                        }}
                        className="size-full object-cover"
                      />
                    ) : null}
                  </span>
                  <span className="max-w-[160px] truncate text-[12px] font-medium text-neutral-highOnSurface">
                    {attachment.label}
                  </span>
                  <button
                    type="button"
                    title="Remove"
                    onClick={remove}
                    className="text-[14px] leading-none text-neutral-lowOnSurface transition-colors hover:text-neutral-highOnSurface"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>

          <textarea
            value={prompt}
            rows={5}
            placeholder="Upload product images, select a trend, and describe your ad vision. Type @ to reference added content."
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              // Enter 发送，Shift+Enter 换行
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            className="mt-3 w-full resize-none bg-transparent text-[13px] leading-[19px] text-neutral-highOnSurface outline-none placeholder:text-neutral-lowOnSurface"
          />
        </div>

        <div className="flex items-center gap-1.5 px-4 pb-4">
          <ComposerPill>Dreamina Seedance 2.5</ComposerPill>
          <ComposerPill>English · 1 video · 30s</ComposerPill>
          <div className="ml-auto flex items-center gap-2">
            <ComposerPill>Manual</ComposerPill>
            <span className="flex items-center gap-1 text-[11px] tabular-nums text-neutral-mediumOnSurface">
              <span className="inline-block size-3 rounded-full bg-amber-400" />
              60
            </span>
            <button
              type="button"
              title="Generate"
              disabled={!canSubmit}
              onClick={submit}
              className={clsx(
                'flex size-8 items-center justify-center rounded-full transition-opacity',
                canSubmit
                  ? 'bg-primary-fill text-neutral-onFill hover:opacity-90'
                  : 'cursor-not-allowed bg-neutral-surface2 text-neutral-lowOnSurface'
              )}
            >
              <KsIconArrowRight size={14} className="-rotate-90" />
            </button>
          </div>
        </div>
      </div>

      {/* 三个快捷入口 */}
      <div className="pointer-events-auto mt-4 flex flex-wrap items-center justify-center gap-2">
        {shortcuts.map((shortcut) => (
          <button
            key={shortcut.id}
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={shortcut.onClick}
            className="flex items-center gap-1.5 rounded-full border border-solid border-neutral-fillLow bg-neutral-surface px-3 py-1.5 text-[12px] font-medium text-neutral-highOnSurface transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(16,24,40,0.10)]"
          >
            {shortcut.icon}
            {shortcut.label}
          </button>
        ))}
      </div>

      {/* Select a trend 弹层：选中后作为「Trend」引用物挂到输入框 */}
      {isTrendOpen ? (
        <TrendModal
          activeId={activeTrendId}
          onPick={(trend: TrendSpec) => {
            setActiveTrendId(trend.id);
            addAttachment({ kind: 'trend', label: 'Trend', videoUrl: trend.videoUrl, background: trend.background });
          }}
          onClose={() => setIsTrendOpen(false)}
        />
      ) : null}
    </div>
  );
}

export default CanvasComposer;
