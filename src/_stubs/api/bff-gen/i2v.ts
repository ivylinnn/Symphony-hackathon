/** Stub of `@/api/bff-gen/i2v` — image→video / image→image generation tasks. */
import { delay, placeholderImage } from '../../placeholder';

let seq = 0;

export async function createGenerationTask(_args: {
  image?: string;
  prompt?: string;
  model?: string;
  duration?: number;
}): Promise<{ task_id: string }> {
  await delay(500);
  seq += 1;
  return { task_id: `i2v-demo-${seq}` };
}

export async function genI2IImage(_args: {
  images?: string[];
  prompt?: string;
  model?: string;
  num?: number;
}): Promise<{ task_id: string }> {
  await delay(500);
  seq += 1;
  return { task_id: `i2i-demo-${seq}` };
}

export async function checkGenTask(_args: { taskId: string }): Promise<{
  draft_infos: Array<Record<string, unknown>>;
}> {
  await delay(450);
  return {
    draft_infos: [
      {
        draftTaskStatus: 'SUCCESS',
        renderTaskStatus: 'SUCCESS',
        vid: 'demo',
        previewLink: placeholderImage('Generated', '#2f6bff', '#7c3aed'),
      },
    ],
  };
}
