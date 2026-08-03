/**
 * 把编辑 agent 的 prompt 接到用户自己的 Claude 账号上。
 *
 * BYOK（bring your own key）：API key 由用户在界面里粘贴，只存当前浏览器的
 * localStorage，不进仓库、不进构建产物 —— 公网站点里内嵌密钥等于把账号送人。
 * 请求直接从浏览器打到 Anthropic Messages API（官方 CORS 通道，靠
 * `anthropic-dangerous-direct-browser-access` 头开启），用 forced tool call
 * 拿回和本地 stub 完全同构的 WireAgentReply，后续校验、预览、版本机制全部复用。
 */

const STORAGE_KEY = 'symphony.anthropic-key';
const MODEL = 'claude-sonnet-5';

export const getClaudeKey = (): string | null => {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export const setClaudeKey = (key: string | null) => {
  try {
    if (key) {
      window.localStorage.setItem(STORAGE_KEY, key);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* 隐私模式下 localStorage 不可用；连接状态就只活在本次会话里 */
  }
};

/** 回复必须命中的 schema —— 和 stub 的 WireAgentReply 一一对应。 */
const REPLY_SCHEMA = {
  type: 'object',
  required: ['Kind', 'Thinking', 'Summary'],
  properties: {
    Kind: { enum: ['plan', 'question'] },
    Thinking: {
      type: 'array',
      items: {
        type: 'object',
        required: ['Title', 'Body'],
        properties: { Title: { type: 'string' }, Body: { type: 'string' } }
      }
    },
    Summary: { type: 'string' },
    Operations: {
      type: 'array',
      items: {
        type: 'object',
        required: ['Label', 'Type'],
        properties: {
          Label: { type: 'string' },
          Type: {
            enum: ['set-timing', 'split', 'delete', 'add-clip', 'add-track', 'set-track-flag', 'set-text', 'set-format']
          },
          ClipId: { type: 'string' },
          TrackId: { type: 'string' },
          Start: { type: 'number' },
          Duration: { type: 'number' },
          At: { type: 'number' },
          Flag: { enum: ['visible', 'muted'] },
          Value: { type: 'boolean' },
          Ratio: { enum: ['9:16', '1:1', '16:9', '4:5'] },
          Text: { type: 'string' },
          Clip: {
            type: 'object',
            required: ['ClipId', 'Label', 'Start', 'Duration'],
            properties: {
              ClipId: { type: 'string' },
              Label: { type: 'string' },
              Start: { type: 'number' },
              Duration: { type: 'number' },
              HasAudio: { type: 'boolean' },
              Text: { type: 'string' },
              SourceUrl: { type: 'string' }
            }
          },
          Track: {
            type: 'object',
            required: ['TrackId', 'Kind', 'Clips'],
            properties: {
              TrackId: { type: 'string' },
              Kind: { enum: ['video', 'transition', 'audio', 'caption', 'graphics'] },
              Visible: { type: 'boolean' },
              Muted: { type: 'boolean' },
              Clips: { type: 'array' }
            }
          }
        }
      }
    },
    Question: { type: 'string' },
    Options: { type: 'array', items: { type: 'string' } },
    Suggestions: { type: 'array', items: { type: 'string' } }
  }
} as const;

const SYSTEM_PROMPT = `You are the editing agent inside Symphony, a short-form ad video editor. You receive the current timeline as JSON (tracks of clips with ids, labels, start/duration in seconds, optional on-screen Text) plus the user's instruction, and you reply with ONE call to the "reply" tool.

Rules:
- Operations must be atomic and minimal. Only reference ClipId/TrackId values that exist in the timeline, except when creating new clips/tracks — then invent unique ids like "claude-clip-1".
- set-timing retimes one clip (Start/Duration). split needs At (absolute seconds inside the clip). set-text rewrites a clip's on-screen Text (captions/graphics only; graphics copy is UPPERCASE). add-track needs a full Track with Clips. set-format changes canvas Ratio.
- After deleting a clip, pull later clips earlier with set-timing to close the gap.
- Thinking: 2-4 steps with short Titles and concrete Bodies that cite real timings/labels.
- If the instruction is too vague to act on, use Kind "question" with 2-3 Options phrased as direct answers.
- Suggestions: exactly 3 short next-step actions in the ad-editing context (e.g. "Add captions", "Swap the product", "Resize for feed"), never repeating what was just done.
- Summary: one sentence, past tense, saying what the plan does.`;

interface ClaudeArgs {
  prompt: string;
  playhead: number;
  tracks: unknown;
  intake?: unknown;
  target?: unknown;
}

/** 直连 Messages API；抛错交由调用方回落到本地 planner。 */
export async function planWithClaude(args: ClaudeArgs, apiKey: string): Promise<unknown> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      tools: [{ name: 'reply', description: 'Return the editing agent reply.', input_schema: REPLY_SCHEMA }],
      tool_choice: { type: 'tool', name: 'reply' },
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            instruction: args.prompt,
            playheadSeconds: args.playhead,
            timeline: args.tracks,
            ...(args.intake ? { brief: args.intake } : {}),
            ...(args.target ? { selectedElement: args.target } : {})
          })
        }
      ]
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Claude API ${response.status}${detail ? ` — ${detail.slice(0, 140)}` : ''}`);
  }

  const data = (await response.json()) as { content?: Array<{ type: string; input?: unknown }> };
  const toolUse = data.content?.find((block) => block.type === 'tool_use');
  if (!toolUse?.input) {
    throw new Error('Claude returned no tool call');
  }
  return toolUse.input;
}
