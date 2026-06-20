CREATE TABLE public.captured_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  path TEXT NOT NULL,
  method TEXT NOT NULL,
  query_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  body TEXT,
  content_type TEXT,
  source_ip TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.captured_requests TO anon;
GRANT SELECT, INSERT, DELETE ON public.captured_requests TO authenticated;
GRANT ALL ON public.captured_requests TO service_role;

ALTER TABLE public.captured_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view captured requests"
  ON public.captured_requests FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert captured requests"
  ON public.captured_requests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can delete captured requests"
  ON public.captured_requests FOR DELETE
  USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.captured_requests;