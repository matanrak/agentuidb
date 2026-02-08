import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

/**
 * AgentUIDB Dashboard Catalog
 *
 * Components map to shadcn/ui + Recharts.
 * Actions query SurrealDB collections directly.
 */
export const catalog = defineCatalog(schema, {
  components: {
    // Layout
    Stack: {
      props: z.object({
        direction: z.enum(["horizontal", "vertical"]).nullable(),
        gap: z.enum(["sm", "md", "lg"]).nullable(),
        justify: z.enum(["start", "end", "center", "between", "around"]).nullable(),
        align: z.enum(["start", "end", "center", "stretch"]).nullable(),
      }),
      slots: ["default"],
      description: "Flex layout container. Use justify/align for positioning children.",
    },

    Grid: {
      props: z.object({
        columns: z.number(),
        gap: z.enum(["sm", "md", "lg"]).nullable(),
      }),
      slots: ["default"],
      description: "CSS grid layout. Use columns to set the number of columns.",
    },

    Card: {
      props: z.object({
        title: z.string().nullable(),
        description: z.string().nullable(),
        centered: z.boolean().nullable(),
      }),
      slots: ["default"],
      description: "Card container with optional title and description. Use centered for stat cards.",
    },

    // Typography
    Heading: {
      props: z.object({
        text: z.string(),
        level: z.enum(["h1", "h2", "h3", "h4"]).nullable(),
      }),
      description: "Section heading",
    },

    Text: {
      props: z.object({
        content: z.string().nullable(),
        text: z.string().nullable(),
        variant: z.enum(["body", "caption", "muted"]).nullable(),
        muted: z.boolean().nullable(),
      }),
      description: "Text content. Use variant='caption' for small labels, 'muted' for secondary text. Accepts content or text prop.",
    },

    // Display
    Badge: {
      props: z.object({
        text: z.string(),
        variant: z.enum(["default", "secondary", "destructive", "outline", "success", "warning"]).nullable(),
      }),
      description: "Status badge. Use success (green) or warning (amber) for status indicators.",
    },

    Alert: {
      props: z.object({
        variant: z.enum(["default", "destructive"]).nullable(),
        title: z.string(),
        description: z.string().nullable(),
      }),
      description: "Alert message",
    },

    Separator: {
      props: z.object({}),
      description: "Visual divider (also called Divider)",
    },

    Divider: {
      props: z.object({}),
      description: "Visual divider (alias for Separator)",
    },

    Progress: {
      props: z.object({
        value: z.number(),
        max: z.number().nullable(),
        label: z.string().nullable(),
      }),
      description: "Progress bar. Value is current progress, max is the total (default 100).",
    },

    Avatar: {
      props: z.object({
        src: z.string().nullable(),
        alt: z.string().nullable(),
        fallback: z.string(),
      }),
      description: "Avatar image with fallback initials",
    },

    Skeleton: {
      props: z.object({
        width: z.string().nullable(),
        height: z.string().nullable(),
      }),
      description: "Loading placeholder",
    },

    // Navigation
    Tabs: {
      props: z.object({
        defaultValue: z.string().nullable(),
        tabs: z.array(z.object({
          value: z.string(),
          label: z.string(),
        })),
      }),
      slots: ["default"],
      description: "Tabbed content container",
    },

    TabContent: {
      props: z.object({
        value: z.string(),
      }),
      slots: ["default"],
      description: "Content for a specific tab",
    },

    // Interactive
    Button: {
      props: z.object({
        label: z.string(),
        variant: z.enum(["default", "secondary", "destructive", "outline", "ghost"]).nullable(),
        action: z.string(),
        actionParams: z.record(z.string(), z.unknown()).nullable(),
        disabled: z.boolean().nullable(),
      }),
      description:
        "Clickable button that triggers an action. Use actionParams to pass parameters.",
    },

    // Data display
    Table: {
      props: z.object({
        dataPath: z.string(),
        columns: z.array(z.object({
          key: z.string(),
          label: z.string(),
        })),
        emptyMessage: z.string().nullable(),
      }),
      description:
        "Sortable data table. dataPath points to an array of objects in the data context (e.g., 'meals'). Click column headers to sort.",
    },

    // Charts
    BarChart: {
      props: z.object({
        title: z.string().nullable(),
        dataPath: z.string(),
        xKey: z.string(),
        yKey: z.string(),
        aggregate: z.enum(["sum", "count", "avg"]).nullable(),
        color: z.string().nullable(),
        height: z.number().nullable(),
      }),
      description:
        "Bar chart. dataPath points to data array, xKey is category field, yKey is numeric field. Use aggregate to group by xKey.",
    },

    LineChart: {
      props: z.object({
        title: z.string().nullable(),
        dataPath: z.string(),
        xKey: z.string(),
        yKey: z.string(),
        aggregate: z.enum(["sum", "count", "avg"]).nullable(),
        color: z.string().nullable(),
        height: z.number().nullable(),
      }),
      description:
        "Line chart. dataPath points to data array, xKey is x-axis field, yKey is numeric field. Use aggregate to group by xKey.",
    },
  },

  actions: {
    queryCollection: {
      params: z.object({
        collection: z.string(),
        dataKey: z.string(),
        filters: z.record(z.string(), z.unknown()).nullable(),
        sort_by: z.string().nullable(),
        sort_order: z.enum(["asc", "desc"]).nullable(),
        limit: z.number().nullable(),
      }),
      description:
        "Query documents from a SurrealDB collection. Results are stored at the dataKey path in the data context. " +
        "Components can reference them via dataPath matching the dataKey. " +
        "Example: queryCollection with dataKey='meals' → Table with dataPath='meals'.",
    },

    refreshData: {
      params: z.object({
        collection: z.string(),
        dataKey: z.string(),
        limit: z.number().nullable(),
      }),
      description: "Refresh data for a collection (re-fetches from SurrealDB).",
    },
  },
});
