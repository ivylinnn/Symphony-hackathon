/** Stub of `@/api/bff-gen/t2v` — text→video generation tasks. */
import { delay, placeholderImage } from '../../placeholder';

let seq = 0;

export async function createGenerationTask(_args: {
  prompt?: string;
  model?: string;
  duration?: number;
}): Promise<{ task_id: string }> {
  await delay(500);
  seq += 1;
  return { task_id: `t2v-demo-${seq}` };
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
        previewLink: placeholderImage('Final cut', '#7c3aed', '#2f6bff'),
      },
    ],
  };
}
