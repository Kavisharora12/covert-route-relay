import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "file.reader — Remote File Console" },
      { name: "description", content: "CRUD operations on files from your browser via a local agent." },
    ],
  }),
  component: Index,
});

type FileOperation = "read" | "write" | "delete";

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
  operation: FileOperation;
  content?: string;
  requestedAt: string;
  status: "pending" | "done" | "error";
  result?: string;
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

const OP_META: Record<FileOperation, { label: string; color: string; icon: string }> = {
  read:   { label: "Read",   icon: "📖", color: "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-400/30" },
  write:  { label: "Write",  icon: "✏️",  color: "text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-400/30" },
  delete: { label: "Delete", icon: "🗑️",  color: "text-red-600 dark:text-red-400 bg-red-500/10 border-red-400/30" },
};

function AgentCode({ baseUrl }: { baseUrl: string }) {
  const [copied, setCopied] = useState(false);
  const [copiedInstall, setCopiedInstall] = useState(false);
  const url = baseUrl || "https://your-app.replit.app";

  const installCmd = `npm install pdf-parse mammoth xlsx`;

  const code = `// file-agent.js — CRUD agent (Read, Write, Delete files)
// Install deps first: npm install pdf-parse mammoth xlsx
// Then run once and leave open: node file-agent.js

const fs   = require("fs");
const path = require("path");

const SERVER  = "${url}";
const POLL_MS = 1500;

// ── Read: extract text by file type ───────────────────────────────────────
async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf") {
    const pdfParse = require("pdf-parse");
    const result   = await pdfParse(fs.readFileSync(filePath));
    return result.text;
  }
  if (ext === ".docx") {
    const mammoth = require("mammoth");
    const result  = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }
  if (ext === ".xlsx" || ext === ".xls") {
    const XLSX = require("xlsx");
    const wb   = XLSX.readFile(filePath);
    return wb.SheetNames.map((name) =>
      \`=== Sheet: \${name} ===\\n\${XLSX.utils.sheet_to_csv(wb.Sheets[name])}\`
    ).join("\\n\\n");
  }
  // CSV, TXT, JS, JSON, TS, HTML, CSS, MD, etc.
  return fs.readFileSync(filePath, "utf8");
}

// ── Handle one request ─────────────────────────────────────────────────────
async function handle(req) {
  const filename = path.basename(req.path);

  if (req.operation === "read") {
    console.log(\`[READ]   \${req.path}\`);
    const content = await extractText(req.path);
    await patch(req.id, { filename, content });
    console.log(\`         ✓ \${filename} (\${content.length} chars)\`);
  }

  else if (req.operation === "write") {
    console.log(\`[WRITE]  \${req.path}\`);
    // Create directories if they don't exist
    fs.mkdirSync(path.dirname(req.path), { recursive: true });
    fs.writeFileSync(req.path, req.content ?? "", "utf8");
    await patch(req.id, { result: \`Written \${(req.content ?? "").length} chars to \${filename}\` });
    console.log(\`         ✓ File written\`);
  }

  else if (req.operation === "delete") {
    console.log(\`[DELETE] \${req.path}\`);
    fs.unlinkSync(req.path);
    await patch(req.id, { result: \`Deleted \${filename}\` });
    console.log(\`         ✓ File deleted\`);
  }
}

async function patch(id, data) {
  await fetch(\`\${SERVER}/api/queue\`, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ id, ...data }),
  });
}

// ── Poll loop ──────────────────────────────────────────────────────────────
async function poll() {
  try {
    const res = await fetch(\`\${SERVER}/api/queue?pending=true\`);
    const { requests } = await res.json();
    for (const req of requests) {
      try {
        await handle(req);
      } catch (err) {
        await patch(req.id, { error: err.message });
        console.error(\`         ✗ \${err.message}\`);
      }
    }
  } catch {
    // server unreachable, will retry
  }
  setTimeout(poll, POLL_MS);
}

console.log("Agent ready —", SERVER);
console.log("Operations: READ · WRITE (create/overwrite) · DELETE");
poll();`;

  const copy = (text: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5">
        <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-600 dark:text-amber-400">STEP 1</span>
        <code className="flex-1 font-mono text-xs">{installCmd}</code>
        <button onClick={() => copy(installCmd, setCopiedInstall)} className="shrink-0 rounded border border-border bg-muted px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
          {copiedInstall ? "Copied!" : "Copy"}
        </button>
      </div>

      <div className="relative rounded-xl border border-border bg-muted">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="flex items-center gap-2">
            <span className="rounded bg-primary/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary">STEP 2</span>
            <span className="font-mono text-xs text-muted-foreground">file-agent.js</span>
          </span>
          <button onClick={() => copy(code, setCopied)} className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <pre className="max-h-96 overflow-auto p-4 font-mono text-xs leading-relaxed">{code}</pre>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5">
        <span className="shrink-0 rounded bg-green-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-green-600 dark:text-green-400">STEP 3</span>
        <code className="font-mono text-xs">node file-agent.js</code>
        <span className="text-xs text-muted-foreground">— leave it running</span>
      </div>
    </div>
  );
}

function Index() {
  const [appUrl, setAppUrl] = useState("");
  const [files, setFiles] = useState<IngestedFile[]>([]);
  const [requests, setRequests] = useState<FileRequest[]>([]);
  const [selected, setSelected] = useState<IngestedFile | null>(null);
  const [pathInput, setPathInput] = useState("");
  const [operation, setOperation] = useState<FileOperation>("read");
  const [writeContent, setWriteContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [agentSeen, setAgentSeen] = useState(false);
  const prevCount = useRef(0);

  useEffect(() => {
    setAppUrl(`${window.location.protocol}//${window.location.host}`);
  }, []);

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
      } catch { /* keep polling */ }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => { active = false; clearInterval(id); };
  }, []);

  const submitRequest = async () => {
    if (!pathInput.trim()) return;
    if (operation === "write" && !writeContent.trim()) return;
    setSubmitting(true);
    try {
      await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: pathInput.trim(),
          operation,
          ...(operation === "write" ? { content: writeContent } : {}),
        }),
      });
      setPathInput("");
      if (operation === "write") setWriteContent("");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteFile = async (id: string) => {
    await fetch(`/api/ingest?id=${id}`, { method: "DELETE" });
    setFiles((prev) => prev.filter((f) => f.id !== id));
    if (selected?.id === id) setSelected(null);
    prevCount.current = Math.max(0, prevCount.current - 1);
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

  const buttonLabel = () => {
    if (submitting) return "Sending…";
    if (operation === "read") return "Read";
    if (operation === "write") return "Write";
    return "Delete";
  };

  const buttonClass = () => {
    const base = "shrink-0 rounded-lg px-5 py-3 text-sm font-medium text-white transition-colors disabled:opacity-50";
    if (operation === "write")  return `${base} bg-violet-600 hover:bg-violet-700`;
    if (operation === "delete") return `${base} bg-red-600 hover:bg-red-700`;
    return `${base} bg-primary hover:bg-primary/90`;
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card/50">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`inline-flex h-2.5 w-2.5 rounded-full bg-primary transition-all ${pulse ? "scale-150 opacity-100" : "animate-pulse opacity-70"}`} />
              <h1 className="font-mono text-xl font-semibold tracking-tight">file.reader</h1>
              {pendingCount > 0 && (
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-mono text-xs font-medium text-amber-600 dark:text-amber-400">
                  {pendingCount} pending
                </span>
              )}
            </div>
            {(files.length > 0 || requests.length > 0) && (
              <button onClick={clearAll} className="text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline">
                Clear all
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            CRUD operations on files — your local agent does the work, results appear here.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-6 py-6">

        {/* Command panel */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-4">

          {/* Operation tabs */}
          <div className="flex gap-1 rounded-lg border border-border bg-muted p-1 w-fit">
            {(["read", "write", "delete"] as FileOperation[]).map((op) => (
              <button
                key={op}
                onClick={() => setOperation(op)}
                className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-semibold capitalize transition-colors ${
                  operation === op
                    ? "bg-card shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>{OP_META[op].icon}</span>
                {OP_META[op].label}
              </button>
            ))}
          </div>

          {/* Path input */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {operation === "read"   && "File path to read"}
              {operation === "write"  && "File path to write (will create if missing)"}
              {operation === "delete" && "File path to delete from disk"}
            </label>
            <div className="flex gap-2">
              <input
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && operation !== "write" && submitRequest()}
                placeholder="C:\Users\Asus\Projects\js-runtime-cpp\demos\demo_for_loops.js"
                className="min-w-0 flex-1 rounded-lg border border-border bg-muted px-4 py-3 font-mono text-sm outline-none focus:border-primary"
              />
              {operation !== "write" && (
                <button
                  onClick={submitRequest}
                  disabled={submitting || !pathInput.trim()}
                  className={buttonClass()}
                >
                  {buttonLabel()}
                </button>
              )}
            </div>
          </div>

          {/* Write content textarea */}
          {operation === "write" && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                File content
              </label>
              <textarea
                value={writeContent}
                onChange={(e) => setWriteContent(e.target.value)}
                placeholder="Paste or type the content to write into the file…"
                rows={8}
                className="w-full rounded-lg border border-border bg-muted px-4 py-3 font-mono text-sm outline-none focus:border-primary resize-y"
              />
              <div className="mt-2 flex justify-end">
                <button
                  onClick={submitRequest}
                  disabled={submitting || !pathInput.trim() || !writeContent.trim()}
                  className={buttonClass()}
                >
                  {buttonLabel()}
                </button>
              </div>
            </div>
          )}

          {/* Delete warning */}
          {operation === "delete" && pathInput.trim() && (
            <p className="text-xs text-red-600 dark:text-red-400">
              ⚠ This will permanently delete the file from your PC's filesystem. Cannot be undone.
            </p>
          )}
        </section>

        {/* Request history */}
        {requests.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {requests.map((r) => {
              const op = r.operation ?? "read";
              const statusColor =
                r.status === "pending" ? "border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-300"
                : r.status === "done"  ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300"
                :                        "border-red-400/40 bg-red-400/10 text-red-700 dark:text-red-300";
              return (
                <div key={r.id} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-mono ${statusColor}`}>
                  <span>{r.status === "pending" ? "⏳" : r.status === "done" ? "✓" : "✗"}</span>
                  <span className="uppercase font-bold opacity-70">{op}</span>
                  <span className="max-w-[200px] truncate">{r.path.split(/[\\/]/).pop()}</span>
                  {r.result && <span className="opacity-60 hidden sm:inline">· {r.result}</span>}
                  <span className="opacity-50">· {timeAgo(r.requestedAt)}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Agent setup — shown until first file arrives */}
        {files.length === 0 && (
          <section className="rounded-xl border border-dashed border-border p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-semibold">Set up the agent on your PC</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Save <code className="font-mono">file-agent.js</code>, install deps, run it once — then use the controls above freely.
                </p>
              </div>
              <button onClick={() => setAgentSeen(!agentSeen)} className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline">
                {agentSeen ? "Hide" : "Show code"}
              </button>
            </div>
            {agentSeen && <AgentCode baseUrl={appUrl} />}
            {!agentSeen && (
              <div className="flex flex-col items-center py-6 text-center text-muted-foreground">
                <div className="mb-2 text-3xl">📭</div>
                <p className="text-sm">Waiting for agent… Set it up, then use Read / Write / Delete above.</p>
              </div>
            )}
          </section>
        )}

        {/* Read results viewer */}
        {files.length > 0 && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
            <div className="space-y-1">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Read results ({files.length})
              </p>
              {files.map((f) => (
                <div
                  key={f.id}
                  className={`group flex items-center gap-1 rounded-lg border transition-colors ${
                    selected?.id === f.id ? "border-primary/40 bg-primary/10" : "border-border bg-card hover:bg-muted"
                  }`}
                >
                  <button onClick={() => setSelected(f)} className="min-w-0 flex-1 px-3 py-2.5 text-left">
                    <p className="truncate font-mono text-xs font-medium">{f.filename}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatBytes(f.sizeBytes)} · {timeAgo(f.receivedAt)}</p>
                  </button>
                  <button
                    onClick={() => deleteFile(f.id)}
                    title="Remove from list"
                    className="mr-1.5 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  >✕</button>
                </div>
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
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setPathInput(files.find(f => f.id === selected.id)?.filename ?? ""); setOperation("write"); setWriteContent(selected.content); }}
                        className="rounded-md border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => navigator.clipboard.writeText(selected.content)}
                        className="rounded-md border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Copy
                      </button>
                    </div>
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

        {/* Agent code accordion */}
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
