"use client";

import { useState } from "react";
import { Database, MessageSquare, Wand2, LayoutGrid, Table2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ConnectionStatus } from "@/components/layout/connection-status";
import { useViews } from "@/hooks/use-views";

const BUILT_IN_TABS = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "workshop", label: "Workshop", icon: Wand2 },
  { id: "widgets", label: "Widgets", icon: LayoutGrid },
  { id: "database", label: "Database", icon: Table2 },
] as const;

export function Navbar() {
  const { views, activeTab, setActiveTab, addView, removeView } = useViews();
  const [newViewName, setNewViewName] = useState("");
  const [newViewOpen, setNewViewOpen] = useState(false);

  const handleCreateView = () => {
    const name = newViewName.trim();
    if (!name) return;
    addView(name);
    setNewViewName("");
    setNewViewOpen(false);
  };

  return (
    <nav className="mx-3 mt-3 mb-1 glass-navbar rounded-2xl flex items-center gap-1 px-3 py-1.5 overflow-x-auto scrollbar-none">
      {/* Brand */}
      <div className="flex items-center gap-2 mr-2 shrink-0">
        <div className="size-7 rounded-lg bg-primary/12 flex items-center justify-center">
          <Database className="size-3.5 text-primary" />
        </div>
        <span className="text-sm font-semibold tracking-tight text-foreground">AgentUIDB</span>
      </div>

      <div className="h-5 w-px bg-border/60 shrink-0" />

      {/* Built-in tabs */}
      {BUILT_IN_TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => setActiveTab(id)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 ${
            activeTab === id
              ? "bg-primary/10 text-primary shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
          }`}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}

      {/* View tabs */}
      {views.length > 0 && (
        <div className="h-5 w-px bg-border/40 shrink-0" />
      )}

      {views.map((view) => (
        <div key={view.id} className="group relative flex items-center shrink-0">
          <button
            onClick={() => setActiveTab(view.id)}
            className={`flex items-center gap-1.5 pl-3 pr-7 py-1.5 rounded-xl text-xs font-medium transition-all ${
              activeTab === view.id
                ? "bg-primary/10 text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            }`}
          >
            {view.name}
          </button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity size-4 rounded-full flex items-center justify-center hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                <X className="size-2.5" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete &ldquo;{view.name}&rdquo;?</AlertDialogTitle>
                <AlertDialogDescription>
                  This view and its widget assignments will be permanently removed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => removeView(view.id)}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ))}

      {/* Add view button */}
      <Dialog open={newViewOpen} onOpenChange={setNewViewOpen}>
        <DialogTrigger asChild>
          <button className="size-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors shrink-0">
            <Plus className="size-3.5" />
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>New View</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateView();
            }}
            className="flex flex-col gap-3"
          >
            <Input
              placeholder="View name..."
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              autoFocus
            />
            <Button type="submit" disabled={!newViewName.trim()}>
              Create
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Spacer */}
      <div className="flex-1 min-w-4" />

      {/* Right side: status */}
      <div className="flex items-center gap-2 shrink-0">
        <ConnectionStatus />
      </div>
    </nav>
  );
}
