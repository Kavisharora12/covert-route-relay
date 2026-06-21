import { createFileRoute } from "@tanstack/react-router";
import { addEntry, getEntries, deleteEntry, clearEntries } from "@/lib/ingest-store";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

export const Route = createFileRoute("/api/ingest")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),

      GET: async () => {
        return json({ success: true, data: getEntries() });
      },

      POST: async ({ request }) => {
        const contentType = request.headers.get("content-type") ?? "";
        let filename = "unknown";
        let content = "";

        if (contentType.includes("application/json")) {
          let body: Record<string, unknown>;
          try {
            body = await request.json();
          } catch {
            return json({ success: false, error: "Invalid JSON body" }, 400);
          }
          if (typeof body.content === "string") {
            content = body.content;
            filename = typeof body.filename === "string" ? body.filename : typeof body.path === "string" ? body.path : "file.txt";
          } else if (typeof body.path === "string") {
            return json({ success: false, error: "Send { content, filename } — not a path. This server does not read remote files." }, 400);
          } else {
            content = JSON.stringify(body, null, 2);
            filename = "data.json";
          }
        } else {
          content = await request.text();
          filename = request.headers.get("x-filename") ?? "file.txt";
        }

        if (!content) {
          return json({ success: false, error: "Empty content" }, 400);
        }

        const entry = addEntry({ filename, content, sizeBytes: new TextEncoder().encode(content).length });
        return json({ success: true, id: entry.id, receivedAt: entry.receivedAt });
      },

      DELETE: async ({ request }) => {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        if (id) {
          const ok = deleteEntry(id);
          return json({ success: ok });
        }
        clearEntries();
        return json({ success: true });
      },
    },
  },
});
