import { createFileRoute } from "@tanstack/react-router";
import { enqueue, getPending, getAll, markDone, markError, clearAll, FileOperation } from "@/lib/queue-store";
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

const VALID_OPS: FileOperation[] = ["read", "write", "delete", "sysinfo", "env", "list"];
const NO_PATH_OPS: FileOperation[] = ["sysinfo", "env"];

export const Route = createFileRoute("/api/queue")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),

      POST: async ({ request }) => {
        let body: { path?: string; operation?: string; content?: string; keys?: string[] };
        try {
          body = await request.json();
        } catch {
          return json({ success: false, error: "Invalid JSON" }, 400);
        }

        const operation = (body.operation ?? "read") as FileOperation;
        if (!VALID_OPS.includes(operation)) {
          return json({ success: false, error: `Invalid operation. Must be one of: ${VALID_OPS.join(", ")}` }, 400);
        }

        if (!NO_PATH_OPS.includes(operation)) {
          if (!body?.path || typeof body.path !== "string") {
            return json({ success: false, error: "Missing 'path'" }, 400);
          }
          if (operation === "write" && typeof body.content !== "string") {
            return json({ success: false, error: "Write operation requires 'content'" }, 400);
          }
        }

        const req = enqueue(
          body.path?.trim() ?? operation,
          operation,
          body.content,
          body.keys
        );
        return json({ success: true, request: req });
      },

      GET: async ({ request }) => {
        const url = new URL(request.url);
        const pendingOnly = url.searchParams.get("pending") !== "false";
        const items = pendingOnly ? getPending() : getAll();
        return json({ success: true, requests: items });
      },

      PATCH: async ({ request }) => {
        let body: { id?: string; content?: string; filename?: string; error?: string; result?: string };
        try {
          body = await request.json();
        } catch {
          return json({ success: false, error: "Invalid JSON" }, 400);
        }
        if (!body?.id) {
          return json({ success: false, error: "Missing 'id'" }, 400);
        }

        if (body.error) {
          markError(body.id, body.error);
          return json({ success: true, status: "error" });
        }

        const allItems = getAll();
        const req = allItems.find((r) => r.id === body.id);
        if (!req) {
          return json({ success: false, error: "Request not found" }, 404);
        }

        const opsWithContent: FileOperation[] = ["read", "sysinfo", "env", "list"];
        if (opsWithContent.includes(req.operation)) {
          if (typeof body.content !== "string") {
            return json({ success: false, error: "Missing 'content'" }, 400);
          }
          markDone(body.id, body.result ?? "Done");
          addEntry({
            filename: body.filename ?? body.id,
            content: body.content,
            sizeBytes: new TextEncoder().encode(body.content).length,
          });
        } else {
          markDone(body.id, body.result ?? `${req.operation} completed`);
        }

        return json({ success: true, status: "done" });
      },

      DELETE: async () => {
        clearAll();
        return json({ success: true });
      },
    },
  },
});
