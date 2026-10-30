import React from "react";

// Cartoon burger drawn as inline SVG (no image files needed). Swap for your own picture any time.
export function BurgerLineArt({ className = "" }: { className?: string }) {
  const line = { fill: "none", stroke: "#4a2a12", strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 200 175" className={className} aria-hidden="true">
      <path d="M24 138 H176 Q176 164 150 164 H50 Q24 164 24 138 Z" {...line} />
      <rect x="16" y="112" width="168" height="26" rx="13" {...line} />
      <path d="M22 100 H178 L162 124 L144 102 L112 126 L86 102 L52 124 Z" {...line} />
      <rect x="24" y="86" width="152" height="14" rx="7" {...line} />
      <path d="M14 70 H186 V80 Q176 92 166 82 Q156 92 146 82 Q136 92 126 82 Q116 92 106 82 Q96 92 86 82 Q76 92 66 82 Q56 92 46 82 Q36 92 26 82 Q16 90 14 80 Z" {...line} />
      <path d="M20 70 Q20 14 100 14 Q180 14 180 70 Z" {...line} />
      <g {...line} strokeWidth={2.5}>
        <path d="M56 38 l8 -3" /><path d="M88 28 l8 2" /><path d="M120 36 l8 -2" />
        <path d="M142 52 l7 3" /><path d="M72 56 l8 2" /><path d="M108 52 l8 -3" />
      </g>
    </svg>
  );
}

export function BurgerArt({ className = "" }: { className?: string }) {
  const outline = { stroke: "#4a2a12", strokeWidth: 5, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 200 175" className={className} role="img" aria-label="Burger illustration">
      {/* bottom bun */}
      <path d="M24 138 H176 Q176 164 150 164 H50 Q24 164 24 138 Z" fill="#f2a33a" {...outline} />
      {/* patty */}
      <rect x="16" y="112" width="168" height="28" rx="14" fill="#7a3e1d" {...outline} />
      {/* cheese */}
      <path d="M22 100 H178 L162 124 L144 102 L112 126 L86 102 L52 124 Z" fill="#ffd23f" {...outline} />
      {/* tomato */}
      <rect x="24" y="86" width="152" height="16" rx="8" fill="#e8402a" {...outline} />
      {/* lettuce */}
      <path
        d="M14 70 H186 V80 Q176 92 166 82 Q156 92 146 82 Q136 92 126 82 Q116 92 106 82 Q96 92 86 82 Q76 92 66 82 Q56 92 46 82 Q36 92 26 82 Q16 90 14 80 Z"
        fill="#7bc043"
        {...outline}
      />
      {/* top bun */}
      <path d="M20 70 Q20 14 100 14 Q180 14 180 70 Z" fill="#f2a33a" {...outline} />
      {/* sesame seeds */}
      <g fill="#fff3c4">
        <ellipse cx="60" cy="38" rx="5" ry="2.5" transform="rotate(-20 60 38)" />
        <ellipse cx="92" cy="28" rx="5" ry="2.5" transform="rotate(10 92 28)" />
        <ellipse cx="124" cy="36" rx="5" ry="2.5" transform="rotate(-10 124 36)" />
        <ellipse cx="146" cy="52" rx="5" ry="2.5" transform="rotate(25 146 52)" />
        <ellipse cx="76" cy="56" rx="5" ry="2.5" transform="rotate(15 76 56)" />
        <ellipse cx="112" cy="52" rx="5" ry="2.5" transform="rotate(-25 112 52)" />
      </g>
    </svg>
  );
}