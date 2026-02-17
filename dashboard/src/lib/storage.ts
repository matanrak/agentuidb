import { dbQuery } from "@/lib/db-client";

export interface SavedWidget {
  id: string;
  title: string;
  spec: unknown;
  collections: string[];
  order: number;
  created_at: string;
}

export async function loadWidgets(): Promise<SavedWidget[]> {
  const [rows] = await dbQuery<[SavedWidget[]]>(
    'SELECT id, title, spec, collections, "order", created_at FROM widgets ORDER BY "order" ASC'
  );
  return rows ?? [];
}

export async function saveWidget(widget: SavedWidget): Promise<void> {
  await dbQuery(
    `INSERT INTO widgets (id, title, spec, collections, "order", created_at)
     VALUES ($id, $title, $spec, $collections, $order, $created_at)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       spec = excluded.spec,
       collections = excluded.collections,
       "order" = excluded."order",
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    {
      id: widget.id,
      title: widget.title,
      spec: widget.spec,
      collections: widget.collections,
      order: widget.order,
      created_at: widget.created_at,
    }
  );
}

export async function deleteWidget(id: string): Promise<void> {
  await dbQuery("DELETE FROM widgets WHERE id = $id", { id });
}

export async function saveWidgetOrder(orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;
  const cases = orderedIds.map((_, i) => `WHEN $id${i} THEN ${i}`).join(" ");
  const inList = orderedIds.map((_, i) => `$id${i}`).join(", ");
  const vars: Record<string, unknown> = {};
  orderedIds.forEach((id, i) => { vars[`id${i}`] = id; });
  await dbQuery(
    `UPDATE widgets SET "order" = CASE id ${cases} END,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id IN (${inList})`,
    vars
  );
}

// Nav Views

export interface WidgetLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export interface NavView {
  id: string;
  name: string;
  widgetIds: string[];
  layouts?: Record<string, WidgetLayoutItem[]>;
  created_at: string;
}

export async function loadNavViews(): Promise<NavView[]> {
  const [rows] = await dbQuery<
    [Array<{ id: string; name: string; widget_ids: string[]; created_at: string }>]
  >(
    "SELECT id, name, widget_ids, created_at FROM nav_views ORDER BY created_at ASC"
  );
  return (rows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    widgetIds: r.widget_ids ?? [],
    created_at: r.created_at,
  }));
}

export async function saveNavView(view: NavView): Promise<void> {
  await dbQuery(
    `INSERT INTO nav_views (id, name, widget_ids, created_at)
     VALUES ($id, $name, $widgetIds, $created_at)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       widget_ids = excluded.widget_ids,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    {
      id: view.id,
      name: view.name,
      widgetIds: view.widgetIds,
      created_at: view.created_at,
    }
  );
}

export async function deleteNavView(id: string): Promise<void> {
  await dbQuery("DELETE FROM nav_views WHERE id = $id", { id });
}
