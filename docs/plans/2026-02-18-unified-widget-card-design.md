# Unified WidgetCard Design

## Problem

Widget rendering is duplicated across three contexts (chat/workshop, hub/library, views) with inconsistent features. Adding new features like "edit" requires touching 3-4 files.

## Terminology

- **Pin** (UI) = **Save to library** (backend)
- **Library** = the hub where pinned widgets live

## Design

### Single `WidgetCard` component

All three contexts use the same wrapper. It always renders a header bar with title and a content area with `DashboardRenderer` (or JSON code view).

```
┌─────────────────────────────────────────────────┐
│ ≡ drag   Title                 [actions...]  ✕  │
├─────────────────────────────────────────────────┤
│              DashboardRenderer                  │
│            (or JSON code view)                  │
└─────────────────────────────────────────────────┘
```

### Actions by context

| Action           | Chat/Workshop | Library (Hub) | In View |
|------------------|:---:|:---:|:---:|
| Drag handle      | -   | yes | yes |
| Title            | yes | yes | yes |
| Save edits       | yes | yes | yes |
| Pin (save to lib)| yes | -   | -   |
| Add to View      | -   | yes | -   |
| Show Code        | yes | yes | yes |
| Refresh          | yes | yes | yes |
| Sub-widget pin   | yes | yes | yes |
| Remove           | -   | from library | from view |

### Props

```tsx
interface WidgetCardProps {
  spec: Spec;
  title: string;

  // Context-specific actions
  onPin?: () => void;           // Chat/Workshop: save to library
  onRemove?: () => void;        // Library + View: delete/remove
  addToView?: boolean;          // Library only: show view menu

  // Drag support (library + view)
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
  isDragging?: boolean;
  style?: React.CSSProperties;

  // Loading override (streaming in chat/workshop)
  loadingOverride?: boolean;
}
```

### Internal behavior (always on)

- `useSpecData(spec)` for data fetching, refresh, edit handling
- `usePinSubWidget(spec)` for sub-widget pinning
- Show code toggle (local state)
- Edit pending save button

### What changes from today

- **Library gains**: Show Code
- **View gains**: Show Code, Refresh, Edit/Save, Sub-widget pin
- **Chat/Workshop gains**: proper header bar with title (replaces inline toolbar)

### Files affected

- **New**: `dashboard/src/components/shared/widget-card.tsx`
- **Modify**: `dashboard/src/components/chat/chat-message.tsx` — replace inline widget rendering with `<WidgetCard>`
- **Modify**: `dashboard/src/components/workshop/workshop-panel.tsx` — replace inline widget rendering with `<WidgetCard>`
- **Modify**: `dashboard/src/components/hub/widget-card.tsx` — replace with thin wrapper around shared `<WidgetCard>`
- **Modify**: `dashboard/src/components/views/view-panel.tsx` — replace `ViewWidgetCard` with shared `<WidgetCard>`
