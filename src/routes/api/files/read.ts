import { createFileRoute } from "@tanstack/react-router";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export const Route = createFileRoute("/api/files/read")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        let body: { path?: string };
        try {
          body = await request.json();
        } catch {
          return new Response(
            JSON.stringify({ success: false, error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }

        const filePath = body?.path;
        if (!filePath || typeof filePath !== "string") {
          return new Response(
            JSON.stringify({ success: false, error: "Missing or invalid 'path' field" }),
            { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }

        const resolved = resolve(process.cwd(), filePath);
        const cwd = resolve(process.cwd());
        if (!resolved.startsWith(cwd)) {
          return new Response(
            JSON.stringify({ success: false, error: "Path traversal is not allowed" }),
            { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }

        try {
          const content = await readFile(resolved, "utf-8");
          return new Response(
            JSON.stringify({ success: true, data: { content } }),
            { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        } catch (err: unknown) {
          const message =
            err instanceof Error && "code" in err && err.code === "ENOENT"
              ? `File not found: ${filePath}`
              : err instanceof Error
              ? err.message
              : "Failed to read file";
          return new Response(
            JSON.stringify({ success: false, error: message }),
            { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }
      },
    },
  },
});
