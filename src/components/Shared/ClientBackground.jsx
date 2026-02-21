/**
 * ClientBackground - Full-width hero image with dissolve effect
 *
 * Renders a fixed background image at the top of the viewport
 * that fades to transparent as it goes down, with an accent-tinted
 * gradient overlay for brand cohesion.
 */

export default function ClientBackground({ imageUrl }) {
  // Show a subtle accent gradient even without an image
  if (!imageUrl) {
    return (
      <div
        className="animate-fade"
        style={{
          position: "absolute",
          top: -60,
          left: 0,
          width: "100vw",
          height: "500px",
          zIndex: 0,
          pointerEvents: "none",
          background: `linear-gradient(180deg, var(--accent-dim) 0%, transparent 100%)`,
        }}
      />
    );
  }

  return (
    <div
      className="animate-fade"
      style={{
        position: "absolute",
        top: -60,
        left: 0,
        width: "100vw",
        height: "600px",
        zIndex: 0,
        pointerEvents: "none",

        // Background image
        backgroundImage: `url(${imageUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat",

        // Dissolve effect with accent-tinted fade
        maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 20%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.25) 80%, rgba(0,0,0,0) 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 20%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.25) 80%, rgba(0,0,0,0) 100%)",
      }}
    />
  );
}
