"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { LayoutGrid } from "lucide-react";
import { useWidgetHub } from "@/hooks/use-widget-hub";

export function FlyAnimation() {
  const { flyingWidget, completeFlyAnimation } = useWidgetHub();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !flyingWidget) return null;

  const { sourceRect, title } = flyingWidget;

  // Target: top-right area of viewport (the hub panel)
  const targetX = window.innerWidth - 200;
  const targetY = 100;

  return createPortal(
    <motion.div
      className="fixed pointer-events-none z-50"
      initial={{
        top: sourceRect.top,
        left: sourceRect.left,
        width: sourceRect.width,
        height: Math.min(sourceRect.height, 200),
        opacity: 1,
        scale: 1,
      }}
      animate={{
        top: targetY,
        left: targetX,
        width: 180,
        height: 80,
        opacity: 0,
        scale: 0.6,
      }}
      transition={{
        duration: 0.5,
        ease: [0.4, 0, 0.2, 1],
      }}
      onAnimationComplete={completeFlyAnimation}
    >
      <div className="w-full h-full rounded-xl border border-primary/30 bg-card/90 backdrop-blur-md overflow-hidden shadow-lg shadow-primary/10">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30">
          <LayoutGrid className="size-3 text-primary/60" />
          <span className="text-[10px] font-medium text-foreground/60 truncate">{title}</span>
        </div>
        <div className="p-3 flex items-center justify-center">
          <div className="w-full h-4 rounded bg-primary/10 animate-pulse" />
        </div>
      </div>
    </motion.div>,
    document.body,
  );
}
