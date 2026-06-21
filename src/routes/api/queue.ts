import { createFileRoute } from "@tanstack/react-router";
import { enqueue, getPending, getAll, markDone, markError, clearAll } from "@/lib/queue-store";
import { addEntry } from "@/lib/ingest-store";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

export const Route = createFileRoute("/api/queue")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),

      // Website calls this to add a file path to the queue
      POST: async ({ request }) => {
        let body: { path?: string };
        try {
          body = await request.json();
        } catch {
          return json({ success: false, error: "Invalid JSON" }, 400);
        }
        if (!body?.path || typeof body.path !== "string") {
          return json({ success: false, error: "Missing 'path'" }, 400);
        }
        const req = enqueue(body.path.trim());
        return json({ success: true, request: req });
      },

      // Agent calls this to get pending requests
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const pendingOnly = url.searchParams.get("pending") !== "false";
        const items = pendingOnly ? getPending() : getAll();
        return json({ success: true, requests: items });
      },

      // Agent calls this to submit a completed file read
      PATCH: async ({ request }) => {
        let body: { id?: string; content?: string; filename?: string; error?: string };
        try {
          body = await request.json();
        } catch {
          return json({ success: false, error: "Invalid JSON" }, 400);
        }
        if (!body?.id) {
          return json({ success: false, error: "Missing 'id'" }, 400);
        }

        if (body.error) {
          markError(body.id);
          return json({ success: true, status: "error" });
        }

        if (typeof body.content !== "string") {
          return json({ success: false, error: "Missing 'content'" }, 400);
        }

        markDone(body.id);
        addEntry({
          filename: body.filename ?? body.id,
          content: body.content,
          sizeBytes: new TextEncoder().encode(body.content).length,
        });
        return json({ success: true, status: "done" });
      },

      DELETE: async () => {
        clearAll();
        return json({ success: true });
      },
    },
  },
});
