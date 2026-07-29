import * as i2vApi from '@/api/bff-gen/i2v';
import * as t2vApi from '@/api/bff-gen/t2v';

/** 生成任务的一条产物。 */
interface DraftInfo {
  id?: string;
  vid?: string;
  content?: string;
  coverImage?: string;
  previewLink?: string;
  draftTaskStatus?: string | number;
  renderTaskStatus?: string | number;
  generateErrorMessage?: string;
  renderErrorMessage?: string;
  videoInfo?: { MainURL?: string; main_url?: string } | unknown;
}

interface CheckResult {
  draft_infos?: DraftInfo[];
}

/** 轮询节奏：与 i2v miniapp 一致，先密后疏，超时兜底。 */
const POLL_INTERVAL_MS = 6_000;
const POLL_TIMEOUT_MS = 300_000;

/** 平台任务状态枚举在不同 IDL 里有数字/字符串两种形态，统一按字面量判断。 */
const isFailed = (status?: string | number) => status === 'FAILED' || status === 3;
const isSuccess = (status?: string | number) => status === 'SUCCESS' || status === 2;

/** 所有产物都到达终态（成功或失败）才停止轮询。 */
const shouldStop = (result: CheckResult) => {
  const drafts = result?.draft_infos ?? [];
  if (drafts.length === 0) {
    return false;
  }
  return drafts.every((draft) => {
    if (isFailed(draft.draftTaskStatus) || isFailed(draft.renderTaskStatus)) {
      return true;
    }
    return isSuccess(draft.draftTaskStatus) && Boolean(draft.vid || draft.content || draft.previewLink);
  });
};

/** 从产物里挑一个可以直接展示的地址。 */
export const pickAssetUrl = (result: CheckResult): string | undefined => {
  const draft = result?.draft_infos?.find(
    (item) => item.previewLink || item.content || item.coverImage
  );
  if (!draft) {
    return undefined;
  }
  const info = draft.videoInfo as { MainURL?: string; main_url?: string } | undefined;
  return draft.previewLink || info?.MainURL || info?.main_url || draft.content || draft.coverImage;
};

/** 汇总产物上的失败原因。 */
const collectError = (result: CheckResult) =>
  result?.draft_infos
    ?.map((draft) => draft.generateErrorMessage || draft.renderErrorMessage)
    .filter(Boolean)
    .join('; ');

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * 轮询任务直到终态。
 * check 由调用方注入，因为 t2v / i2v 各有自己的 checkGenTask。
 */
const pollTask = async (taskId: string, check: (taskId: string) => Promise<CheckResult>): Promise<CheckResult> => {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  for (;;) {
    const result = await check(taskId);
    if (shouldStop(result)) {
      const error = collectError(result);
      if (error) {
        throw new Error(error);
      }
      return result;
    }
    if (Date.now() > deadline) {
      throw new Error('Generation timed out');
    }
    await sleep(POLL_INTERVAL_MS);
  }
};

/**
 * 画布默认用的模型；后续接模型选择器时从节点配置里取。
 * 取值与 packages/creative-cue-biz 的 I2VModelType 一致，这里内联常量，
 * 避免把画布绑到那个尚未构建 dist 的 workspace 包上。
 */
export const DEFAULT_MODELS = {
  /** I2VModelType.T2V_Seedance */
  t2v: '5000003',
  /** I2VModelType.I2V_Seedance */
  i2v: '4000003',
  /** I2VModelType.I2I_NanoBanana */
  i2i: 'gemini'
} as const;

const DEFAULT_DURATION_SECONDS = 5;

/** 文生视频。 */
export const generateVideoFromText = async (prompt: string) => {
  const created = await t2vApi.createGenerationTask({
    prompt,
    model: DEFAULT_MODELS.t2v,
    duration: DEFAULT_DURATION_SECONDS
  });
  if (!created?.task_id) {
    throw new Error('Video task was not created');
  }
  return pollTask(created.task_id, (taskId) => t2vApi.checkGenTask({ taskId }) as Promise<CheckResult>);
};

/** 图生视频。 */
export const generateVideoFromImage = async (image: string, prompt: string) => {
  const created = await i2vApi.createGenerationTask({
    image,
    prompt,
    model: DEFAULT_MODELS.i2v,
    duration: DEFAULT_DURATION_SECONDS
  });
  if (!created?.task_id) {
    throw new Error('Video task was not created');
  }
  return pollTask(created.task_id, (taskId) => i2vApi.checkGenTask({ taskId }) as Promise<CheckResult>);
};

/** 图生图；平台的图片生成需要至少一张参考图。 */
export const generateImage = async (images: string[], prompt: string) => {
  const created = await i2vApi.genI2IImage({
    images,
    prompt,
    model: DEFAULT_MODELS.i2i,
    num: 1
  });
  if (!created?.task_id) {
    throw new Error('Image task was not created');
  }
  return pollTask(created.task_id, (taskId) => i2vApi.checkGenTask({ taskId }) as Promise<CheckResult>);
};
