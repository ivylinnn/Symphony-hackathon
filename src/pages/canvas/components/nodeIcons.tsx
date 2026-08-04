import {
  KsIconCampaignList,
  KsIconImageCollection,
  KsIconPeople,
  KsIconSend,
  KsIconSeperateAudio,
  KsIconShowTimeline,
  KsIconSound,
  KsIconSplit,
  KsIconTextFile,
  KsIconTips,
  KsIconToolbox,
  KsIconUpload,
  KsIconVideoClip
} from '@fe-infra/keystone-icons-react';
import type { ReactNode } from 'react';

import type { CanvasNodeKind, PortType } from '../types';

const ICON_SIZE = 16;
const PORT_ICON_SIZE = 12;

/** 端口类型图标，用于卡片两侧的输入/输出行。 */
export const PORT_TYPE_ICON: Record<PortType, ReactNode> = {
  prompt: <KsIconTextFile size={PORT_ICON_SIZE} />,
  image: <KsIconImageCollection size={PORT_ICON_SIZE} />,
  video: <KsIconVideoClip size={PORT_ICON_SIZE} />,
  audio: <KsIconSound size={PORT_ICON_SIZE} />
};

type IconComponent = (props: { size?: number }) => ReactNode;

/** 节点类型 → 图标组件；存组件而不是元素，才能按用处渲染成不同尺寸。 */
const NODE_KIND_ICON_COMPONENT: Record<CanvasNodeKind, IconComponent> = {
  hook: KsIconTips,
  body: KsIconCampaignList,
  cta: KsIconSend,
  'product-images': KsIconImageCollection,
  'brand-kit': KsIconToolbox,
  'product-brief': KsIconTextFile,
  'tiktok-trend': KsIconTips,
  storyboard: KsIconShowTimeline,
  'audio-clips': KsIconSound,
  text: KsIconTextFile,
  image: KsIconImageCollection,
  video: KsIconVideoClip,
  audio: KsIconSound,
  avatar: KsIconPeople,
  import: KsIconUpload,
  'split-av': KsIconSplit,
  'split-tracks': KsIconSeperateAudio,
  timeline: KsIconShowTimeline,
  batch: KsIconCampaignList
};

/** 卡片外的名字行、"+" 面板等按需取图标。 */
export function NodeKindIcon({ kind, size = ICON_SIZE }: { kind: CanvasNodeKind; size?: number }) {
  const Icon = NODE_KIND_ICON_COMPONENT[kind];
  return <Icon size={size} />;
}

/** 节点类型图标，供 "+" 面板和素材库复用。 */
export const NODE_KIND_ICON: Record<CanvasNodeKind, ReactNode> = Object.fromEntries(
  (Object.keys(NODE_KIND_ICON_COMPONENT) as CanvasNodeKind[]).map((kind) => [
    kind,
    <NodeKindIcon key={kind} kind={kind} />
  ])
) as Record<CanvasNodeKind, ReactNode>;
