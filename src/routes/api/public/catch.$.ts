import { createFileRoute } from "@tanstack/react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

async function capture(request: Request, splat: string | undefined) {
  const url = new URL(request.url);
  const path = "/" + (splat ?? "");

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  let body: string | null = null;
  try {
    body = await request.text();
  } catch {
    body = null;
  }

  const sourceIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as {
    from: (t: string) => { insert: (row: Record<string, unknown>) => Promise<unknown> };
  };

  await db.from("captured_requests").insert({
    path,
    method: request.method,
    query_params: query,
    headers,
    body: body && body.length > 0 ? body : null,
    content_type: request.headers.get("content-type"),
    source_ip: sourceIp,
  });

  return new Response(
    JSON.stringify({
      ok: true,
      message: "Request captured",
      method: request.method,
      path,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    },
  );
}

export const Route = createFileRoute("/api/public/catch/$")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async ({ request, params }) => capture(request, params._splat),
      POST: async ({ request, params }) => capture(request, params._splat),
      PUT: async ({ request, params }) => capture(request, params._splat),
      PATCH: async ({ request, params }) => capture(request, params._splat),
      DELETE: async ({ request, params }) => capture(request, params._splat),
    },
  },
});