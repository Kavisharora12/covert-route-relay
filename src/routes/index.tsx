import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "file.reader — Remote File Console" },
      { name: "description", content: "Type a file path, your local agent reads it and sends the content here." },
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

interface FileRequest {
  id: string;
  path: string;
  requestedAt: string;
  status: "pending" | "done" | "error";
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

function AgentCode({ baseUrl }: { baseUrl: string }) {
  const [copied, setCopied] = useState(false);
  const url = baseUrl || "https://your-app.replit.app";
  const code = `// file-agent.js — run this ONCE: node file-agent.js
// It stays running in the background and reads files for you.
const fs = require("fs");
const path = require("path");

const SERVER = "${url}";
const POLL_MS = 1500; // check every 1.5 seconds

async function poll() {
  try {
    // 1. Ask the server for pending file requests
    const res = await fetch(\`\${SERVER}/api/queue?pending=true\`);
    const { requests } = await res.json();

    for (const req of requests) {
      console.log("Reading:", req.path);
      try {
        const content = fs.readFileSync(req.path, "utf8");
        // 2. Send the file content back
        await fetch(\`\${SERVER}/api/queue\`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: req.id,
            filename: path.basename(req.path),
            content,
          }),
        });
        console.log("Done:", req.path);
      } catch (err) {
        // File not found or permission error
        await fetch(\`\${SERVER}/api/queue\`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: req.id, error: err.message }),
        });
        console.error("Error:", err.message);
      }
    }
  } catch (e) {
    // Server unreachable — will retry
  }
  setTimeout(poll, POLL_MS);
}

console.log("Agent running. Watching for file requests from", SERVER);
poll();`;

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative rounded-xl border border-border bg-muted">
      <button
        onClick={copy}
        className="absolute right-3 top-3 z-10 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
      <pre className="max-h-80 overflow-auto p-4 font-mono text-xs leading-relaxed">{code}</pre>
    </div>
  );
}

function Index() {
  const [appUrl, setAppUrl] = useState("");
  const [files, setFiles] = useState<IngestedFile[]>([]);
  const [requests, setRequests] = useState<FileRequest[]>([]);
  const [selected, setSelected] = useState<IngestedFile | null>(null);
  const [pathInput, setPathInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [agentSeen, setAgentSeen] = useState(false);
  const prevCount = useRef(0);

  useEffect(() => {
    setAppUrl(`${window.location.protocol}//${window.location.host}`);
  }, []);

  // Poll for received files and queue status
  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const [filesRes, queueRes] = await Promise.all([
          fetch("/api/ingest"),
          fetch("/api/queue?pending=false"),
        ]);
        if (!active) return;

        if (filesRes.ok) {
          const data = await filesRes.json();
          const entries: IngestedFile[] = data.data ?? [];
          if (entries.length > prevCount.current) {
            setPulse(true);
            setTimeout(() => setPulse(false), 800);
            setSelected(entries[0]);
          }
          prevCount.current = entries.length;
          setFiles(entries);
        }

        if (queueRes.ok) {
          const data = await queueRes.json();
          setRequests(data.requests ?? []);
        }
      } catch {
        // keep polling
      }
    };

    poll();
    const id = setInterval(poll, 2000);
    return () => { active = false; clearInterval(id); };
  }, []);

  const requestFile = async () => {
    if (!pathInput.trim()) return;
    setSubmitting(true);
    try {
      await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pathInput.trim() }),
      });
      setPathInput("");
    } finally {
      setSubmitting(false);
    }
  };

  const clearAll = async () => {
    await Promise.all([
      fetch("/api/ingest", { method: "DELETE" }),
      fetch("/api/queue", { method: "DELETE" }),
    ]);
    setFiles([]);
    setRequests([]);
    setSelected(null);
    prevCount.current = 0;
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/50">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex h-2.5 w-2.5 rounded-full bg-primary transition-all ${
                  pulse ? "scale-150 opacity-100" : "animate-pulse opacity-70"
                }`}
              />
              <h1 className="font-mono text-xl font-semibold tracking-tight">file.reader</h1>
              {pendingCount > 0 && (
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-mono text-xs font-medium text-amber-600 dark:text-amber-400">
                  {pendingCount} waiting
                </span>
              )}
            </div>
            {(files.length > 0 || requests.length > 0) && (
              <button
                onClick={clearAll}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
              >
                Clear all
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Type a file path → your local agent reads it → content appears here instantly.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-6 py-6">

        {/* File path input */}
        <section className="rounded-xl border border-border bg-card p-5">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              File path to read
            </span>
            <div className="flex gap-2">
              <input
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && requestFile()}
                placeholder="C:\Users\Asus\Projects\js-runtime-cpp\demos\demo_for_loops.js"
                className="min-w-0 flex-1 rounded-lg border border-border bg-muted px-4 py-3 font-mono text-sm outline-none focus:border-primary"
              />
              <button
                onClick={requestFile}
                disabled={submitting || !pathInput.trim()}
                className="shrink-0 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting ? "Sending…" : "Read"}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Paste any absolute path. Your local agent (running on your PC) will read it.
            </p>
          </label>
        </section>

        {/* Request queue status */}
        {requests.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {requests.map((r) => (
              <div
                key={r.id}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-mono ${
                  r.status === "pending"
                    ? "border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-300"
                    : r.status === "done"
                    ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300"
                    : "border-red-400/40 bg-red-400/10 text-red-700 dark:text-red-300"
                }`}
              >
                <span>
                  {r.status === "pending" ? "⏳" : r.status === "done" ? "✓" : "✗"}
                </span>
                <span className="max-w-xs truncate">{r.path}</span>
                <span className="opacity-60">· {timeAgo(r.requestedAt)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Agent setup — shown until first file arrives */}
        {files.length === 0 && (
          <section className="rounded-xl border border-dashed border-border p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-semibold">Step 1 — Set up the agent on your PC</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Save this as <code className="font-mono">file-agent.js</code> anywhere, then run:{" "}
                  <code className="font-mono font-semibold">node file-agent.js</code>
                  <br />
                  Leave it running — it silently watches for requests from this website.
                </p>
              </div>
              <button
                onClick={() => setAgentSeen(!agentSeen)}
                className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                {agentSeen ? "Hide" : "Show code"}
              </button>
            </div>
            {agentSeen && <AgentCode baseUrl={appUrl} />}

            {!agentSeen && (
              <div className="flex flex-col items-center py-6 text-center text-muted-foreground">
                <div className="mb-2 text-3xl">📭</div>
                <p className="text-sm">
                  Waiting for your agent… Once it's running, type a path above and the file
                  content will appear here.
                </p>
              </div>
            )}
          </section>
        )}

        {/* Received files viewer */}
        {files.length > 0 && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
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

            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              {selected ? (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-sm font-semibold">{selected.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(selected.sizeBytes)} · {new Date(selected.receivedAt).toLocaleTimeString()}
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

        {/* Show agent code even after files arrive */}
        {files.length > 0 && (
          <details className="group rounded-xl border border-border">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-xs font-medium text-muted-foreground hover:text-foreground">
              <span className="transition-transform group-open:rotate-90">▶</span>
              View / copy agent code (file-agent.js)
            </summary>
            <div className="px-5 pb-5">
              <AgentCode baseUrl={appUrl} />
            </div>
          </details>
        )}
      </main>
    </div>
  );
}
