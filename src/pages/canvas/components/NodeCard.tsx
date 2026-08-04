import { KsIconArrowRight, KsIconChevronDown, KsIconCut, KsIconPlus } from '@fe-infra/keystone-icons-react';
import clsx from 'clsx';
import type React from 'react';
import { useRef, useState } from 'react';

import { BATCH_PREVIEW_ITEMS, NODE_KIND_CONFIG, PORT_ROW_HEIGHT } from '../const';
import type { CanvasEdge, CanvasNode, EditNodeKind, NodePortSpec, PortType, VariationEvent } from '../types';
import { countInputConnections, getNodeHeight, getPortOffsetY } from '../utils';
import {
  AudioClipsBody,
  BrandKitBody,
  ProductBriefBody,
  ProductImagesBody,
  ScrollArea,
  StoryboardBody,
  TikTokTrendBody
} from './InspirationNodes';
import NodeHoverToolbar, { EditingModeToolbar, VideoHoverToolbar } from './NodeHoverToolbar';
import { NodeKindIcon, PORT_TYPE_ICON } from './nodeIcons';
import { BriefVariationPlanner, StrategyBody, VariationSetBody } from './VariationNodes';

interface NodeCardProps {
  node: CanvasNode;
  edges: CanvasEdge[];
  isSelected: boolean;
  isHovered: boolean;
  /** 是否是唯一选中项；多选时由顶部工具栏统一操作，卡片不再各自弹操作条。 */
  isSoleSelection: boolean;
  /** 画布上任意一处正在拉线：此时所有卡片都亮出端口，方便对接。 */
  isConnecting: boolean;
  /** 正在拉的连线携带的数据类型，用于高亮可接的输入端口。 */
  connectingType: PortType | null;
  onHoverChange: (nodeId: string | null) => void;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>, nodeId: string) => void;
  onOutputPointerDown: (event: React.PointerEvent<HTMLDivElement>, nodeId: string, outputId: string) => void;
  onInputPointerUp: (event: React.PointerEvent<HTMLDivElement>, nodeId: string, inputId: string) => void;
  onOpenAddPanel: (nodeId: string, outputId: string) => void;
  /** 多选时（2 个以上节点同时选中）画布顶层统一渲染一个居中的 ⊕，卡片自己的就不再显示了。 */
  showAddButton: boolean;
  /** operation 类节点（如 Split A/V）敲回车或点运行：真正执行本节点，顺带按需接一个下游产物节点。 */
  onOperationGenerate: (nodeId: string) => void;
  /** 拖右下角把手改节点尺寸。 */
  onResizePointerDown: (event: React.PointerEvent<HTMLDivElement>, nodeId: string) => void;
  /** 在卡片任意位置松手：自动挑一个类型匹配的输入完成连线。 */
  onDropOnCard: (nodeId: string) => void;
  /** 打开全屏编辑器；launch 可带一条指令（进门就交给 agent）或直接进入圈选模式。 */
  onOpenEditor: (nodeId: string, launch?: { prompt?: string; draw?: boolean }) => void;
  onRunTool: (nodeId: string, kind: EditNodeKind) => void;
  /** 执行本节点，调用平台的生成能力。 */
  onRun: (nodeId: string) => void;
  /** 编辑卡片内容（prompt / 文案）。 */
  onTextChange: (nodeId: string, text: string) => void;
  /** Storyboard 触发生成：卡片内的输入框和卡片通用的运行按钮都走这一个，结局都保证落满 6 帧。 */
  onStoryboardGenerate: (nodeId: string, text?: string) => void;
  /** 变体探索的所有交互（planner / strategy / variation set）统一走这一个分发器。 */
  onVariationEvent: (nodeId: string, event: VariationEvent) => void;
  /** 本节点正处于内联编辑模式：悬浮菜单换成「Exit editing mode」。 */
  isEditing: boolean;
  /** 退出内联编辑模式。 */
  onExitEditor: () => void;
  onDuplicate: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
}

/** 固定的一组波形高度，避免每帧随机导致重渲染时跳动。 */
const WAVEFORM_BARS = [8, 16, 24, 14, 30, 20, 11, 26, 18, 9, 22, 28, 13, 19, 25, 10, 17, 23, 12, 27];

/**
 * 端口小圆点，连线的实际吸附目标。
 * 常态就可见（只是较淡），拉线时可接的端口会放大高亮，形成吸附提示。
 */
function PortDot({
  isFilled,
  isInteractive,
  isCandidate
}: {
  isFilled: boolean;
  isInteractive: boolean;
  isCandidate?: boolean;
}) {
  return (
    <span
      className={clsx(
        // block 是必须的：span 默认 display:inline，宽高会被忽略，端口会塌成 0×0
        'block shrink-0 rounded-full border-2 border-solid border-neutral-surface transition-all',
        isCandidate ? 'size-[14px] bg-primary-fill ring-2 ring-primary-surface2' : 'size-[10px]',
        !isCandidate && (isFilled ? 'bg-primary-fill' : 'bg-neutral-fillMedHigh'),
        isInteractive && 'cursor-crosshair hover:scale-125 hover:bg-primary-fill'
      )}
    />
  );
}

/**
 * 左侧输入行：图标 + 名称 + 已用/上限 + 端口。
 * 挂在卡片左外侧，和 Flora 一致，只在 hover / 选中时显示。
 */
function InputRow({
  port,
  used,
  offsetY,
  showLabel,
  isCandidate,
  onPointerUp
}: {
  port: NodePortSpec;
  used: number;
  offsetY: number;
  showLabel: boolean;
  isCandidate: boolean;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className="absolute right-full flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap pr-0"
      style={{ top: offsetY }}
      onPointerUp={onPointerUp}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span
        className={clsx(
          'flex items-center gap-1 pr-1.5 text-[10px] font-medium text-neutral-mediumOnSurface transition-opacity',
          showLabel ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      >
        <span className="text-neutral-lowOnSurface">{PORT_TYPE_ICON[port.type]}</span>
        {port.label}
        {port.max ? (
          <span className="tabular-nums text-neutral-lowOnSurface">
            {used}/{port.max}
          </span>
        ) : null}
      </span>
      <span className="-mr-[5px]">
        <PortDot isFilled={used > 0} isInteractive={false} isCandidate={isCandidate} />
      </span>
    </div>
  );
}

/** 右侧输出行；单输出时不显示文字，只留 ⊕。 */
function OutputRow({
  port,
  offsetY,
  showLabel,
  onPointerDown
}: {
  port: NodePortSpec;
  offsetY: number;
  showLabel: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className="absolute left-full flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap"
      style={{ top: offsetY }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onPointerDown(event);
      }}
    >
      <span className="-ml-[5px]">
        <PortDot isFilled={false} isInteractive />
      </span>
      <span
        className={clsx(
          'flex items-center gap-1 pl-1.5 text-[10px] font-medium text-neutral-mediumOnSurface transition-opacity',
          showLabel ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      >
        <span className="text-neutral-lowOnSurface">{PORT_TYPE_ICON[port.type]}</span>
        {port.label}
      </span>
    </div>
  );
}

/**
 * 卡片内的可编辑文本框。
 * 必须挡住 pointerdown：否则一点进去就变成拖拽卡片，光标进不来。
 */
function PromptField({
  value,
  placeholder,
  rows,
  onChange
}: {
  value: string;
  placeholder: string;
  rows: number;
  onChange: (text: string) => void;
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      placeholder={placeholder}
      spellCheck={false}
      onPointerDown={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.value)}
      className="w-full resize-none bg-transparent text-[13px] leading-[18px] text-neutral-highOnSurface outline-none placeholder:text-neutral-lowOnSurface"
    />
  );
}

function NodeBody({
  node,
  isHovered,
  videoRotation = 0,
  isEnhanced = false,
  onTextChange,
  onOpenEditor,
  onStoryboardGenerate,
  onOperationGenerate,
  onVariationEvent
}: {
  node: CanvasNode;
  isHovered: boolean;
  /** 悬浮工具条的「Rotate」：视频在卡片里转的角度。 */
  videoRotation?: number;
  /** 悬浮工具条的「Enhance」：叠加一层画质增强滤镜。 */
  isEnhanced?: boolean;
  onTextChange: (text: string) => void;
  onOpenEditor: (nodeId: string) => void;
  onStoryboardGenerate: (nodeId: string, text?: string) => void;
  onOperationGenerate: (nodeId: string) => void;
  onVariationEvent: (nodeId: string, event: VariationEvent) => void;
}) {
  const config = NODE_KIND_CONFIG[node.kind];

  if (config.body === 'product-images') {
    return <ProductImagesBody />;
  }
  if (config.body === 'brand-kit') {
    return <BrandKitBody />;
  }
  if (config.body === 'product-brief') {
    // Brief 内容在上滚动，variation planner 钉在卡底：先说清什么该变，再谈生成
    return (
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <ProductBriefBody />
        </div>
        <BriefVariationPlanner node={node} onEvent={(event) => onVariationEvent(node.id, event)} />
      </div>
    );
  }
  if (config.body === 'strategy') {
    return <StrategyBody node={node} onEvent={(event) => onVariationEvent(node.id, event)} />;
  }
  if (config.body === 'variation-set') {
    return <VariationSetBody node={node} onEvent={(event) => onVariationEvent(node.id, event)} />;
  }
  if (config.body === 'tiktok-trend') {
    return <TikTokTrendBody initialTrendId={node.trendId} />;
  }
  if (config.body === 'storyboard') {
    return <StoryboardBody node={node} onGenerate={onStoryboardGenerate} />;
  }
  if (config.body === 'audio-clips') {
    return <AudioClipsBody />;
  }

  // 脚本卡：9:16 配图在上，描述文案在下（可编辑、可滚动）
  if (config.body === 'script-card') {
    return (
      <>
        <div className="flex aspect-[9/16] w-full items-center justify-center overflow-hidden rounded-xl bg-neutral-surface1">
          {node.assetUrl ? (
            <img src={node.assetUrl} alt={node.title} className="size-full object-cover" draggable={false} />
          ) : (
            <span className="text-[12px] font-medium text-neutral-lowOnSurface">{node.title}</span>
          )}
        </div>
        <ScrollArea className="mt-2 h-[86px] rounded-lg bg-neutral-surface1 px-2 py-1.5">
          <PromptField
            value={node.text ?? ''}
            rows={4}
            placeholder={config.hint ?? 'Describe this beat…'}
            onChange={onTextChange}
          />
        </ScrollArea>
      </>
    );
  }

  if (config.body === 'media') {
    return (
      <>
        <div
          className={clsx(
            'relative flex items-center justify-center overflow-hidden rounded-xl',
            // 视频铺满卡片内容区（9:16 竖版占满全宽）；图片保持原有固定高度
            node.videoUrl ? 'aspect-[9/16] w-full bg-neutral-fillHigh' : ['h-[136px] w-full', config.placeholder]
          )}
        >
          {node.videoUrl ? (
            // 真实视频产物：可直接播放，封面用 assetUrl；拦住 pointerdown 才能操作播放条
            <video
              src={node.videoUrl}
              poster={node.assetUrl}
              controls
              muted
              playsInline
              loop
              preload="metadata"
              onPointerDown={(event) => event.stopPropagation()}
              style={{
                transform: videoRotation ? `rotate(${videoRotation}deg)` : undefined,
                filter: isEnhanced ? 'contrast(1.06) saturate(1.12) brightness(1.02)' : undefined
              }}
              className="size-full object-cover transition-transform"
            />
          ) : node.assetUrl ? (
            <img src={node.assetUrl} alt={node.title} className="size-full object-cover" />
          ) : (
            <span className="text-[12px] font-medium text-neutral-mediumOnSurface">{node.title}</span>
          )}
          {/* 悬停时的剪辑入口，点开进全屏编辑器 */}
          {node.kind === 'video' && isHovered ? (
            <button
              type="button"
              title="Open the editor"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onOpenEditor(node.id)}
              className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full bg-neutral-fillHigh/85 px-3.5 py-1.5 text-[12px] font-semibold text-neutral-onFill shadow-[0_4px_12px_rgba(16,24,40,0.30)] transition-transform hover:scale-105"
            >
              <KsIconCut size={13} />
              Edit
            </button>
          ) : null}
        </div>
        {/* 已产出真实视频的卡片不再显示提示词框，编辑走两个剪辑入口 */}
        {!node.videoUrl ? (
          <div className="mt-2 rounded-lg bg-neutral-surface1 px-2 py-1.5">
            <PromptField
              value={node.text ?? ''}
              rows={2}
              placeholder="Describe what to generate…"
              onChange={onTextChange}
            />
          </div>
        ) : null}
        {node.kind === 'video' ? (
          // 生成配置：模型 / 时长 / 画幅 / 剪辑入口
          <div className="mt-2 flex items-center gap-1" onPointerDown={(event) => event.stopPropagation()}>
            <button
              type="button"
              title="Select model"
              className="flex h-6 min-w-0 flex-1 items-center gap-0.5 rounded-full bg-neutral-surface1 px-1.5 text-[9px] font-medium text-neutral-highOnSurface transition-colors hover:bg-neutral-surface2"
            >
              <span className="truncate">Dreamina Seedance 2.5</span>
              <KsIconChevronDown size={9} className="shrink-0" />
            </button>
            <button
              type="button"
              title="Duration"
              className="flex h-6 shrink-0 items-center gap-0.5 rounded-full bg-neutral-surface1 px-1.5 text-[9px] font-medium tabular-nums text-neutral-highOnSurface transition-colors hover:bg-neutral-surface2"
            >
              30s
              <KsIconChevronDown size={9} />
            </button>
            <button
              type="button"
              title="Aspect ratio"
              className="flex h-6 shrink-0 items-center gap-0.5 rounded-full bg-neutral-surface1 px-1.5 text-[9px] font-medium tabular-nums text-neutral-highOnSurface transition-colors hover:bg-neutral-surface2"
            >
              9:16
              <KsIconChevronDown size={9} />
            </button>
            <button
              type="button"
              title="Open editor"
              onClick={() => onOpenEditor(node.id)}
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-surface1 text-neutral-highOnSurface transition-colors hover:bg-neutral-surface2"
            >
              <KsIconCut size={11} />
            </button>
          </div>
        ) : null}
      </>
    );
  }

  if (config.body === 'audio') {
    return (
      <>
        <div className="flex h-[60px] w-full items-center justify-center gap-[3px] rounded-xl bg-neutral-surface2 px-3">
        {WAVEFORM_BARS.map((height, index) => (
          <span
            // 波形只是静态装饰，没有可用于 key 的业务标识
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            className="w-[3px] rounded-full bg-primary-fill/40"
            style={{ height }}
          />
        ))}
        </div>
        <div className="mt-2 rounded-lg bg-neutral-surface1 px-2 py-1.5">
          <PromptField
            value={node.text ?? ''}
            rows={2}
            placeholder="Script to speak…"
            onChange={onTextChange}
          />
        </div>
      </>
    );
  }

  if (config.body === 'operation') {
    return (
      <div className="rounded-xl bg-neutral-surface1 p-2" onPointerDown={(event) => event.stopPropagation()}>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-lowOnSurface">Inputs</div>
        <input
          value={node.text ?? ''}
          placeholder={config.description}
          onChange={(event) => onTextChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onOperationGenerate(node.id);
            }
          }}
          className="w-full bg-transparent text-[12px] leading-[17px] text-neutral-highOnSurface outline-none placeholder:text-neutral-mediumOnSurface"
        />
      </div>
    );
  }

  if (config.body === 'batch') {
    return (
      <div className="rounded-xl bg-neutral-surface1 p-1.5">
        {BATCH_PREVIEW_ITEMS.map((item) => (
          <div key={item} className="flex items-center gap-1.5 rounded-md px-1 py-1">
            <span className="size-4 shrink-0 rounded-sm bg-gradient-to-br from-primary-surface2 to-neutral-surface2" />
            <span className="truncate text-[11px] text-neutral-mediumOnSurface">{item}</span>
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between border-t border-solid border-neutral-fillLow px-1 pt-1.5">
          <span className="truncate text-[10px] text-neutral-lowOnSurface">Connect more nodes or upload</span>
        </div>
      </div>
    );
  }

  if (config.body === 'timeline') {
    return (
      <div className="rounded-xl bg-neutral-surface1 p-2">
        {/* 两条轨道缩影，点开才是完整的时间线编辑器 */}
        {['video', 'audio'].map((track) => (
          <div key={track} className="mb-1.5 flex h-6 items-center gap-0.5 last:mb-0">
            <span className="w-8 shrink-0 text-[9px] uppercase text-neutral-lowOnSurface">{track}</span>
            <span className="h-full flex-1 rounded-sm bg-gradient-to-r from-primary-surface2 to-neutral-surface2" />
          </div>
        ))}
        <div className="mt-1 text-[10px] text-neutral-lowOnSurface">Double-click to open editor</div>
      </div>
    );
  }

  return (
    <PromptField
      value={node.text ?? ''}
      rows={4}
      placeholder={config.hint ?? 'Type here…'}
      onChange={onTextChange}
    />
  );
}

/** 卡片底部的运行入口 + 状态/错误说明。 */
function RunFooter({ node, onRun }: { node: CanvasNode; onRun: (nodeId: string) => void }) {
  const isRunning = node.status === 'generating';
  return (
    <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-3 pb-2">
      <span className="min-w-0 flex-1 truncate text-[10px] text-neutral-lowOnSurface" title={node.error || node.note}>
        {node.error || node.note}
      </span>
      <button
        type="button"
        title="Run this node"
        disabled={isRunning}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => onRun(node.id)}
        className={clsx(
          'flex size-6 shrink-0 items-center justify-center rounded-full transition-colors',
          isRunning
            ? 'cursor-not-allowed bg-neutral-surface2 text-neutral-lowOnSurface'
            : 'bg-primary-fill text-neutral-onFill hover:opacity-90'
        )}
      >
        <KsIconArrowRight size={13} />
      </button>
    </div>
  );
}

function NodeCard({
  node,
  edges,
  isSelected,
  isHovered,
  isSoleSelection,
  isConnecting,
  connectingType,
  onHoverChange,
  onPointerDown,
  onOutputPointerDown,
  onInputPointerUp,
  onOpenAddPanel,
  showAddButton,
  onResizePointerDown,
  onDropOnCard,
  onOpenEditor,
  onRunTool,
  onRun,
  onTextChange,
  onStoryboardGenerate,
  onOperationGenerate,
  onVariationEvent,
  isEditing,
  onExitEditor,
  onDuplicate,
  onDelete
}: NodeCardProps) {
  const config = NODE_KIND_CONFIG[node.kind];
  /** 端口与操作条只在 hover / 选中 / 正在连线时露出，画布才不会显得杂乱。 */
  const isActive = isHovered || isSelected || isConnecting;
  const lastOutputIndex = config.outputs.length - 1;

  const rootRef = useRef<HTMLDivElement>(null);
  // 视频卡片工具条的就地操作状态：旋转角度 + 画质增强开关
  const [videoRotation, setVideoRotation] = useState(0);
  const [isEnhanced, setIsEnhanced] = useState(false);

  const findVideo = () => rootRef.current?.querySelector('video') ?? null;

  /** 抽帧：抓当前画面写进 canvas 存 PNG；跨域素材取不了帧就退回下载封面。 */
  const extractFrame = () => {
    const video = findVideo();
    if (!video) {
      return;
    }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 720;
      canvas.height = video.videoHeight || 1280;
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `${node.title || 'frame'}.png`;
      link.click();
    } catch {
      if (node.assetUrl) {
        const link = document.createElement('a');
        link.href = node.assetUrl;
        link.download = `${node.title || 'frame'}.jpg`;
        link.target = '_blank';
        link.click();
      }
    }
  };

  const downloadVideo = () => {
    if (!node.videoUrl) {
      return;
    }
    const link = document.createElement('a');
    link.href = node.videoUrl;
    link.download = `${node.title || 'video'}.mp4`;
    link.target = '_blank';
    link.rel = 'noopener';
    link.click();
  };

  return (
    <div
      ref={rootRef}
      className="absolute"
      style={{ left: node.x, top: node.y, width: node.width, height: getNodeHeight(node) }}
      onPointerEnter={() => onHoverChange(node.id)}
      onPointerLeave={() => onHoverChange(null)}
      onPointerUp={() => onDropOnCard(node.id)}
      onDoubleClick={() => onOpenEditor(node.id)}
      data-node-kind={node.kind}
      data-node-id={node.id}
    >
      {/* 卡片外的名字行（Flora 风格）：图标 + 名字挂在卡片左上角外侧。
          hover/选中时这块位置让给操作条，避免两者叠在一起。 */}
      {isHovered || isSoleSelection ? null : (
        <div className="pointer-events-none absolute bottom-full left-0 mb-1.5 flex max-w-full items-center gap-1.5 text-neutral-mediumOnSurface">
          <span className="shrink-0">
            <NodeKindIcon kind={node.kind} size={13} />
          </span>
          <span className="truncate text-[12px] font-medium">{node.title}</span>
          {node.status === 'generating' ? (
            <span className="size-3 shrink-0 animate-spin rounded-full border-2 border-solid border-neutral-fillMedHigh border-t-primary-fill" />
          ) : null}
        </div>
      )}

      {isEditing ? (
        // 剪辑模式：菜单只剩一个动作——退出编辑
        <EditingModeToolbar onExit={onExitEditor} />
      ) : isHovered || isSoleSelection ? (
        node.kind === 'video' && node.videoUrl ? (
          <VideoHoverToolbar
            onExtractFrame={extractFrame}
            onToggleEnhance={() => setIsEnhanced((on) => !on)}
            isEnhanced={isEnhanced}
            onSeparateAudio={() => onRunTool(node.id, 'split-av')}
            onRotate={() => setVideoRotation((deg) => (deg + 90) % 360)}
            onOpenEditor={() => onOpenEditor(node.id)}
            onEditorPrompt={(prompt) => onOpenEditor(node.id, { prompt })}
            onEditorDraw={() => onOpenEditor(node.id, { draw: true })}
            onDownload={downloadVideo}
            onFullscreen={() => void findVideo()?.requestFullscreen()}
            onDuplicate={() => onDuplicate(node.id)}
            onDelete={() => onDelete(node.id)}
          />
        ) : (
          <NodeHoverToolbar
            onRunTool={(kind) => onRunTool(node.id, kind)}
            onDuplicate={() => onDuplicate(node.id)}
            onDelete={() => onDelete(node.id)}
          />
        )
      ) : null}

      <div
        className={clsx(
          'flex size-full flex-col overflow-hidden rounded-2xl border bg-neutral-surface transition-shadow',
          isSelected ? 'border-primary-fill shadow-[0_10px_30px_rgba(16,24,40,0.16)]' : 'border-neutral-fillLow shadow-[0_1px_3px_rgba(16,24,40,0.10)] hover:shadow-[0_4px_12px_rgba(16,24,40,0.12)]'
        )}
        onPointerDown={(event) => onPointerDown(event, node.id)}
      >
        <div className="min-h-0 flex-1 px-3 pb-9 pt-3">
          <NodeBody
            node={node}
            isHovered={isHovered}
            videoRotation={videoRotation}
            isEnhanced={isEnhanced}
            onTextChange={(text) => onTextChange(node.id, text)}
            onStoryboardGenerate={onStoryboardGenerate}
            onOpenEditor={onOpenEditor}
            onOperationGenerate={onOperationGenerate}
            onVariationEvent={onVariationEvent}
          />
        </div>

        <RunFooter
          node={node}
          onRun={
            config.body === 'operation'
              ? onOperationGenerate
              : config.body === 'storyboard'
                ? (nodeId) => onStoryboardGenerate(nodeId)
                : config.body === 'strategy'
                  ? (nodeId) => onVariationEvent(nodeId, { type: 'expand-strategy' })
                  : config.body === 'variation-set'
                    ? (nodeId) => onVariationEvent(nodeId, { type: 'toggle-expanded' })
                    : onRun
          }
        />
      </div>

      {/* 端口常驻可见，标签只在 hover/选中/拉线时浮现 */}
      {config.inputs.map((port, index) => (
        <InputRow
          key={port.id}
          port={port}
          used={countInputConnections(edges, node.id, port.id)}
          offsetY={getPortOffsetY(index, config.inputs.length, node)}
          showLabel={isActive}
          isCandidate={connectingType === port.type}
          onPointerUp={(event) => onInputPointerUp(event, node.id, port.id)}
        />
      ))}

      {config.outputs.map((port, index) => (
        <OutputRow
          key={port.id}
          port={port}
          offsetY={getPortOffsetY(index, config.outputs.length, node)}
          showLabel={isActive && config.outputs.length > 1}
          onPointerDown={(event) => onOutputPointerDown(event, node.id, port.id)}
        />
      ))}

      {/* ⊕：从最后一个输出往下挂，点开可直接添加下游节点；多选时顶层统一渲染一个，这里就不重复了 */}
      {isActive && showAddButton ? (
        <button
          type="button"
          title="Add connected node"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onOpenAddPanel(node.id, config.outputs[lastOutputIndex]?.id ?? 'out')}
          className="absolute left-full z-20 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-solid border-neutral-fillLow bg-neutral-surface text-neutral-mediumOnSurface shadow-[0_1px_3px_rgba(16,24,40,0.10)] transition-colors hover:border-primary-fill hover:text-primary-fill"
          style={{
            top: getPortOffsetY(lastOutputIndex, config.outputs.length, node) + PORT_ROW_HEIGHT,
            marginLeft: 10
          }}
        >
          <KsIconPlus size={14} />
        </button>
      ) : null}

      {/* 右下角缩放把手：hover / 选中时露出，拖动改宽高 */}
      {isActive ? (
        <div
          title="Drag to resize"
          onPointerDown={(event) => onResizePointerDown(event, node.id)}
          className="absolute -bottom-1 -right-1 z-20 flex size-4 cursor-nwse-resize items-end justify-end rounded-br-lg p-[3px]"
        >
          <span className="block size-full rounded-[2px] border-b-2 border-r-2 border-solid border-neutral-fillMedHigh" />
        </div>
      ) : null}
    </div>
  );
}

export default NodeCard;
