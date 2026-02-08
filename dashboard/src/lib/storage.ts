export interface AppSettings {
  openrouter_api_key: string;
  openrouter_model: string;
  surrealdb_url: string;
  surrealdb_user: string;
  surrealdb_pass: string;
  surrealdb_namespace: string;
  surrealdb_database: string;
}

const SETTINGS_KEY = "agentuidb-settings";
const SAVED_VIEWS_KEY = "agentuidb-saved-views";

export const DEFAULT_SETTINGS: AppSettings = {
  openrouter_api_key: "",
  openrouter_model: "anthropic/claude-sonnet-4",
  surrealdb_url: "http://127.0.0.1:8000",
  surrealdb_user: "root",
  surrealdb_pass: "root",
  surrealdb_namespace: "agentuidb",
  surrealdb_database: "default",
};

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export interface SavedView {
  id: string;
  title: string;
  spec: unknown;
  created_at: string;
}

export function loadSavedViews(): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_VIEWS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveSavedViews(views: SavedView[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views));
}
