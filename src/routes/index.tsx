import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "file.reader — Live Ingest Console" },
      { name: "description", content: "Receive and view files pushed from any external code." },
    ],
  }),
  component: Index,
});

interface IngestedFile {
  id: string;
  filename: string;
  content: string;
  receivedAt: string;
  sizeBytes: number;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return new Date(iso).toLocaleTimeString();
}

function CodeSnippet({ baseUrl }: { baseUrl: string }) {
  const [copied, setCopied] = useState(false);
  const url = baseUrl || "https://your-app.replit.app";
  const code = `const fs = require("fs");

async function sendFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");

  const res = await fetch("${url}/api/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, filename: filePath }),
  });

  const result = await res.json();
  console.log("Sent:", result);
}

// Call it with any file path:
sendFile("src/index.js");`;

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative rounded-xl border border-border bg-muted">
      <button
        onClick={copy}
        className="absolute right-3 top-3 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed">{code}</pre>
    </div>
  );
}

function Index() {
  const [appUrl, setAppUrl] = useState("");
  const [files, setFiles] = useState<IngestedFile[]>([]);
  const [selected, setSelected] = useState<IngestedFile | null>(null);
  const [pulse, setPulse] = useState(false);
  const prevCount = useRef(0);

  useEffect(() => {
    setAppUrl(`${window.location.protocol}//${window.location.host}`);
  }, []);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const res = await fetch("/api/ingest");
        if (!res.ok) return;
        const json = await res.json();
        if (!active) return;
        const entries: IngestedFile[] = json.data ?? [];
        if (entries.length > prevCount.current) {
          setPulse(true);
          setTimeout(() => setPulse(false), 800);
          if (selected === null && entries.length > 0) setSelected(entries[0]);
        }
        prevCount.current = entries.length;
        setFiles(entries);
      } catch {
        // network error — keep polling
      }
    };

    poll();
    const id = setInterval(poll, 2000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [selected]);

  const clearAll = async () => {
    await fetch("/api/ingest", { method: "DELETE" });
    setFiles([]);
    setSelected(null);
    prevCount.current = 0;
  };

  const ingestUrl = `${appUrl}/api/ingest`;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/50">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex h-2.5 w-2.5 rounded-full bg-primary transition-all ${
                  pulse ? "scale-150 opacity-100" : "animate-pulse opacity-70"
                }`}
              />
              <h1 className="font-mono text-xl font-semibold tracking-tight">file.reader</h1>
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                live
              </span>
            </div>
            {files.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
              >
                Clear all
              </button>
            )}
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Receives files pushed from your external code and displays them here in real-time.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-6 py-8">
        {/* Setup card */}
        <section className="space-y-4 rounded-xl border border-border bg-card p-6">
          <div>
            <h2 className="text-sm font-semibold">Your ingest endpoint</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Use these URLs in your separate code to send files here and read them back.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2.5 font-mono text-sm">
              <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-xs font-bold text-primary">
                POST
              </span>
              <span className="truncate">{ingestUrl || "/api/ingest"}</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2.5 font-mono text-sm">
              <span className="shrink-0 rounded bg-green-500/15 px-1.5 py-0.5 text-xs font-bold text-green-600 dark:text-green-400">
                GET
              </span>
              <span className="truncate">{ingestUrl || "/api/ingest"}</span>
            </div>
          </div>

          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
              <span className="transition-transform group-open:rotate-90">▶</span>
              Show code snippet to copy into your project
            </summary>
            <div className="mt-3">
              <CodeSnippet baseUrl={appUrl} />
            </div>
          </details>
        </section>

        {/* Live feed */}
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
            <div className="mb-3 text-3xl">📭</div>
            <p className="text-sm font-medium">Waiting for files…</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Run your code and POST to{" "}
              <code className="font-mono">/api/ingest</code> — it'll appear here instantly.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
            {/* File list */}
            <div className="space-y-1">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Received ({files.length})
              </p>
              {files.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSelected(f)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    selected?.id === f.id
                      ? "border-primary/40 bg-primary/10"
                      : "border-border bg-card hover:bg-muted"
                  }`}
                >
                  <p className="truncate font-mono text-xs font-medium">{f.filename}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatBytes(f.sizeBytes)} · {timeAgo(f.receivedAt)}
                  </p>
                </button>
              ))}
            </div>

            {/* Content viewer */}
            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              {selected ? (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-sm font-semibold">{selected.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(selected.sizeBytes)} · received{" "}
                        {new Date(selected.receivedAt).toLocaleTimeString()}
                      </p>
                    </div>
                    <button
                      onClick={() => navigator.clipboard.writeText(selected.content)}
                      className="rounded-md border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Copy
                    </button>
                  </div>
                  <pre className="max-h-[60vh] overflow-auto rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed">
                    {selected.content || "(empty file)"}
                  </pre>
                </>
              ) : (
                <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                  Select a file to view its content
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
