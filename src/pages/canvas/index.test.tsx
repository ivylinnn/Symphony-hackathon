/* eslint-disable max-lines-per-function */
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

import { CATEGORY_LABEL, KINDS_BY_CATEGORY, LIBRARY_ASSETS, NODE_KIND_CONFIG } from './const';
import CanvasPage from './index';
import type { CanvasNodeKind } from './types';

/* 画布测试不打真实接口：在 service 边界上挡住 @/api（它带 ESM 依赖，jest 无法转译）。 */
const mockRunNode = jest.fn(() => Promise.resolve({ text: 'generated copy' }));
jest.mock('./services/node-runner', () => ({
  runNode: (...args: unknown[]) => mockRunNode(...(args as [])),
  fetchLibraryAssets: () => Promise.resolve([]),
  NodeNotWiredError: class NodeNotWiredError extends Error {}
}));

const mockBuildScriptGraph = jest.fn(() =>
  Promise.resolve({
    sections: [
      { kind: 'hook', text: 'generated hook' },
      { kind: 'body', text: 'generated body' },
      { kind: 'cta', text: 'generated cta' }
    ],
    reply: 'Built a HOOK → BODY → CTA script for Serum and wired the nodes together.'
  })
);
jest.mock('./services/agent', () => ({
  buildScriptGraph: () => mockBuildScriptGraph()
}));

const mockNavigate = jest.fn();
jest.mock('@edenx/runtime/router', () => ({
  useNavigate: () => mockNavigate
}));

let container: HTMLDivElement,
 root: Root;

/* 与仓库其他组件测试一致，直接用 createRoot + act，不引入 @testing-library/react。 */
const renderCanvas = () => {
  act(() => {
    root.render(<CanvasPage />);
  });
};

const query = (selector: string) => container.querySelector<HTMLElement>(selector);

const clickByTitle = (title: string) => {
  const button = query(`[title="${title}"]`);
  if (!button) {
    throw new Error(`button not found: ${title}`);
  }
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

/** hover 才会渲染端口行和卡片操作条，这里模拟指针进入某个节点。 */
const hoverNode = (kind: CanvasNodeKind) => {
  const card = query(`[data-node-kind="${kind}"]`);
  if (!card) {
    throw new Error(`node card not found: ${kind}`);
  }
  act(() => {
    card.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    card.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
  });
};

/** 按 data-node-kind 统计画布上的节点卡片，避免受卡片内文案重复影响。 */
const countNodes = (kind: CanvasNodeKind) => container.querySelectorAll(`[data-node-kind="${kind}"]`).length;

/** 双击进入内联编辑模式：坞随镜头推近同步滑入，状态是同步落位的。 */
const openEditorByDblClick = (kind: CanvasNodeKind) => {
  act(() => {
    query(`[data-node-kind="${kind}"]`)?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });
};

beforeAll(() => {
  // jsdom 不实现 PointerEvent / 指针捕获
  if (typeof window.PointerEvent === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).PointerEvent = MouseEvent;
  }
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
});

beforeEach(() => {
  mockNavigate.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe('CanvasPage', () => {
  it('seeds the canvas with product images, brand kit and product brief', () => {
    renderCanvas();

    // 首屏三张种子卡：产品图 + 品牌资产两路汇入 Product brief
    expect(countNodes('product-images')).toBe(1);
    expect(countNodes('brand-kit')).toBe(1);
    expect(countNodes('product-brief')).toBe(1);
    expect(container.querySelectorAll('svg path').length).toBeGreaterThan(0);
  });

  it('keeps every node kind behind the + button, including the Edit category', () => {
    renderCanvas();

    expect(query('[title="Add Hook node"]')).toBeNull();

    clickByTitle('Add node');

    [
      ...KINDS_BY_CATEGORY['ads-native'],
      ...KINDS_BY_CATEGORY.creative,
      ...KINDS_BY_CATEGORY.variations,
      ...KINDS_BY_CATEGORY.edit
    ].forEach((kind) => {
      expect(query(`[title="Add ${NODE_KIND_CONFIG[kind].label} node"]`)).not.toBeNull();
    });

    const text = container.textContent ?? '';
    expect(text).toContain(CATEGORY_LABEL['ads-native']);
    expect(text).toContain(CATEGORY_LABEL.creative);
    expect(text).toContain(CATEGORY_LABEL.variations);
    expect(text).toContain(CATEGORY_LABEL.edit);
  });

  it('plans variations on the brief and proposes three creative directions', () => {
    renderCanvas();
    clickByTitle('Add node');
    clickByTitle('Add Product brief node');

    // planner 钉在 brief 底部，展开后是显式的「什么该变」控制
    act(() => {
      query('[data-variation-planner-toggle]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(query('[data-variation-planner]')).not.toBeNull();

    // Explore：先提三条创意方向，而不是直接砸六个随机产物
    jest.useFakeTimers();
    act(() => {
      query('[data-variation-explore]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      jest.advanceTimersByTime(3500);
    });
    jest.useRealTimers();

    expect(countNodes('strategy')).toBe(3);
  });

  it('expands a strategy into a collapsed variation set with controls', () => {
    renderCanvas();
    clickByTitle('Add node');
    clickByTitle('Add Product brief node');
    act(() => {
      query('[data-variation-planner-toggle]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    jest.useFakeTimers();
    act(() => {
      query('[data-variation-explore]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      jest.advanceTimersByTime(3500);
    });

    // 展开第一条方向 → 生成中的变体集容器 → 落满变体卡
    act(() => {
      query('[data-strategy-expand]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(countNodes('variation-set')).toBe(1);
    act(() => {
      jest.advanceTimersByTime(3500);
    });
    jest.useRealTimers();

    // 默认收起：迷你预览在、完整卡不在；展开后出现完整卡与 Keep/Vary 控制
    expect(query('[data-variation-card]')).toBeNull();
    act(() => {
      query('[data-variation-set-toggle]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(query('[data-variation-card]')).not.toBeNull();
    expect(query('[data-variation-controls]')).not.toBeNull();
    expect(container.textContent).toContain('Keep constant');
  });

  it('splits audio into BGM and numbered voiceover tracks', () => {
    const outputs = NODE_KIND_CONFIG['split-tracks'].outputs.map((port) => port.label);

    expect(outputs).toEqual(['BGM', 'Voiceover 1', 'Voiceover 2']);
    // Split A/V 把视频拆成静音视频 + 音频两路输出
    expect(NODE_KIND_CONFIG['split-av'].outputs.map((port) => port.type)).toEqual(['video', 'audio']);
  });

  it('opens the asset library from the toolbar and drops the picked asset on the canvas', () => {
    renderCanvas();

    const before = countNodes('image');
    clickByTitle('Add assets from library');

    const asset = LIBRARY_ASSETS.find((item) => item.kind === 'image');
    expect(asset).toBeDefined();

    clickByTitle(`Add ${asset?.name} to canvas`);
    expect(countNodes('image')).toBe(before + 1);
  });

  it('shows the hover toolbar with tools only when the card is hovered', () => {
    renderCanvas();

    expect(query('[title="Tools"]')).toBeNull();

    hoverNode('video');
    expect(query('[title="Tools"]')).not.toBeNull();
    expect(query('[title="Duplicate node"]')).not.toBeNull();
  });

  it('adds an edit node downstream when a tool is run from the hover toolbar', () => {
    renderCanvas();
    hoverNode('video');

    const before = countNodes('split-av');
    clickByTitle('Tools');
    clickByTitle('Split A/V');

    expect(countNodes('split-av')).toBe(before + 1);
  });

  it('exposes labelled input rows on hover', () => {
    renderCanvas();
    hoverNode('video');

    // Video 节点的四个输入端口都带 已用/上限；seed 图里 Image 和 Video 各接了一条
    const text = container.textContent ?? '';
    expect(text).toContain('Prompt0/1');
    expect(text).toContain('Image1/9');
    expect(text).toContain('Video1/3');
    expect(text).toContain('Audio0/3');
  });

  it('adds a connected node from the card + button', () => {
    renderCanvas();
    hoverNode('hook');

    const before = countNodes('image');
    clickByTitle('Add connected node');
    clickByTitle('Add Image node');

    expect(countNodes('image')).toBe(before + 1);
  });

  it('collapses the agent panel into a FAB and restores it', () => {
    renderCanvas();

    expect(query('aside textarea')).not.toBeNull();

    clickByTitle('Collapse agent panel');
    expect(query('aside textarea')).toBeNull();
    expect(query('[title="Open agent"]')).not.toBeNull();

    clickByTitle('Open agent');
    expect(query('aside textarea')).not.toBeNull();
  });

  it('connects two nodes manually by dragging from an output port onto a card', () => {
    renderCanvas();

    const edgesBefore = container.querySelectorAll('svg path').length;

    // 从 CTA 的输出端口拉线，落到 Split Tracks 卡片上（不必精确命中端口）
    hoverNode('cta');
    const outputPort = container.querySelectorAll('[data-node-kind="cta"] .cursor-crosshair')[0];
    expect(outputPort).toBeDefined();

    act(() => {
      outputPort.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    act(() => {
      query('[data-node-kind="split-tracks"]')?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    });

    expect(container.querySelectorAll('svg path').length).toBe(edgesBefore + 1);
  });

  it('opens the node panel when a dragged line is released on empty canvas', () => {
    renderCanvas();

    const nodesBefore = countNodes('image');
    const edgesBefore = container.querySelectorAll('svg path').length;

    // 从 CTA 输出端口拉线，甩到画布空白处松手
    hoverNode('cta');
    const outputPort = container.querySelectorAll('[data-node-kind="cta"] .cursor-crosshair')[0];
    act(() => {
      outputPort.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    act(() => {
      query('[data-canvas-surface]')?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    });

    // 面板在落点弹出，选一个节点即在该处新建并接上来源
    expect(query('[title="Add Image node"]')).not.toBeNull();
    clickByTitle('Add Image node');

    expect(countNodes('image')).toBe(nodesBefore + 1);
    expect(container.querySelectorAll('svg path').length).toBe(edgesBefore + 1);
  });

  it('shows port dots without hovering so lines can be started anywhere', () => {
    renderCanvas();

    // 端口常驻可见：未 hover 也能找到可拉线的输出端口
    expect(container.querySelectorAll('[data-node-kind="hook"] .cursor-crosshair').length).toBeGreaterThan(0);
  });

  it('lets you type a prompt into a text node', () => {
    renderCanvas();

    const card = query('[data-node-kind="hook"]');
    const textarea = card?.querySelector('textarea') as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();

    // 受控组件：直接改 value 后派发 input，React 才收得到
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    act(() => {
      setter?.call(textarea, 'a punchy new hook');
      textarea?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect((query('[data-node-kind="hook"]')?.querySelector('textarea') as HTMLTextAreaElement)?.value).toBe(
      'a punchy new hook'
    );
  });

  it('gives media and audio nodes their own prompt field', () => {
    renderCanvas();

    expect(query('[data-node-kind="image"] textarea')).not.toBeNull();
    expect(query('[data-node-kind="video"] textarea')).not.toBeNull();
  });

  it('does not drag the card when the pointer goes down in the prompt field', () => {
    renderCanvas();

    const card = query('[data-node-kind="hook"]');
    const before = card?.style.left;

    act(() => {
      card?.querySelector('textarea')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    act(() => {
      query('[data-canvas-surface]')?.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, clientX: 400, clientY: 400 })
      );
    });

    // 在输入框里按下不应该带着卡片跑
    expect(query('[data-node-kind="hook"]')?.style.left).toBe(before);
  });

  it('adds the Batch node from the Edit category', () => {
    renderCanvas();

    const before = countNodes('batch');
    clickByTitle('Add node');
    clickByTitle('Add Batch node');

    expect(countNodes('batch')).toBe(before + 1);
    expect(NODE_KIND_CONFIG.batch.category).toBe('edit');
  });

  it('enters the in-canvas edit mode by double-clicking a Timeline node', () => {
    renderCanvas();

    // 先从面板加一个 Timeline 节点
    clickByTitle('Add node');
    clickByTitle('Add Timeline node');
    expect(query('[data-edit-dock-agent]')).toBeNull();
    expect(query('[data-edit-dock-timeline]')).toBeNull();

    openEditorByDblClick('timeline');

    // 编辑模式不再整页接管：右侧是统一的 Creative agent，底部是时间线轨道，画布仍在
    const agentPanel = query('[data-creative-agent]');
    expect(agentPanel).not.toBeNull();
    expect(agentPanel?.textContent).toContain('Creative agent');
    expect(agentPanel?.textContent).toContain('is on the timeline');
    const timelineDock = query('[data-edit-dock-timeline]');
    expect(timelineDock).not.toBeNull();
    expect(query('[title="Play"]')).not.toBeNull();
    expect(query('[title="Split clip at playhead"]')).not.toBeNull();
    expect(query('[data-node-kind="timeline"]')).not.toBeNull();
  });

  it('closes the in-canvas edit mode', () => {
    renderCanvas();
    clickByTitle('Add node');
    clickByTitle('Add Timeline node');
    openEditorByDblClick('timeline');

    clickByTitle('Close editor');
    // 时间线收起；Creative agent 面板保留，回到画布对话
    expect(query('[data-edit-dock-timeline]')).toBeNull();
    expect(query('[data-creative-agent]')?.textContent).not.toContain('is on the timeline');
  });

  it('builds a connected Hook/Body/CTA script from an agent prompt', async () => {
    renderCanvas();

    const hooksBefore = countNodes('hook');
    const edgesBefore = container.querySelectorAll('svg path').length;

    const composer = query('aside textarea') as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    act(() => {
      setter?.call(composer, 'Build a 15s ad for the serum');
      composer.dispatchEvent(new Event('input', { bubbles: true }));
    });

    act(() => {
      query('[title="Send"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // 让 agent 的 promise 链跑完
    await act(() => Promise.resolve());

    expect(mockBuildScriptGraph).toHaveBeenCalled();
    // 三个脚本节点落到画布，并且首尾相连
    expect(countNodes('hook')).toBe(hooksBefore + 1);
    expect(countNodes('body')).toBe(2);
    expect(countNodes('cta')).toBe(2);
    expect(container.querySelectorAll('svg path').length).toBe(edgesBefore + 2);
    // agent 的回复替换掉了 "Writing the script…" 占位
    expect(container.textContent).toContain('wired the nodes together');
    expect(container.textContent).not.toContain('Writing the script…');
  });

  it('surfaces the agent error instead of leaving the placeholder', async () => {
    mockBuildScriptGraph.mockRejectedValueOnce(new Error('script service unavailable'));
    renderCanvas();

    const composer = query('aside textarea') as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    act(() => {
      setter?.call(composer, 'anything');
      composer.dispatchEvent(new Event('input', { bubbles: true }));
    });

    act(() => {
      query('[title="Send"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // 让 agent 的 promise 链跑完
    await act(() => Promise.resolve());

    expect(container.textContent).toContain('script service unavailable');
  });

  it('marquee-selects nodes and shows the selection toolbar', () => {
    renderCanvas();

    expect(query('[data-selection-toolbar]')).toBeNull();

    const surface = query('[data-canvas-surface]');
    act(() => {
      surface?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));
    });
    // jsdom 下 getBoundingClientRect 全 0，视口即世界坐标，拉一个足够大的框罩住所有节点
    act(() => {
      surface?.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 5000, clientY: 5000 }));
    });
    expect(query('[data-marquee]')).not.toBeNull();

    act(() => {
      surface?.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 5000, clientY: 5000 }));
    });

    // 框选结束后矩形消失，工具栏出现并报出数量
    expect(query('[data-marquee]')).toBeNull();
    const toolbar = query('[data-selection-toolbar]');
    expect(toolbar).not.toBeNull();
    expect(toolbar?.textContent).toContain('selected');
  });

  it('deletes every selected node in one click', () => {
    renderCanvas();

    const before = container.querySelectorAll('[data-node-kind]').length;
    expect(before).toBeGreaterThan(1);

    const surface = query('[data-canvas-surface]');
    act(() => {
      surface?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));
    });
    act(() => {
      surface?.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 5000, clientY: 5000 }));
    });
    act(() => {
      surface?.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 5000, clientY: 5000 }));
    });

    clickByTitle('Delete');

    expect(container.querySelectorAll('[data-node-kind]').length).toBe(0);
    // 全删之后工具栏也应该收起
    expect(query('[data-selection-toolbar]')).toBeNull();
  });

  it('duplicates the whole selection from the toolbar', () => {
    renderCanvas();

    const surface = query('[data-canvas-surface]');
    act(() => {
      surface?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));
    });
    act(() => {
      surface?.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 5000, clientY: 5000 }));
    });
    act(() => {
      surface?.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 5000, clientY: 5000 }));
    });

    const before = container.querySelectorAll('[data-node-kind]').length;
    clickByTitle('Duplicate');

    expect(container.querySelectorAll('[data-node-kind]').length).toBe(before * 2);
  });

  it('exits the canvas through the close button', () => {
    renderCanvas();

    clickByTitle('Close canvas');

    expect(mockNavigate).toHaveBeenCalledWith('/create');
  });
});
