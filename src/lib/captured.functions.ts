import { createServerFn } from "@tanstack/react-start";

export const clearCapturedRequests = createServerFn({ method: "POST" }).handler(
  async () => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const db = supabaseAdmin as unknown as {
      from: (t: string) => {
        delete: () => { neq: (col: string, val: string) => Promise<unknown> };
      };
    };
    await db
      .from("captured_requests")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    return { ok: true };
  },
);
