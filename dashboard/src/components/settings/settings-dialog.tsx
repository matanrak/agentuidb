"use client";

import { useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useSettings } from "@/hooks/use-settings";
import { useSurreal } from "@/hooks/use-surreal";

export function SettingsDialog() {
  const { settings, updateSettings } = useSettings();
  const { reconnect } = useSurreal();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium mb-1">AI Provider</legend>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">OpenRouter API Key</label>
              <Input
                type="password"
                value={settings.openrouter_api_key}
                onChange={(e) => updateSettings({ openrouter_api_key: e.target.value })}
                placeholder="sk-or-..."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Model</label>
              <Input
                value={settings.openrouter_model}
                onChange={(e) => updateSettings({ openrouter_model: e.target.value })}
                placeholder="anthropic/claude-sonnet-4"
              />
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium mb-1">SurrealDB</legend>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">URL</label>
              <Input
                value={settings.surrealdb_url}
                onChange={(e) => updateSettings({ surrealdb_url: e.target.value })}
                placeholder="http://127.0.0.1:8000"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground">Username</label>
                <Input
                  value={settings.surrealdb_user}
                  onChange={(e) => updateSettings({ surrealdb_user: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground">Password</label>
                <Input
                  type="password"
                  value={settings.surrealdb_pass}
                  onChange={(e) => updateSettings({ surrealdb_pass: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground">Namespace</label>
                <Input
                  value={settings.surrealdb_namespace}
                  onChange={(e) => updateSettings({ surrealdb_namespace: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground">Database</label>
                <Input
                  value={settings.surrealdb_database}
                  onChange={(e) => updateSettings({ surrealdb_database: e.target.value })}
                />
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={reconnect}>
              Reconnect
            </Button>
          </fieldset>
        </div>
      </DialogContent>
    </Dialog>
  );
}
