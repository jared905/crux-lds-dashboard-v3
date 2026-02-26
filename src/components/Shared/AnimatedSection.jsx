import { useInView } from "../../hooks/useInView.js";

/**
 * Wraps children with a fade-slide-up entrance animation
 * triggered when the element scrolls into view.
 */
export default function AnimatedSection({ children, delay = 0, className = "" }) {
  const [ref, isInView] = useInView();
  return (
    <div
      ref={ref}
      className={isInView ? `animate-in ${className}` : className}
      style={{
        ...(!isInView ? { opacity: 0 } : {}),
        animationDelay: `${delay}s`,
      }}
    >
      {children}
    </div>
  );
}
