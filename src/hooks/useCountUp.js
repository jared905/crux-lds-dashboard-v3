import { useState, useEffect, useRef } from 'react';

/**
 * Animates a number from 0 to the target value with easeOutCubic easing.
 * Returns the current animated value.
 *
 * @param {number} target - The final number to animate to
 * @param {number} duration - Animation duration in ms (default 800)
 * @param {boolean} enabled - Whether to animate (false = show target immediately)
 */
export function useCountUp(target, duration = 800, enabled = true) {
  const [value, setValue] = useState(enabled ? 0 : target);
  const prevTarget = useRef(target);
  const frameRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      setValue(target);
      return;
    }

    // If target changed, animate from current value to new target
    const startValue = prevTarget.current !== target ? 0 : value;
    prevTarget.current = target;

    if (target === 0) {
      setValue(0);
      return;
    }

    const start = performance.now();

    const animate = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      // easeOutCubic: decelerating curve
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(startValue + (target - startValue) * eased));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration, enabled]);

  return value;
}
