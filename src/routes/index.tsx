import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "file.reader — Remote File Console" },
      { name: "description", content: "CRUD + sysinfo on files via a local agent." },
    ],
  }),
  component: Index,
});

type FileOperation = "read" | "write" | "delete" | "sysinfo" | "env" | "list";

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
  keys?: string[];
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

const OP_META: Record<FileOperation, { label: string; icon: string; btn: string }> = {
  read:    { label: "Read",    icon: "📖", btn: "bg-primary hover:bg-primary/90 text-primary-foreground" },
  write:   { label: "Write",   icon: "✏️",  btn: "bg-violet-600 hover:bg-violet-700 text-white" },
  delete:  { label: "Delete",  icon: "🗑️",  btn: "bg-red-600 hover:bg-red-700 text-white" },
  sysinfo: { label: "Sysinfo", icon: "🖥️",  btn: "bg-cyan-600 hover:bg-cyan-700 text-white" },
  env:     { label: "Env",     icon: "🔑",  btn: "bg-amber-600 hover:bg-amber-700 text-white" },
  list:    { label: "List Dir",icon: "📂",  btn: "bg-emerald-600 hover:bg-emerald-700 text-white" },
};

const STATUS_COLORS: Record<string, string> = {
  pending: "border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-300",
  done:    "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300",
  error:   "border-red-400/40 bg-red-400/10 text-red-700 dark:text-red-300",
};

function SysinfoView({ content }: { content: string }) {
  let data: Record<string, unknown> | null = null;
  try { data = JSON.parse(content); } catch { /* show raw */ }

  if (!data) return <pre className="font-mono text-xs leading-relaxed">{content}</pre>;

  const row = (label: string, value: unknown) => (
    <div key={label} className="flex gap-3 border-b border-border py-2 last:border-0">
      <span className="w-40 shrink-0 text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="font-mono text-xs break-all">{String(value ?? "—")}</span>
    </div>
  );

  const fmt = (bytes: unknown) => typeof bytes === "number" ? formatBytes(bytes) : String(bytes);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
        {row("Platform", data.platform)}
        {row("OS Type", data.type)}
        {row("OS Release", data.release)}
        {row("Architecture", data.arch)}
        {row("Hostname", data.hostname)}
        {row("Node.js", data.nodeVersion)}
        {row("Home Dir", data.homeDir)}
        {row("Total RAM", fmt(data.totalMemory))}
        {row("Free RAM", fmt(data.freeMemory))}
      </div>

      {Array.isArray(data.cpus) && data.cpus.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            CPUs ({(data.cpus as unknown[]).length} cores)
          </p>
          <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
            {row("Model", (data.cpus as {model: string}[])[0]?.model)}
            {row("Speed", `${(data.cpus as {speed: number}[])[0]?.speed} MHz`)}
          </div>
        </div>
      )}

      {data.networkInterfaces && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Network Interfaces
          </p>
          <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
            {Object.entries(data.networkInterfaces as Record<string, unknown[]>).map(([iface, addrs]) =>
              (addrs as {address: string; family: string; internal: boolean}[]).map((a, i) => (
                <div key={`${iface}-${i}`} className="flex gap-3 py-2 px-3 text-xs">
                  <span className="w-32 shrink-0 font-semibold text-muted-foreground">{iface}</span>
                  <span className="font-mono">{a.address}</span>
                  <span className="text-muted-foreground">({a.family}{a.internal ? ", internal" : ""})</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EnvView({ content }: { content: string }) {
  let data: Record<string, string | null> | null = null;
  try { data = JSON.parse(content); } catch { /* show raw */ }

  if (!data) return <pre className="font-mono text-xs leading-relaxed">{content}</pre>;

  const entries = Object.entries(data);

  return (
    <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
      {entries.map(([key, val]) => (
        <div key={key} className="flex gap-3 py-2 px-3">
          <span className="w-48 shrink-0 font-mono text-xs font-semibold text-muted-foreground">{key}</span>
          {val === null
            ? <span className="font-mono text-xs italic text-muted-foreground">(not set)</span>
            : <span className="font-mono text-xs break-all">{val}</span>
          }
        </div>
      ))}
    </div>
  );
}

interface TreeEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  ext?: string;
  children?: TreeEntry[];
}

interface TreeData {
  root: string;
  totalFiles: number;
  totalDirs: number;
  entries: TreeEntry[];
}

function TreeNode({ entry, depth, onRead }: { entry: TreeEntry; depth: number; onRead: (path: string) => void }) {
  const [open, setOpen] = useState(depth < 2);
  const isDir = entry.type === "dir";

  const EXT_ICON: Record<string, string> = {
    ".js": "🟨", ".ts": "🔷", ".tsx": "⚛️", ".jsx": "⚛️",
    ".json": "📋", ".md": "📝", ".txt": "📄", ".py": "🐍",
    ".html": "🌐", ".css": "🎨", ".pdf": "📕", ".docx": "📘",
    ".xlsx": "📗", ".xls": "📗", ".csv": "📊", ".png": "🖼️",
    ".jpg": "🖼️", ".svg": "🖼️", ".zip": "🗜️", ".env": "🔐",
  };
  const icon = isDir ? (open ? "📂" : "📁") : (EXT_ICON[entry.ext ?? ""] ?? "📄");

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs group ${
          isDir
            ? "cursor-pointer hover:bg-muted"
            : "hover:bg-muted/70"
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => isDir && setOpen(!open)}
      >
        <span className="shrink-0 text-sm leading-none">{icon}</span>
        <span className={`flex-1 font-mono truncate ${isDir ? "font-semibold" : ""}`}>{entry.name}</span>
        {!isDir && entry.size !== undefined && (
          <span className="text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0">
            {formatBytes(entry.size)}
          </span>
        )}
        {!isDir && (
          <button
            onClick={(e) => { e.stopPropagation(); onRead(entry.path); }}
            className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary opacity-0 group-hover:opacity-100 hover:bg-primary/20 transition-opacity"
          >
            Read
          </button>
        )}
      </div>
      {isDir && open && entry.children?.map((child) => (
        <TreeNode key={child.path} entry={child} depth={depth + 1} onRead={onRead} />
      ))}
    </div>
  );
}

function DirTreeView({ content, onRead }: { content: string; onRead: (path: string) => void }) {
  let data: TreeData | null = null;
  try { data = JSON.parse(content); } catch { /* raw fallback */ }

  if (!data) return <pre className="font-mono text-xs leading-relaxed">{content}</pre>;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-3 py-2">
        <span className="font-mono text-xs font-semibold truncate">{data.root}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{data.totalFiles} files · {data.totalDirs} dirs</span>
      </div>
      <div className="rounded-lg border border-border overflow-auto max-h-[60vh] py-1">
        {data.entries.map((entry) => (
          <TreeNode key={entry.path} entry={entry} depth={0} onRead={onRead} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Click <strong>Read</strong> next to any file to load its content.</p>
    </div>
  );
}

function AgentCode({ baseUrl }: { baseUrl: string }) {
  const [copied, setCopied] = useState(false);
  const [copiedInstall, setCopiedInstall] = useState(false);
  const url = baseUrl || "https://your-app.replit.app";

  const installCmd = `npm install pdf-parse mammoth xlsx`;

  const code = `// file-agent.js — Read · Write · Delete · Sysinfo · Env · List Dir
// Install: npm install pdf-parse mammoth xlsx
// Run once: node file-agent.js

const fs   = require("fs");
const path = require("path");
const os   = require("os");

const SERVER  = "${url}";
const POLL_MS = 1500;

// ── Default env keys to collect ───────────────────────────────────────────
const DEFAULT_ENV_KEYS = [
  "PATH", "USERNAME", "USER", "HOME", "HOMEPATH", "TEMP", "TMP",
  "APPDATA", "LOCALAPPDATA", "COMPUTERNAME", "OS", "SHELL", "LANG",
  "PROCESSOR_ARCHITECTURE", "NUMBER_OF_PROCESSORS", "USERPROFILE", "TERM",
];

// ── Read: extract text by file type ───────────────────────────────────────
async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf") {
    const result = await require("pdf-parse")(fs.readFileSync(filePath));
    return result.text;
  }
  if (ext === ".docx") {
    const result = await require("mammoth").extractRawText({ path: filePath });
    return result.value;
  }
  if (ext === ".xlsx" || ext === ".xls") {
    const XLSX = require("xlsx");
    const wb   = XLSX.readFile(filePath);
    return wb.SheetNames.map((name) =>
      \`=== Sheet: \${name} ===\\n\${XLSX.utils.sheet_to_csv(wb.Sheets[name])}\`
    ).join("\\n\\n");
  }
  return fs.readFileSync(filePath, "utf8");
}

// ── Handle one request ─────────────────────────────────────────────────────
async function handle(req) {
  const filename = path.basename(req.path ?? "");

  // READ
  if (req.operation === "read") {
    console.log(\`[READ]    \${req.path}\`);
    const content = await extractText(req.path);
    await patch(req.id, { filename, content });
    console.log(\`          ✓ \${filename} (\${content.length} chars)\`);
    return;
  }

  // WRITE
  if (req.operation === "write") {
    console.log(\`[WRITE]   \${req.path}\`);
    fs.mkdirSync(path.dirname(req.path), { recursive: true });
    fs.writeFileSync(req.path, req.content ?? "", "utf8");
    await patch(req.id, { result: \`Written \${(req.content ?? "").length} chars to \${filename}\` });
    console.log(\`          ✓ File written\`);
    return;
  }

  // DELETE
  if (req.operation === "delete") {
    console.log(\`[DELETE]  \${req.path}\`);
    fs.unlinkSync(req.path);
    await patch(req.id, { result: \`Deleted \${filename}\` });
    console.log(\`          ✓ File deleted\`);
    return;
  }

  // SYSINFO
  if (req.operation === "sysinfo") {
    console.log("[SYSINFO] Collecting system information…");
    const cpus  = os.cpus();
    const ifaces = os.networkInterfaces();
    const info = {
      platform:          os.platform(),
      type:              os.type(),
      release:           os.release(),
      arch:              os.arch(),
      hostname:          os.hostname(),
      nodeVersion:       process.version,
      homeDir:           os.homedir(),
      totalMemory:       os.totalmem(),
      freeMemory:        os.freemem(),
      cpus,
      networkInterfaces: ifaces,
    };
    const content = JSON.stringify(info, null, 2);
    await patch(req.id, { filename: "system-info.json", content, result: \`\${os.type()} \${os.release()} · \${cpus.length} cores\` });
    console.log(\`          ✓ System info collected (\${os.type()} \${os.release()})\`);
    return;
  }

  // ENV
  if (req.operation === "env") {
    const keys = req.keys?.length ? req.keys : DEFAULT_ENV_KEYS;
    console.log(\`[ENV]     Collecting \${keys.length} keys…\`);
    const env = {};
    const missingKeys = [];
    for (const key of keys) {
      env[key] = process.env[key] ?? null;
      if (env[key] === null) missingKeys.push(key);
    }
    const result = missingKeys.length
      ? \`\${keys.length - missingKeys.length}/\${keys.length} set — missing: \${missingKeys.slice(0, 3).join(", ")}\${missingKeys.length > 3 ? "…" : ""}\`
      : \`All \${keys.length} keys set\`;
    const content = JSON.stringify({ ...env, _missingKeys: missingKeys }, null, 2);
    await patch(req.id, { filename: "environment.json", content, result });
    console.log(\`          ✓ \${result}\`);
    return;
  }

  // LIST DIR
  if (req.operation === "list") {
    console.log(\`[LIST]    \${req.path}\`);
    let totalFiles = 0, totalDirs = 0;

    function walk(dirPath, depth) {
      if (depth > 4) return [];
      let entries;
      try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); }
      catch { return []; }
      return entries.map((e) => {
        const fullPath = path.join(dirPath, e.name);
        if (e.isDirectory()) {
          totalDirs++;
          return { name: e.name, path: fullPath, type: "dir", children: walk(fullPath, depth + 1) };
        } else {
          totalFiles++;
          let size = 0;
          try { size = fs.statSync(fullPath).size; } catch {}
          return { name: e.name, path: fullPath, type: "file", size, ext: path.extname(e.name).toLowerCase() };
        }
      });
    }

    const entries = walk(req.path, 0);
    const data = { root: req.path, totalFiles, totalDirs, entries };
    const content = JSON.stringify(data, null, 2);
    const dirName = path.basename(req.path);
    await patch(req.id, {
      filename: \`dir-\${dirName}.json\`,
      content,
      result: \`\${totalFiles} files, \${totalDirs} dirs\`,
    });
    console.log(\`          ✓ \${totalFiles} files · \${totalDirs} dirs\`);
    return;
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
        console.error(\`          ✗ \${err.message}\`);
      }
    }
  } catch {
    // server unreachable, will retry
  }
  setTimeout(poll, POLL_MS);
}

console.log("Agent ready —", SERVER);
console.log("Ops: READ · WRITE · DELETE · SYSINFO · ENV");
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

function ResultViewer({ file, onRead }: { file: IngestedFile; onRead: (path: string) => void }) {
  const isSysinfo = file.filename === "system-info.json";
  const isEnv     = file.filename === "environment.json";
  const isList    = file.filename.startsWith("dir-") && file.filename.endsWith(".json");

  if (isSysinfo) return <SysinfoView content={file.content} />;
  if (isEnv)     return <EnvView content={file.content} />;
  if (isList)    return <DirTreeView content={file.content} onRead={onRead} />;
  return (
    <pre className="max-h-[60vh] overflow-auto rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed">
      {file.content || "(empty file)"}
    </pre>
  );
}

function Index() {
  const [appUrl, setAppUrl]         = useState("");
  const [files, setFiles]           = useState<IngestedFile[]>([]);
  const [requests, setRequests]     = useState<FileRequest[]>([]);
  const [selected, setSelected]     = useState<IngestedFile | null>(null);
  const [operation, setOperation]   = useState<FileOperation>("read");
  const [pathInput, setPathInput]   = useState("");
  const [writeContent, setWriteContent] = useState("");
  const [envKeys, setEnvKeys]       = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pulse, setPulse]           = useState(false);
  const [agentSeen, setAgentSeen]   = useState(false);
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
    const needsPath = operation === "read" || operation === "write" || operation === "delete";
    if (needsPath && !pathInput.trim()) return;
    if (operation === "write" && !writeContent.trim()) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { operation };
      if (needsPath) body.path = pathInput.trim();
      if (operation === "write") body.content = writeContent;
      if (operation === "env" && envKeys.trim()) {
        body.keys = envKeys.split(",").map((k) => k.trim()).filter(Boolean);
      }
      await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (needsPath) setPathInput("");
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

  const canSubmit = () => {
    if (submitting) return false;
    if (operation === "read" || operation === "delete" || operation === "list") return !!pathInput.trim();
    if (operation === "write") return !!pathInput.trim() && !!writeContent.trim();
    return true; // sysinfo + env always allowed
  };

  const readFilePath = async (filePath: string) => {
    await fetch("/api/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: filePath, operation: "read" }),
    });
    setOperation("read");
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
            Your local agent does the work — results appear here in real-time.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-6 py-6">

        {/* Command panel */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-4">

          {/* Operation tabs */}
          <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted p-1 w-fit">
            {(Object.keys(OP_META) as FileOperation[]).map((op) => (
              <button
                key={op}
                onClick={() => setOperation(op)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  operation === op ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>{OP_META[op].icon}</span>
                {OP_META[op].label}
              </button>
            ))}
          </div>

          {/* Path input — for read / write / delete */}
          {(operation === "read" || operation === "write" || operation === "delete") && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {operation === "read"   && "File path to read"}
                {operation === "write"  && "File path to write (creates if missing)"}
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
                    disabled={!canSubmit()}
                    className={`shrink-0 rounded-lg px-5 py-3 text-sm font-medium transition-colors disabled:opacity-50 ${OP_META[operation].btn}`}
                  >
                    {submitting ? "Sending…" : OP_META[operation].label}
                  </button>
                )}
              </div>
              {operation === "delete" && pathInput.trim() && (
                <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                  ⚠ Permanently deletes this file from your PC. Cannot be undone.
                </p>
              )}
            </div>
          )}

          {/* Write content textarea */}
          {operation === "write" && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">File content</label>
              <textarea
                value={writeContent}
                onChange={(e) => setWriteContent(e.target.value)}
                placeholder="Paste or type the content to write into the file…"
                rows={7}
                className="w-full rounded-lg border border-border bg-muted px-4 py-3 font-mono text-sm outline-none focus:border-primary resize-y"
              />
              <div className="mt-2 flex justify-end">
                <button
                  onClick={submitRequest}
                  disabled={!canSubmit()}
                  className={`rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 ${OP_META.write.btn}`}
                >
                  {submitting ? "Sending…" : "Write File"}
                </button>
              </div>
            </div>
          )}

          {/* Sysinfo */}
          {operation === "sysinfo" && (
            <div className="flex items-center gap-4">
              <div>
                <p className="text-sm font-medium">Collect system information from your PC</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  OS · CPU · RAM · hostname · Node.js version · network interfaces
                </p>
              </div>
              <button
                onClick={submitRequest}
                disabled={!canSubmit()}
                className={`shrink-0 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 ${OP_META.sysinfo.btn}`}
              >
                {submitting ? "Sending…" : "Fetch Sysinfo"}
              </button>
            </div>
          )}

          {/* Env vars */}
          {operation === "env" && (
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Specific keys (optional — leave blank for defaults)
                </label>
                <div className="flex gap-2">
                  <input
                    value={envKeys}
                    onChange={(e) => setEnvKeys(e.target.value)}
                    placeholder="PATH, USERNAME, MY_CUSTOM_VAR, API_KEY"
                    className="min-w-0 flex-1 rounded-lg border border-border bg-muted px-4 py-3 font-mono text-sm outline-none focus:border-primary"
                  />
                  <button
                    onClick={submitRequest}
                    disabled={!canSubmit()}
                    className={`shrink-0 rounded-lg px-5 py-3 text-sm font-medium transition-colors disabled:opacity-50 ${OP_META.env.btn}`}
                  >
                    {submitting ? "Sending…" : "Fetch Env"}
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Defaults: PATH, USERNAME, USER, HOME, TEMP, APPDATA, OS, SHELL, LANG, and more.
                  Missing values show as <code className="font-mono">(not set)</code>.
                </p>
              </div>
            </div>
          )}

          {/* List Dir */}
          {operation === "list" && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Directory path to explore
              </label>
              <div className="flex gap-2">
                <input
                  value={pathInput}
                  onChange={(e) => setPathInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitRequest()}
                  placeholder="C:\Users\Asus\Projects\js-runtime-cpp"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-muted px-4 py-3 font-mono text-sm outline-none focus:border-primary"
                />
                <button
                  onClick={submitRequest}
                  disabled={!canSubmit()}
                  className={`shrink-0 rounded-lg px-5 py-3 text-sm font-medium transition-colors disabled:opacity-50 ${OP_META.list.btn}`}
                >
                  {submitting ? "Sending…" : "List Dir"}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Returns a clickable file tree up to 4 levels deep. Click <strong>Read</strong> next to any file to load it instantly.
              </p>
            </div>
          )}
        </section>

        {/* Request history badges */}
        {requests.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {requests.map((r) => (
              <div key={r.id} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-mono ${STATUS_COLORS[r.status]}`}>
                <span>{r.status === "pending" ? "⏳" : r.status === "done" ? "✓" : "✗"}</span>
                <span className="font-bold opacity-80">{OP_META[r.operation]?.icon}</span>
                <span className="max-w-[180px] truncate">
                  {r.operation === "sysinfo" ? "system-info" : r.operation === "env" ? "env-vars" : (r.path.split(/[\\/]/).pop() ?? r.path)}
                </span>
                {r.result && <span className="opacity-60 hidden sm:inline">· {r.result}</span>}
                <span className="opacity-50">· {timeAgo(r.requestedAt)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Agent setup */}
        {files.length === 0 && (
          <section className="rounded-xl border border-dashed border-border p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-semibold">Set up the agent on your PC</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Save <code className="font-mono">file-agent.js</code>, install deps, run once — then all 5 operations work from this page.
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
                <p className="text-sm">Waiting for agent… Try Sysinfo or Env once it's running.</p>
              </div>
            )}
          </section>
        )}

        {/* Results viewer */}
        {files.length > 0 && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
            <div className="space-y-1">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Results ({files.length})
              </p>
              {files.map((f) => (
                <div
                  key={f.id}
                  className={`group flex items-center gap-1 rounded-lg border transition-colors ${
                    selected?.id === f.id ? "border-primary/40 bg-primary/10" : "border-border bg-card hover:bg-muted"
                  }`}
                >
                  <button onClick={() => setSelected(f)} className="min-w-0 flex-1 px-3 py-2.5 text-left">
                    <p className="truncate font-mono text-xs font-medium">
                      {f.filename === "system-info.json" ? "🖥️ system-info.json"
                       : f.filename === "environment.json" ? "🔑 environment.json"
                       : f.filename.startsWith("dir-") ? `📂 ${f.filename}`
                       : f.filename}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatBytes(f.sizeBytes)} · {timeAgo(f.receivedAt)}</p>
                  </button>
                  <button
                    onClick={() => deleteFile(f.id)}
                    title="Remove"
                    className="mr-1.5 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  >✕</button>
                </div>
              ))}
            </div>

            <div className="space-y-3 rounded-xl border border-border bg-card p-4 overflow-auto">
              {selected ? (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-sm font-semibold">{selected.filename}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(selected.sizeBytes)} · {new Date(selected.receivedAt).toLocaleTimeString()}</p>
                    </div>
                    <div className="flex gap-2">
                      {(selected.filename !== "system-info.json" && selected.filename !== "environment.json") && (
                        <button
                          onClick={() => { setPathInput(selected.filename); setOperation("write"); setWriteContent(selected.content); }}
                          className="rounded-md border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                        >Edit</button>
                      )}
                      <button
                        onClick={() => navigator.clipboard.writeText(selected.content)}
                        className="rounded-md border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                      >Copy JSON</button>
                    </div>
                  </div>
                  <ResultViewer file={selected} onRead={readFilePath} />
                </>
              ) : (
                <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                  Select a result to view
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
            <div className="px-5 pb-5"><AgentCode baseUrl={appUrl} /></div>
          </details>
        )}
      </main>
    </div>
  );
}
