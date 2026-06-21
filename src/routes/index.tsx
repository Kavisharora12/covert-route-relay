import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "File Reader — Remote Backend Console" },
      {
        name: "description",
        content:
          "Read files from your backend by calling POST /api/files/read with a path. Point it at any public backend URL.",
      },
      { property: "og:title", content: "File Reader — Remote Backend Console" },
      {
        property: "og:description",
        content:
          "Read files from your backend by calling POST /api/files/read with a path.",
      },
    ],
  }),
  component: Index,
});

const BACKEND_KEY = "backend_base_url";
const DEFAULT_BACKEND = "http://localhost:3000";

interface ReadResponse {
  success: boolean;
  data?: { content: string };
  error?: string;
}

function Index() {
  const [backend, setBackend] = useState(DEFAULT_BACKEND);
  const [path, setPath] = useState("");
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(BACKEND_KEY);
    if (saved) setBackend(saved);
  }, []);

  const saveBackend = (value: string) => {
    setBackend(value);
    localStorage.setItem(BACKEND_KEY, value.trim());
  };

  const readFile = async () => {
    setLoading(true);
    setError(null);
    setContent(null);
    try {
      const base = backend.trim().replace(/\/+$/, "");
      const res = await fetch(`${base}/api/files/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const json: ReadResponse = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? `Request failed (${res.status})`);
        return;
      }
      setContent(json.data?.content ?? "");
    } catch (e) {
      setError(
        e instanceof Error
          ? `${e.message}. If you used localhost, your deployed site cannot reach it — use a public URL (ngrok or a deployed server) and enable CORS.`
          : "Unknown error",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/50">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
            <h1 className="font-mono text-2xl font-semibold tracking-tight">file.reader</h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Calls <code className="font-mono">POST /api/files/read</code> on your backend with{" "}
            <code className="font-mono">{"{ path }"}</code> and displays the returned content.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Backend base URL
            </span>
            <input
              value={backend}
              onChange={(e) => saveBackend(e.target.value)}
              placeholder="https://your-tunnel.ngrok-free.app"
              className="w-full rounded-lg border border-border bg-muted px-4 py-3 font-mono text-sm outline-none focus:border-primary"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              Use a public URL (ngrok or a deployed server) — a deployed site can't reach
              localhost.
            </span>
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              File path
            </span>
            <div className="flex gap-2">
              <input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && readFile()}
                placeholder="src/index.js"
                className="min-w-0 flex-1 rounded-lg border border-border bg-muted px-4 py-3 font-mono text-sm outline-none focus:border-primary"
              />
              <button
                onClick={readFile}
                disabled={loading || !path.trim()}
                className="rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? "Reading…" : "Read file"}
              </button>
            </div>
          </label>
        </div>

        {error && (
          <div className="rounded-lg border border-method-delete/40 bg-method-delete/10 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {content !== null && (
          <div className="space-y-2 rounded-xl border border-border bg-card p-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Content
            </h2>
            <pre className="max-h-[60vh] overflow-auto rounded-lg bg-muted p-4 font-mono text-xs">
              {content || "(empty file)"}
            </pre>
          </div>
        )}
      </main>
    </div>
  );
}
