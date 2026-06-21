import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { clearCapturedRequests } from "@/lib/captured.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Request Inspector — Live Capture Console" },
      {
        name: "description",
        content:
          "Educational request inspector: point any fetch/POST at the endpoint and watch the full request appear live.",
      },
      { property: "og:title", content: "Request Inspector — Live Capture Console" },
      {
        property: "og:description",
        content:
          "Educational request inspector: point any fetch/POST at the endpoint and watch the full request appear live.",
      },
    ],
  }),
  component: Index,
});

interface CapturedRequest {
  id: string;
  path: string;
  method: string;
  query_params: Record<string, string>;
  headers: Record<string, string>;
  body: string | null;
  content_type: string | null;
  source_ip: string | null;
  created_at: string;
}

const db = supabase as unknown as {
  from: (t: string) => any;
};

const methodColors: Record<string, string> = {
  GET: "bg-method-get",
  POST: "bg-method-post",
  PUT: "bg-method-put",
  PATCH: "bg-method-patch",
  DELETE: "bg-method-delete",
};

function prettyBody(body: string | null, contentType: string | null) {
  if (!body) return null;
  if (contentType?.includes("application/json")) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  return body;
}

function Index() {
  const [requests, setRequests] = useState<CapturedRequest[]>([]);
  const [origin, setOrigin] = useState("");
  const [path, setPath] = useState("inbox");
  const [copied, setCopied] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const clearAllFn = useServerFn(clearCapturedRequests);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const cleanPath = path.replace(/^\/+/, "").trim();
  const endpoint = origin
    ? `${origin}/api/public/catch/${cleanPath}`
    : "";

  useEffect(() => {
    let active = true;
    db.from("captured_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }: { data: CapturedRequest[] | null }) => {
        if (active && data) {
          setRequests(data);
          setSelectedId((prev) => prev ?? data[0]?.id ?? null);
        }
      });

    const channel = supabase
      .channel("captured_requests_feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "captured_requests" },
        (payload) => {
          const row = payload.new as CapturedRequest;
          setRequests((prev) => [row, ...prev].slice(0, 100));
          setSelectedId((prev) => prev ?? row.id);
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const copyEndpoint = async () => {
    await navigator.clipboard.writeText(endpoint);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const clearAll = async () => {
    await clearAllFn();
    setRequests([]);
    setSelectedId(null);
  };

  const selected = requests.find((r) => r.id === selectedId) ?? null;

  const targetPath = "/" + cleanPath;
  const visibleRequests = cleanPath
    ? requests.filter((r) => r.path === targetPath)
    : requests;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/50">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-method-post" />
            <h1 className="font-mono text-2xl font-semibold tracking-tight">request.inspector</h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Send any request from your own code to the endpoint below. Method, headers, query and
            body are captured and streamed here live. For learning and debugging only.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center overflow-hidden rounded-lg border border-border bg-muted font-mono text-sm">
              <span className="truncate px-4 py-3 text-muted-foreground">
                {origin ? `${origin}/api/public/catch/` : "loading…"}
              </span>
              <input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="your-path"
                className="min-w-0 flex-1 bg-transparent py-3 pr-4 font-mono text-sm text-foreground outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={copyEndpoint}
                className="rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {copied ? "Copied!" : "Copy URL"}
              </button>
              <button
                onClick={clearAll}
                className="rounded-lg border border-border px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
              >
                Clear
              </button>
            </div>
          </div>
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            Type a path above, point your code at the full URL, and requests to{" "}
            <span className="text-foreground">{targetPath}</span> appear below.
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-6 py-8 lg:grid-cols-[320px_1fr]">
        <section className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Captured ({visibleRequests.length})
          </h2>
          {visibleRequests.length === 0 && (
            <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              Waiting for the first request to {targetPath}…
            </p>
          )}
          <ul className="space-y-2">
            {visibleRequests.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => setSelectedId(r.id)}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    selectedId === r.id
                      ? "border-primary bg-card"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <span
                    className={`rounded px-2 py-0.5 font-mono text-xs font-bold text-method-foreground ${
                      methodColors[r.method] ?? "bg-muted-foreground"
                    }`}
                  >
                    {r.method}
                  </span>
                  <span className="flex-1 truncate font-mono text-sm">{r.path}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleTimeString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section>
          {selected ? (
            <div className="space-y-6 rounded-xl border border-border bg-card p-6">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`rounded px-2.5 py-1 font-mono text-xs font-bold text-method-foreground ${
                    methodColors[selected.method] ?? "bg-muted-foreground"
                  }`}
                >
                  {selected.method}
                </span>
                <code className="font-mono text-sm">{selected.path}</code>
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(selected.created_at).toLocaleString()}
                </span>
              </div>

              <Detail title="Source IP">
                <code className="font-mono text-sm">{selected.source_ip ?? "unknown"}</code>
              </Detail>

              {Object.keys(selected.query_params).length > 0 && (
                <Detail title="Query Parameters">
                  <KeyVals data={selected.query_params} />
                </Detail>
              )}

              <Detail title="Headers">
                <KeyVals data={selected.headers} />
              </Detail>

              <Detail title="Body">
                {selected.body ? (
                  <pre className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-xs">
                    {prettyBody(selected.body, selected.content_type)}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground">No body</p>
                )}
              </Detail>
            </div>
          ) : (
            <div className="flex h-full min-h-[300px] items-center justify-center rounded-xl border border-dashed border-border">
              <p className="text-sm text-muted-foreground">Select a request to inspect it</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Detail({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function KeyVals({ data }: { data: Record<string, string> }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {Object.entries(data).map(([k, v], i) => (
        <div
          key={k}
          className={`grid grid-cols-[minmax(120px,1fr)_2fr] gap-3 px-3 py-2 text-sm ${
            i % 2 === 0 ? "bg-muted/40" : ""
          }`}
        >
          <span className="truncate font-mono font-medium">{k}</span>
          <span className="break-all font-mono text-muted-foreground">{v}</span>
        </div>
      ))}
    </div>
  );
}
