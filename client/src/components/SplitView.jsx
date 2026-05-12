import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '../lib/utils.js';

export default function SplitView({ mode, left, right }) {
  const [ratio, setRatio] = useState(() => {
    const saved = localStorage.getItem('kratos_split_ratio');
    return saved ? parseFloat(saved) : 0.5;
  });
  const containerRef = useRef(null);
  const dragging = useRef(false);

  useEffect(() => {
    localStorage.setItem('kratos_split_ratio', String(ratio));
  }, [ratio]);

  const updateRatio = useCallback((clientX, clientY) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const newRatio = mode === 'horizontal'
      ? (clientX - rect.left) / rect.width
      : (clientY - rect.top) / rect.height;
    setRatio(Math.max(0.15, Math.min(0.85, newRatio)));
  }, [mode]);

  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;

    const onMouseMove = (e) => {
      if (!dragging.current) return;
      updateRatio(e.clientX, e.clientY);
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [updateRatio]);

  const onTouchStart = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;

    const onTouchMove = (e) => {
      if (!dragging.current) return;
      const t = e.touches[0];
      updateRatio(t.clientX, t.clientY);
    };

    const onTouchEnd = () => {
      dragging.current = false;
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };

    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
  }, [updateRatio]);

  if (mode === 'terminal-only') {
    return <div className="flex-1 min-h-0">{left}</div>;
  }

  const isHorizontal = mode === 'horizontal';

  return (
    <div
      ref={containerRef}
      className={cn('flex flex-1 min-h-0', isHorizontal ? 'flex-row' : 'flex-col')}
    >
      <div
        className="overflow-hidden"
        style={isHorizontal
          ? { width: `${ratio * 100}%`, minWidth: 0 }
          : { height: `${ratio * 100}%`, minHeight: 0 }
        }
      >
        {left}
      </div>

      <div
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        className={cn(
          'shrink-0 bg-border hover:bg-ring transition-colors touch-none',
          isHorizontal ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'
        )}
      />

      <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
        {right}
      </div>
    </div>
  );
}
