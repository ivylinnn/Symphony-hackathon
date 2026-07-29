import { listProducts } from '@/api';
import type { SavedProduct } from '@/api/typings';

/**
 * generateScript 需要真实的商品上下文才会返回内容。
 * 这里缓存一次账号下的商品列表，供文本类节点复用。
 */
let cache: Promise<SavedProduct[]> | null = null;

export const fetchProducts = (): Promise<SavedProduct[]> => {
  if (!cache) {
    cache = listProducts({ limit: 20, offset: 0 })
      .then((resp) => resp?.products ?? [])
      .catch(() => []);
  }
  return cache;
};

/** 清掉缓存，商品变更后调用。 */
export const invalidateProducts = () => {
  cache = null;
};

export interface ScriptProductContext {
  productName: string;
  description: string;
  price?: string;
}

/**
 * 组装 generateScript 的商品上下文。
 * 优先用账号里保存的商品；没有商品时退回调用方给的文案，
 * 但这种情况下平台大概率返回空脚本 —— 由调用方给出明确提示。
 */
export const resolveScriptContext = async (fallbackDescription: string): Promise<ScriptProductContext | null> => {
  const products = await fetchProducts();
  const product = products[0];

  if (!product) {
    return null;
  }

  return {
    productName: product.name,
    description: [product.description, fallbackDescription].filter(Boolean).join('\n').trim() || product.name,
    price: product.price ? `${product.price}${product.currency ? ` ${product.currency}` : ''}` : undefined
  };
};
