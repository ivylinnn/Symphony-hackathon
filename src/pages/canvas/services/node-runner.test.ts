import type { CanvasNode, CanvasNodeKind } from '../types';

const mockGenerateScript = jest.fn();
const mockGenerateVoiceover = jest.fn();
const mockResolveScriptContext = jest.fn();
const mockGenerateImage = jest.fn();
const mockGenerateVideoFromText = jest.fn();
const mockGenerateVideoFromImage = jest.fn();

jest.mock('@/api', () => ({
  generateScript: (...args: unknown[]) => mockGenerateScript(...args),
  generateVoiceover: (...args: unknown[]) => mockGenerateVoiceover(...args),
  getMyLibrary: jest.fn()
}));
jest.mock('@/api/typings', () => ({
  ScriptType: { HOOK: 1, USP: 2, CTA: 3 },
  VideoDurationLen: { DURATION_15: 1 }
}));
jest.mock('./products', () => ({
  resolveScriptContext: (...args: unknown[]) => mockResolveScriptContext(...args)
}));
jest.mock('./generation', () => ({
  generateImage: (...args: unknown[]) => mockGenerateImage(...args),
  generateVideoFromText: (...args: unknown[]) => mockGenerateVideoFromText(...args),
  generateVideoFromImage: (...args: unknown[]) => mockGenerateVideoFromImage(...args),
  pickAssetUrl: () => 'https://cdn/out.mp4'
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { NodeNotWiredError, runNode } = require('./node-runner');

const makeNode = (kind: CanvasNodeKind, overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: `node-${kind}`,
  kind,
  x: 0,
  y: 0,
  width: 264,
  title: kind,
  status: 'idle',
  ...overrides
});

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveScriptContext.mockResolvedValue({ productName: 'Serum', description: 'hydrating' });
  mockGenerateScript.mockResolvedValue({
    Scripts: [{ Script: [{ Type: 1, Content: 'hook line' }, { Type: 3, Content: 'cta line' }], modelNames: ['gpt'] }]
  });
});

describe('runNode', () => {
  it('sends real product context to the script model and picks the matching section', async () => {
    const result = await runNode(makeNode('hook'), []);

    expect(mockResolveScriptContext).toHaveBeenCalled();
    expect(mockGenerateScript).toHaveBeenCalledWith(
      expect.objectContaining({ productName: 'Serum', description: 'hydrating' })
    );
    // Hook 节点只取 HOOK 段落
    expect(result.text).toBe('hook line');
    expect(result.note).toContain('Serum');
  });

  it('picks the CTA section for a CTA node', async () => {
    const result = await runNode(makeNode('cta'), []);
    expect(result.text).toBe('cta line');
  });

  it('fails with a clear message when the account has no saved product', async () => {
    mockResolveScriptContext.mockResolvedValue(null);
    await expect(runNode(makeNode('text'), [])).rejects.toThrow(/Save a product first/);
    expect(mockGenerateScript).not.toHaveBeenCalled();
  });

  it('uses text-to-video when nothing upstream provides an asset', async () => {
    mockGenerateVideoFromText.mockResolvedValue({});
    const upstream = [makeNode('hook', { text: 'a serum ad' })];

    const result = await runNode(makeNode('video'), upstream);

    expect(mockGenerateVideoFromText).toHaveBeenCalledWith('a serum ad');
    expect(mockGenerateVideoFromImage).not.toHaveBeenCalled();
    expect(result.assetUrl).toBe('https://cdn/out.mp4');
  });

  it('switches to image-to-video when an upstream node produced an asset', async () => {
    mockGenerateVideoFromImage.mockResolvedValue({});
    const upstream = [makeNode('image', { text: 'a serum ad', assetUrl: 'https://cdn/in.png' })];

    await runNode(makeNode('video'), upstream);

    expect(mockGenerateVideoFromImage).toHaveBeenCalledWith('https://cdn/in.png', 'a serum ad');
    expect(mockGenerateVideoFromText).not.toHaveBeenCalled();
  });

  it('requires a reference image before generating an image', async () => {
    await expect(runNode(makeNode('image'), [makeNode('hook', { text: 'prompt' })])).rejects.toThrow(
      /needs a reference/
    );
    expect(mockGenerateImage).not.toHaveBeenCalled();
  });

  it('reports node kinds that have no platform capability instead of faking success', async () => {
    await expect(runNode(makeNode('split-av'), [])).rejects.toBeInstanceOf(NodeNotWiredError);
    await expect(runNode(makeNode('batch'), [])).rejects.toBeInstanceOf(NodeNotWiredError);
  });
});
