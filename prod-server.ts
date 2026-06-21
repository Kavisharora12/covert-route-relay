import handler from "./dist/server/server.js";

const PORT = Number(process.env.PORT ?? 5000);
const STATIC_DIR = "./dist/client";

const typedHandler = handler as {
  fetch: (req: Request, env: unknown, ctx: unknown) => Promise<Response>;
};

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);

    // Serve static assets from dist/client
    const filePath = `${STATIC_DIR}${url.pathname}`;
    const file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file);
    }

    // Fall back to SSR handler
    return typedHandler.fetch(req, {}, {});
  },
});

console.log(`Production server running on http://0.0.0.0:${PORT}`);
