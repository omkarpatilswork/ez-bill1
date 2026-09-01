ALTER TABLE public.tag_pending_bills REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tag_pending_bills;