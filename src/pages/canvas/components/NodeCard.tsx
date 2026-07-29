import { KsIconArrowRight, KsIconPlus } from '@fe-infra/keystone-icons-react';
import clsx from 'clsx';
import type React from 'react';

import { BATCH_PREVIEW_ITEMS, NODE_KIND_CONFIG, PORT_ROW_HEIGHT } from '../const';
import type { CanvasEdge, CanvasNode, EditNodeKind, NodePortSpec, PortType } from '../types';
import { countInputConnections, getPortOffsetY } from '../utils';
import NodeHoverToolbar from './NodeHoverToolbar';
import { PORT_TYPE_ICON } from './nodeIcons';

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
  /** 在卡片任意位置松手：自动挑一个类型匹配的输入完成连线。 */
  onDropOnCard: (nodeId: string) => void;
  onOpenEditor: (nodeId: string) => void;
  onRunTool: (nodeId: string, kind: EditNodeKind) => void;
  /** 执行本节点，调用平台的生成能力。 */
  onRun: (nodeId: string) => void;
  /** 编辑卡片内容（prompt / 文案）。 */
  onTextChange: (nodeId: string, text: string) => void;
  onDuplicate: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
}

/** 固定的一组波形高度，避免每帧随机导致重渲染时跳动。 */
const WAVEFORM_BARS = [8, 16, 24, 14, 30, 20, 11, 26, 18, 9, 22, 28, 13, 19, 25, 10, 17, 23, 12, 27];

function StatusChip({ status }: { status: CanvasNode['status'] }) {
  if (status === 'generating') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-primary-surface2 px-2 py-0.5 text-[10px] font-medium text-primary-onSurface">
        <span className="size-1.5 animate-pulse rounded-full bg-primary-fill" />
        Generating
      </span>
    );
  }
  if (status === 'done') {
    return (
      <span className="rounded-full bg-neutral-surface2 px-2 py-0.5 text-[10px] font-medium text-success-onSurface">
        Ready
      </span>
    );
  }
  return (
    <span className="rounded-full bg-neutral-surface2 px-2 py-0.5 text-[10px] font-medium text-neutral-lowOnSurface">
      Idle
    </span>
  );
}

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

function NodeBody({ node, onTextChange }: { node: CanvasNode; onTextChange: (text: string) => void }) {
  const config = NODE_KIND_CONFIG[node.kind];

  if (config.body === 'media') {
    return (
      <>
        <div
          className={clsx(
            'flex h-[136px] w-full items-center justify-center overflow-hidden rounded-xl',
            config.placeholder
          )}
        >
          {node.assetUrl ? (
            <img src={node.assetUrl} alt={node.title} className="size-full object-cover" />
          ) : (
            <span className="text-[12px] font-medium text-neutral-mediumOnSurface">{node.title}</span>
          )}
        </div>
        <div className="mt-2 rounded-lg bg-neutral-surface1 px-2 py-1.5">
          <PromptField
            value={node.text ?? ''}
            rows={2}
            placeholder="Describe what to generate…"
            onChange={onTextChange}
          />
        </div>
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
      <div className="rounded-xl bg-neutral-surface1 p-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-lowOnSurface">Inputs</div>
        <p className="line-clamp-3 text-[12px] leading-[17px] text-neutral-mediumOnSurface">{config.description}</p>
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
  onDropOnCard,
  onOpenEditor,
  onRunTool,
  onRun,
  onTextChange,
  onDuplicate,
  onDelete
}: NodeCardProps) {
  const config = NODE_KIND_CONFIG[node.kind];
  const isAdsNative = config.category === 'ads-native';
  const isEdit = config.category === 'edit';
  /** 端口与操作条只在 hover / 选中 / 正在连线时露出，画布才不会显得杂乱。 */
  const isActive = isHovered || isSelected || isConnecting;
  const lastOutputIndex = config.outputs.length - 1;

  return (
    <div
      className="absolute"
      style={{ left: node.x, top: node.y, width: node.width, height: config.height }}
      onPointerEnter={() => onHoverChange(node.id)}
      onPointerLeave={() => onHoverChange(null)}
      onPointerUp={() => onDropOnCard(node.id)}
      onDoubleClick={() => onOpenEditor(node.id)}
      data-node-kind={node.kind}
    >
      {isHovered || isSoleSelection ? (
        <NodeHoverToolbar
          onRunTool={(kind) => onRunTool(node.id, kind)}
          onDuplicate={() => onDuplicate(node.id)}
          onDelete={() => onDelete(node.id)}
        />
      ) : null}

      <div
        className={clsx(
          'size-full overflow-hidden rounded-2xl border bg-neutral-surface transition-shadow',
          isSelected ? 'border-primary-fill shadow-[0_10px_30px_rgba(16,24,40,0.16)]' : 'border-neutral-fillLow shadow-[0_1px_3px_rgba(16,24,40,0.10)] hover:shadow-[0_4px_12px_rgba(16,24,40,0.12)]'
        )}
        onPointerDown={(event) => onPointerDown(event, node.id)}
      >
        {/* Ads-native 顶部主色条，Edit 顶部虚线感的浅色条，画布上一眼可分 */}
        {isAdsNative ? <span className="absolute inset-x-0 top-0 h-[3px] bg-primary-fill" /> : null}
        {isEdit ? <span className="absolute inset-x-0 top-0 h-[3px] bg-primary-surface3" /> : null}

        <div className="flex h-9 items-center justify-between gap-2 px-3">
          <span
            className={clsx(
              'truncate text-[11px] font-semibold uppercase tracking-wide',
              isAdsNative || isEdit ? 'text-primary-onSurface' : 'text-neutral-lowOnSurface'
            )}
          >
            {config.label}
          </span>
          <StatusChip status={node.status} />
        </div>

        <div className="px-3 pb-9">
          <NodeBody node={node} onTextChange={(text) => onTextChange(node.id, text)} />
        </div>

        <RunFooter node={node} onRun={onRun} />
      </div>

      {/* 端口常驻可见，标签只在 hover/选中/拉线时浮现 */}
      {config.inputs.map((port, index) => (
        <InputRow
          key={port.id}
          port={port}
          used={countInputConnections(edges, node.id, port.id)}
          offsetY={getPortOffsetY(index, config.inputs.length, node.kind)}
          showLabel={isActive}
          isCandidate={connectingType === port.type}
          onPointerUp={(event) => onInputPointerUp(event, node.id, port.id)}
        />
      ))}

      {config.outputs.map((port, index) => (
        <OutputRow
          key={port.id}
          port={port}
          offsetY={getPortOffsetY(index, config.outputs.length, node.kind)}
          showLabel={isActive && config.outputs.length > 1}
          onPointerDown={(event) => onOutputPointerDown(event, node.id, port.id)}
        />
      ))}

      {/* ⊕：从最后一个输出往下挂，点开可直接添加下游节点 */}
      {isActive ? (
        <button
          type="button"
          title="Add connected node"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onOpenAddPanel(node.id, config.outputs[lastOutputIndex]?.id ?? 'out')}
          className="absolute left-full z-20 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-solid border-neutral-fillLow bg-neutral-surface text-neutral-mediumOnSurface shadow-[0_1px_3px_rgba(16,24,40,0.10)] transition-colors hover:border-primary-fill hover:text-primary-fill"
          style={{
            top: getPortOffsetY(lastOutputIndex, config.outputs.length, node.kind) + PORT_ROW_HEIGHT,
            marginLeft: 10
          }}
        >
          <KsIconPlus size={14} />
        </button>
      ) : null}
    </div>
  );
}

export default NodeCard;
