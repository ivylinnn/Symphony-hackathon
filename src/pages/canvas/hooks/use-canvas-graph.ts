import { useCallback, useState } from 'react';

import { NODE_KIND_CONFIG } from '../const';
import { appendEdge, buildNode, buildNodeAtCenter, buildScriptNodes, createId } from '../graph-ops';
import type { AdsNativeNodeKind, CanvasEdge, CanvasNode, CanvasNodeKind, EditNodeKind, LibraryAsset } from '../types';
import { findMatchingInput } from '../utils';
import { useCanvasBulkOps } from './use-canvas-bulk-ops';
import { useCanvasConnections } from './use-canvas-connections';
import { useNodeExecution } from './use-node-execution';

/** 新节点相对来源节点向右偏移的距离。 */
const DOWNSTREAM_GAP = 120;

/** 复制节点时的错位量，避免和原节点完全重叠。 */
const DUPLICATE_OFFSET = 32;


/**
 * 画布图数据的增删改。
 * 从页面组件里拆出来，避免 index.tsx 同时扛交互和数据两件事。
 */
export const useCanvasGraph = () => {
  // 画布从空态开始：首屏由内容策略弹层引导，选中策略后落一张预置工作流
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);

  /** 把一组预构建的节点和连线整体落到画布上（内容策略模板用）。 */
  const addPrebuiltGraph = useCallback((newNodes: CanvasNode[], newEdges: CanvasEdge[]) => {
    setNodes((current) => [...current, ...newNodes]);
    setEdges((current) => [...current, ...newEdges]);
  }, []);

  /** 在指定世界坐标上新增节点，坐标按卡片尺寸居中。 */
  const addNodeAt = useCallback((kind: CanvasNodeKind, centerX: number, centerY: number, title?: string) => {
    const node = buildNodeAtCenter(kind, centerX, centerY, title);
    setNodes((current) => [...current, node]);
    return node.id;
  }, []);

  /** 在来源节点右侧新增节点并自动连线。 */
  const addConnectedNode = useCallback((sourceId: string, sourceOutput: string, kind: CanvasNodeKind) => {
    setNodes((currentNodes) => {
      const source = currentNodes.find((node) => node.id === sourceId);
      if (!source) {
        return currentNodes;
      }

      const matched = findMatchingInput(source.kind, sourceOutput, kind);
      const node = buildNode(kind, source.x + source.width + DOWNSTREAM_GAP, source.y);

      if (matched) {
        setEdges((currentEdges) => appendEdge(currentEdges, sourceId, sourceOutput, node.id, matched.id));
      }
      return [...currentNodes, node];
    });
  }, []);

  /**
   * 在指定世界坐标新建节点并从来源连过去。
   * 用于「从端口拉线甩到空白处」——落点就是新节点的位置。
   */
  const addConnectedNodeAt = useCallback(
    (sourceId: string, sourceOutput: string, kind: CanvasNodeKind, centerX: number, centerY: number) => {
      setNodes((currentNodes) => {
        const source = currentNodes.find((node) => node.id === sourceId);
        if (!source) {
          return currentNodes;
        }
        const matched = findMatchingInput(source.kind, sourceOutput, kind);
        const node = buildNodeAtCenter(kind, centerX, centerY);
        if (matched) {
          setEdges((currentEdges) => appendEdge(currentEdges, sourceId, sourceOutput, node.id, matched.id));
        }
        return [...currentNodes, node];
      });
    },
    []
  );

  /** Tools 菜单里的编辑动作：在下游挂一个 Edit 节点。 */
  const runTool = useCallback(
    (sourceId: string, kind: EditNodeKind) => {
      const source = nodes.find((node) => node.id === sourceId);
      if (!source) {
        return;
      }
      addConnectedNode(sourceId, NODE_KIND_CONFIG[source.kind].outputs[0]?.id ?? 'out', kind);
    },
    [addConnectedNode, nodes]
  );

  /**
   * Agent 产出的脚本骨架落到画布；返回新建的节点 id，供调用方选中/定位。
   */
  const addScriptSections = useCallback(
    (sections: Array<{ kind: AdsNativeNodeKind; text: string }>, centerX: number, centerY: number) => {
      const built = buildScriptNodes(sections, centerX, centerY);
      if (built.nodes.length === 0) {
        return [];
      }
      setNodes((current) => [...current, ...built.nodes]);
      setEdges((current) => [...current, ...built.edges]);
      return built.nodes.map((node) => node.id);
    },
    []
  );

  /** 素材库条目落到画布上，直接生成对应类型的节点；带真实地址的素材直接可见。 */
  const addAssetNode = useCallback((asset: LibraryAsset, centerX: number, centerY: number) => {
    const node = buildNodeAtCenter(asset.kind, centerX, centerY, asset.name);
    if (asset.url && asset.kind !== 'audio') {
      node.assetUrl = asset.url;
      node.status = 'done';
    }
    setNodes((current) => [...current, node]);
    return node.id;
  }, []);

  const { connect, connectToBestInput } = useCanvasConnections({ nodes, setEdges });

  const patchNode = useCallback((nodeId: string, patch: Partial<CanvasNode>) => {
    setNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)));
  }, []);

  const executeNode = useNodeExecution({ nodes, edges, patchNode });

  const moveNode = useCallback((nodeId: string, x: number, y: number) => {
    setNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, x, y } : node)));
  }, []);

  const duplicateNode = useCallback((nodeId: string) => {
    setNodes((current) => {
      const source = current.find((node) => node.id === nodeId);
      if (!source) {
        return current;
      }
      return [
        ...current,
        { ...source, id: createId('node'), x: source.x + DUPLICATE_OFFSET, y: source.y + DUPLICATE_OFFSET }
      ];
    });
  }, []);

  const removeNode = useCallback((nodeId: string) => {
    setNodes((current) => current.filter((node) => node.id !== nodeId));
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
  }, []);

  const { removeNodes, duplicateNodes } = useCanvasBulkOps({ setNodes, setEdges });

  return {
    nodes,
    edges,
    addPrebuiltGraph,
    addNodeAt,
    addConnectedNode,
    addConnectedNodeAt,
    addScriptSections,
    addAssetNode,
    runTool,
    connect,
    connectToBestInput,
    executeNode,
    patchNode,
    moveNode,
    duplicateNode,
    duplicateNodes,
    removeNode,
    removeNodes
  };
};
