import { generateScript } from '@/api';
import { ScriptType, VideoDurationLen } from '@/api/typings';

import type { AdsNativeNodeKind } from '../types';
import { resolveScriptContext } from './products';

/** Agent 生成出来的一段脚本，直接对应一个 Ads-native 节点。 */
export interface ScriptSection {
  kind: AdsNativeNodeKind;
  text: string;
}

export interface AgentBuildResult {
  sections: ScriptSection[];
  /** 回给用户的一句话，说明这次做了什么。 */
  reply: string;
}

const KIND_BY_SCRIPT_TYPE: Partial<Record<ScriptType, AdsNativeNodeKind>> = {
  [ScriptType.HOOK]: 'hook',
  [ScriptType.USP]: 'body',
  [ScriptType.CTA]: 'cta'
};

/** 脚本骨架的固定顺序，保证画布上从上到下是 Hook → Body → CTA。 */
const SECTION_ORDER: AdsNativeNodeKind[] = ['hook', 'body', 'cta'];

/**
 * 让 Agent 根据一句话需求生成一条广告脚本骨架。
 * 用平台已有的 generateScript：它本来就按 HOOK / USP / CTA 分段返回，
 * 正好一段对应画布上的一个 Ads-native 节点。
 */
export const buildScriptGraph = async (prompt: string): Promise<AgentBuildResult> => {
  const context = await resolveScriptContext(prompt);
  if (!context) {
    return {
      sections: [],
      reply: "I need a product first — save one in your product library and I'll write the script around it."
    };
  }

  const resp = await generateScript({
    needNum: 1,
    productName: context.productName,
    description: context.description,
    price: context.price,
    duration: VideoDurationLen.DURATION_15,
    language: 'en'
  });

  const script = resp?.Scripts?.[0]?.Script ?? [];
  if (script.length === 0) {
    return { sections: [], reply: 'The script model came back empty. Try again, or give me more detail.' };
  }

  // 同一类型可能返回多段，合并成一个节点的文案
  const byKind = new Map<AdsNativeNodeKind, string[]>();
  script.forEach((item) => {
    const kind = KIND_BY_SCRIPT_TYPE[item.Type];
    if (!kind || !item.Content) {
      return;
    }
    byKind.set(kind, [...(byKind.get(kind) ?? []), item.Content]);
  });

  const sections = SECTION_ORDER.filter((kind) => byKind.has(kind)).map((kind) => ({
    kind,
    text: (byKind.get(kind) ?? []).join('\n').trim()
  }));

  if (sections.length === 0) {
    return { sections: [], reply: 'The script came back without Hook / Body / CTA sections, so I left the canvas as is.' };
  }

  return {
    sections,
    reply: `Built a ${sections.map((section) => section.kind.toUpperCase()).join(' → ')} script for ${
      context.productName
    } and wired the nodes together.`
  };
};
