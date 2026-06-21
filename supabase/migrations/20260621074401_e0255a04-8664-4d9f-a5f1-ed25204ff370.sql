DROP POLICY IF EXISTS "Anyone can insert captured requests" ON public.captured_requests;
DROP POLICY IF EXISTS "Anyone can delete captured requests" ON public.captured_requests;
REVOKE INSERT, UPDATE, DELETE ON public.captured_requests FROM anon, authenticated;