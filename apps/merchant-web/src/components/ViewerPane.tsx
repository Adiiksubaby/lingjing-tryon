import type { Measurements } from '@lingjing/shared';
import { mountTryOnViewer, type TryOnGarmentInput, type TryOnViewerHandle } from '@lingjing/tryon-viewer';
import { useEffect, useRef, useState } from 'react';

export function ViewerPane({
  measurements,
  garments,
}: {
  measurements: Measurements;
  garments: TryOnGarmentInput[];
}) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<TryOnViewerHandle | null>(null);
  const [hint, setHint] = useState('正在准备人台…');
  const garmentKey = garments.map((item) => `${item.slot}:${item.id}:${item.url ?? ''}:${item.color}`).join('|');
  const measureKey = JSON.stringify(measurements);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const view = mountTryOnViewer(element, {
      measurements,
      garments,
      onStatus: (status, detail) => {
        if (detail) setHint(detail);
        else if (status === 'loading') setHint('正在加载样衣…');
        else if (status === 'error') setHint('预览失败');
        else setHint('拖拽旋转，滚轮缩放');
      },
    });
    handle.current = view;
    return () => {
      view.dispose();
      handle.current = null;
    };
    // 首次挂载后由下面的 effect 同步后续变化。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    handle.current?.update({ measurements, garments });
  }, [garmentKey, measureKey, measurements, garments]);

  return (
    <div className="stage-wrap">
      <div className="stage" ref={host} />
      <div className="stage-bar">
        <span>{hint}</span>
        <button className="btn ghost" type="button" onClick={() => handle.current?.resetCamera()}>复位视角</button>
      </div>
    </div>
  );
}
