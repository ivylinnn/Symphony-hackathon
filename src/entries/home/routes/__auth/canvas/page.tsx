import CanvasPage from '@/pages/canvas';

/**
 * 画布是全幅沉浸式页面：不进 WithNavLayout，因此没有全局侧边导航，
 * 退出入口由画布左上角的关闭按钮提供。
 */
export default function CanvasPageRoute() {
  return (
    <main className="relative min-h-0 flex-1 bg-neutral-surface1" style={{ height: '100%', width: '100%' }}>
      <CanvasPage />
    </main>
  );
}
