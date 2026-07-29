/** Stub of `@edenx/runtime/router` — only `useNavigate` is used by the canvas. */
export const useNavigate = () => (to: string) => {
  // No router in the standalone demo; the canvas Close button targets '/create'.
  // eslint-disable-next-line no-console
  console.info('[demo] navigate ->', to);
};
