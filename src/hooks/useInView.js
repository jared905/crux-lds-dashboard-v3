import { useState, useEffect, useRef } from 'react';

/**
 * Returns a ref and a boolean indicating whether the element is in the viewport.
 * Once triggered, stays true (no re-triggering on scroll out and back).
 *
 * @param {object} options - IntersectionObserver options (threshold, rootMargin, etc.)
 */
export function useInView(options = {}) {
  const ref = useRef(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.unobserve(el); // Only trigger once
        }
      },
      { threshold: 0.1, ...options }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, isInView];
}
