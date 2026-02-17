import { useState, useEffect } from "react";

const BREAKPOINTS = {
  mobile: "(max-width: 768px)",
  tablet: "(min-width: 769px) and (max-width: 1024px)",
};

export function useMediaQuery() {
  const [isMobile, setIsMobile] = useState(() =>
    window.matchMedia(BREAKPOINTS.mobile).matches
  );
  const [isTablet, setIsTablet] = useState(() =>
    window.matchMedia(BREAKPOINTS.tablet).matches
  );

  useEffect(() => {
    const mobileQuery = window.matchMedia(BREAKPOINTS.mobile);
    const tabletQuery = window.matchMedia(BREAKPOINTS.tablet);

    const handleMobile = (e) => setIsMobile(e.matches);
    const handleTablet = (e) => setIsTablet(e.matches);

    mobileQuery.addEventListener("change", handleMobile);
    tabletQuery.addEventListener("change", handleTablet);

    return () => {
      mobileQuery.removeEventListener("change", handleMobile);
      tabletQuery.removeEventListener("change", handleTablet);
    };
  }, []);

  return { isMobile, isTablet, isDesktop: !isMobile && !isTablet };
}
