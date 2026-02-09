import type { Spec } from "@json-render/react";
import type { WidgetLayoutItem } from "./storage";

type WidgetKind = "chart" | "table" | "mixed" | "stat" | "other";

const SIZE_MAP: Record<WidgetKind, { w: number; h: number }> = {
  chart: { w: 6, h: 5 },
  table: { w: 12, h: 6 },
  mixed: { w: 12, h: 8 },
  stat: { w: 4, h: 3 },
  other: { w: 6, h: 4 },
};

export function detectWidgetKind(spec: unknown): WidgetKind {
  if (!spec || typeof spec !== "object") return "other";
  const s = spec as Spec;
  if (!s.elements) return "other";

  const elements = Object.values(s.elements);
  const types = new Set(elements.map((el) => el.type));

  const hasChart = types.has("BarChart") || types.has("LineChart");
  const hasTable = types.has("Table");

  if (hasChart && hasTable) return "mixed";
  if (hasChart) return "chart";
  if (hasTable) return "table";

  const hasStatCard = elements.some(
    (el) =>
      el.type === "Card" &&
      (el.props as Record<string, unknown>)?.centered === true,
  );
  if (hasStatCard) return "stat";

  return "other";
}

export function getDefaultWidgetSize(spec: unknown, cols: number = 12): { w: number; h: number } {
  const kind = detectWidgetKind(spec);
  const size = SIZE_MAP[kind];
  return { w: Math.min(size.w, cols), h: size.h };
}

export function generateDefaultLayout(
  widgetIds: string[],
  specMap: Map<string, unknown>,
  cols: number = 12,
): WidgetLayoutItem[] {
  const items: WidgetLayoutItem[] = [];
  let cursorX = 0;
  let cursorY = 0;
  let rowMaxH = 0;

  for (const id of widgetIds) {
    const { w, h } = getDefaultWidgetSize(specMap.get(id), cols);

    if (cursorX + w > cols) {
      cursorX = 0;
      cursorY += rowMaxH;
      rowMaxH = 0;
    }

    items.push({ i: id, x: cursorX, y: cursorY, w, h, minW: 2, minH: 2 });

    cursorX += w;
    rowMaxH = Math.max(rowMaxH, h);
  }

  return items;
}
