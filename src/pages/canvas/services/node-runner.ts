import { generateScript, generateVoiceover, getMyLibrary } from '@/api';
import { type MyLibraryAsset,ScriptType, VideoDurationLen } from '@/api/typings';

import type { CanvasNode, CanvasNodeKind, LibraryAsset } from '../types';
import { generateImage, generateVideoFromImage, generateVideoFromText, pickAssetUrl } from './generation';
import { resolveScriptContext } from './products';

/**
 * 节点执行结果。
 * text 落到卡片正文，assetUrl 落到媒体预览，两者都可能为空（例如纯编辑节点）。
 */
export interface NodeRunResult {
  text?: string;
  assetUrl?: string;
  /** 展示在卡片上的补充说明，例如用到的模型名。 */
  note?: string;
}

/** 未接后端的节点抛这个，调用方据此把状态标成 idle 并给出说明。 */
export class NodeNotWiredError extends Error {
  constructor(kind: CanvasNodeKind) {
    super(`No backend wired for "${kind}" yet`);
    this.name = 'NodeNotWiredError';
  }
}

/** Ads-native 节点类型 → 平台脚本类型。 */
const SCRIPT_TYPE_BY_KIND: Partial<Record<CanvasNodeKind, ScriptType>> = {
  hook: ScriptType.HOOK,
  body: ScriptType.USP,
  cta: ScriptType.CTA
};

/** 汇总所有上游文本，作为本次生成的 prompt 上下文。 */
export const collectUpstreamText = (node: CanvasNode, upstream: CanvasNode[]) =>
  [node.text, ...upstream.map((item) => item.text)].filter(Boolean).join('\n').trim();

/** 取上游第一张可用的图片/视频产物，作为生成的参考素材。 */
const findUpstreamAsset = (upstream: CanvasNode[]) => upstream.find((item) => item.assetUrl)?.assetUrl;

/**
 * 文本类节点：走平台的 generateScript（LLM）。
 * Hook / Body / CTA 各取脚本里对应的段落，Text 节点取整体。
 */
const runTextNode = async (node: CanvasNode, prompt: string): Promise<NodeRunResult> => {
  // 该接口需要真实商品上下文，否则返回空脚本 —— 先取账号下保存的商品
  const context = await resolveScriptContext(prompt || node.title);
  if (!context) {
    throw new Error('Save a product first — the script model needs product context');
  }

  const resp = await generateScript({
    needNum: 1,
    productName: context.productName,
    description: context.description,
    price: context.price,
    duration: VideoDurationLen.DURATION_15,
    language: 'en'
  });

  const script = resp?.Scripts?.[0];
  if (!script?.Script?.length) {
    throw new Error('The script service returned no content');
  }

  const wanted = SCRIPT_TYPE_BY_KIND[node.kind];
  const matched = wanted ? script.Script.filter((item) => item.Type === wanted) : script.Script;
  const picked = matched.length > 0 ? matched : script.Script;

  return {
    text: picked.map((item) => item.Content).join('\n').trim(),
    note: [context.productName, script.modelNames?.join(', ')].filter(Boolean).join(' · ')
  };
};

/**
 * 音频节点：走平台的 TTS。
 * voiceId / videoId 目前用平台默认值，接入选音色后从节点配置里取。
 */
const runAudioNode = async (prompt: string): Promise<NodeRunResult> => {
  if (!prompt) {
    throw new Error('Connect a text node or type a script first');
  }
  const resp = await generateVoiceover({ script: prompt, voiceId: '', videoId: '' });
  const first = resp?.TtsList?.[0];
  return {
    text: prompt,
    assetUrl: (first as { AudioUrl?: string } | undefined)?.AudioUrl,
    note: resp?.VoiceDuration ? `${resp.VoiceDuration}s` : undefined
  };
};

/** 图片节点：平台的图片生成需要至少一张参考图，从上游取。 */
const runImageNode = async (prompt: string, reference?: string): Promise<NodeRunResult> => {
  if (!reference) {
    throw new Error('Connect an image upstream — image generation needs a reference');
  }
  if (!prompt) {
    throw new Error('Connect a text node or type a prompt first');
  }
  const result = await generateImage([reference], prompt);
  return { assetUrl: pickAssetUrl(result), note: 'nanoBanana' };
};

/** 视频节点：有上游图走图生视频，没有就走文生视频。 */
const runVideoNode = async (prompt: string, reference?: string): Promise<NodeRunResult> => {
  if (!prompt) {
    throw new Error('Connect a text node or type a prompt first');
  }
  const result = reference ? await generateVideoFromImage(reference, prompt) : await generateVideoFromText(prompt);
  return { assetUrl: pickAssetUrl(result), note: reference ? 'seedance · i2v' : 'seedance · t2v' };
};

/** Avatar 节点：本质是带人物参考图的图生视频。 */
const runAvatarNode = async (prompt: string, reference?: string): Promise<NodeRunResult> => {
  if (!reference) {
    throw new Error('Connect an avatar or portrait image upstream');
  }
  const result = await generateVideoFromImage(reference, prompt || 'Talking presenter, natural delivery');
  return { assetUrl: pickAssetUrl(result), note: 'seedance · avatar' };
};

/**
 * 按节点类型分发到平台已有的能力。
 * 没有对应后端能力的类型抛 NodeNotWiredError，由 UI 明确提示，而不是假装成功。
 */
export const runNode = (node: CanvasNode, upstream: CanvasNode[]): Promise<NodeRunResult> => {
  const prompt = collectUpstreamText(node, upstream);
  const reference = findUpstreamAsset(upstream);

  switch (node.kind) {
    case 'hook':
    case 'body':
    case 'cta':
    case 'text':
      return runTextNode(node, prompt);
    case 'audio':
      return runAudioNode(prompt);
    case 'image':
      return runImageNode(prompt, reference);
    case 'video':
      return runVideoNode(prompt, reference);
    case 'avatar':
      return runAvatarNode(prompt, reference);
    default:
      // Import 只承载素材；Split / Timeline / Batch 平台侧暂无对应能力
      return Promise.reject(new NodeNotWiredError(node.kind));
  }
};

/** 平台素材库资产 → 画布节点可消费的形状。 */
const ASSET_KIND_BY_TYPE: Record<string, LibraryAsset['kind']> = {
  image: 'image',
  IMAGE: 'image',
  video: 'video',
  VIDEO: 'video',
  audio: 'audio',
  AUDIO: 'audio',
  avatar: 'avatar',
  AVATAR: 'avatar'
};

const toLibraryAsset = (asset: MyLibraryAsset): LibraryAsset => ({
  id: asset.assetId,
  name: asset.fileName || asset.assetId,
  kind: ASSET_KIND_BY_TYPE[asset.assetType] ?? 'image',
  meta: asset.assetType,
  url: asset.content
});

/** 拉真实素材库；失败时由调用方回退到示例数据。 */
export const fetchLibraryAssets = async (limit = 30): Promise<LibraryAsset[]> => {
  const resp = await getMyLibrary({ limit, offset: 0 });
  const list = (resp as { Assets?: MyLibraryAsset[]; assets?: MyLibraryAsset[] })?.Assets ?? resp?.assets ?? [];
  return list.map(toLibraryAsset);
};
