/** Stub of `@edenx/runtime/router` — only `useNavigate` is used by the canvas. */
export const useNavigate = () => (to: string) => {
  // 画布的关闭按钮跳 '/create'；demo 里把它落回首页，其余路径按 hash 路由处理。
  window.location.hash = to === '/create' || to === '/' ? '#/' : `#${to}`;
};
