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

/** 节点类型图标，供 "+" 面板和卡片头部复用。 */
export const NODE_KIND_ICON: Record<CanvasNodeKind, ReactNode> = {
  hook: <KsIconTips size={ICON_SIZE} />,
  body: <KsIconCampaignList size={ICON_SIZE} />,
  cta: <KsIconSend size={ICON_SIZE} />,
  text: <KsIconTextFile size={ICON_SIZE} />,
  image: <KsIconImageCollection size={ICON_SIZE} />,
  video: <KsIconVideoClip size={ICON_SIZE} />,
  audio: <KsIconSound size={ICON_SIZE} />,
  avatar: <KsIconPeople size={ICON_SIZE} />,
  import: <KsIconUpload size={ICON_SIZE} />,
  'split-av': <KsIconSplit size={ICON_SIZE} />,
  'split-tracks': <KsIconSeperateAudio size={ICON_SIZE} />,
  timeline: <KsIconShowTimeline size={ICON_SIZE} />,
  batch: <KsIconCampaignList size={ICON_SIZE} />
};
