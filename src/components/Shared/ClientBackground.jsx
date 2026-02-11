/**
 * ClientBackground - Full-width hero image with dissolve effect
 *
 * Renders a fixed background image at the top of the viewport
 * that fades to transparent as it goes down, allowing content
 * to scroll over it.
 */

export default function ClientBackground({ imageUrl }) {
  if (!imageUrl) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: -60,
        left: 0,
        width: "100vw",
        height: "600px",
        zIndex: 0,
        pointerEvents: "none", // Allow clicks to pass through

        // Background image
        backgroundImage: `url(${imageUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat",

        // Dissolve effect - subtle at top (behind header), stronger in the hero zone, fades at bottom
        maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.55) 20%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.25) 80%, rgba(0,0,0,0) 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.55) 20%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.25) 80%, rgba(0,0,0,0) 100%)",
      }}
    />
  );
}
