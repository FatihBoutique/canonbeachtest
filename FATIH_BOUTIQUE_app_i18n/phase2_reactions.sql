-- FATIH BOUTIQUE — Phase 2 reactions only.
-- Run in Supabase SQL Editor before deploying Phase 2 website files.
-- Requires existing public.portal_forum_posts, public.is_confirmed_portal_participant(),
-- and public.current_portal_admin_role() from the already configured portal.
-- No changes to existing participant/admin/forum RLS policies.

DO $$
DECLARE post_id_type text;
BEGIN
  SELECT format_type(a.atttypid,a.atttypmod) INTO post_id_type
  FROM pg_attribute a WHERE a.attrelid='public.portal_forum_posts'::regclass
    AND a.attname='id' AND NOT a.attisdropped;
  IF post_id_type IS NULL THEN RAISE EXCEPTION 'Could not find portal_forum_posts.id'; END IF;
  EXECUTE format('CREATE TABLE IF NOT EXISTS public.portal_message_reactions (
    post_id %s NOT NULL REFERENCES public.portal_forum_posts(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    emoji text NOT NULL CHECK (emoji IN (''👍'',''❤️'',''😂'',''🎉'')),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(post_id,user_id)
  )',post_id_type);
END $$;

ALTER TABLE public.portal_message_reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_message_reactions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_message_reactions TO authenticated;

DROP POLICY IF EXISTS "fatih_reactions_read" ON public.portal_message_reactions;
CREATE POLICY "fatih_reactions_read" ON public.portal_message_reactions
FOR SELECT TO authenticated USING (
  (public.is_confirmed_portal_participant() OR public.current_portal_admin_role() IN ('admin','editor'))
  AND EXISTS (SELECT 1 FROM public.portal_forum_posts p WHERE p.id = post_id)
);

DROP POLICY IF EXISTS "fatih_reactions_insert" ON public.portal_message_reactions;
CREATE POLICY "fatih_reactions_insert" ON public.portal_message_reactions
FOR INSERT TO authenticated WITH CHECK (
  user_id=auth.uid()
  AND (public.is_confirmed_portal_participant() OR public.current_portal_admin_role() IN ('admin','editor'))
  AND EXISTS (SELECT 1 FROM public.portal_forum_posts p WHERE p.id = post_id)
);

DROP POLICY IF EXISTS "fatih_reactions_update" ON public.portal_message_reactions;
CREATE POLICY "fatih_reactions_update" ON public.portal_message_reactions
FOR UPDATE TO authenticated
USING (user_id=auth.uid() AND (public.is_confirmed_portal_participant() OR public.current_portal_admin_role() IN ('admin','editor')))
WITH CHECK (user_id=auth.uid() AND (public.is_confirmed_portal_participant() OR public.current_portal_admin_role() IN ('admin','editor'))
  AND EXISTS (SELECT 1 FROM public.portal_forum_posts p WHERE p.id = post_id));

DROP POLICY IF EXISTS "fatih_reactions_delete" ON public.portal_message_reactions;
CREATE POLICY "fatih_reactions_delete" ON public.portal_message_reactions
FOR DELETE TO authenticated USING (
  user_id=auth.uid() AND (public.is_confirmed_portal_participant() OR public.current_portal_admin_role() IN ('admin','editor'))
);

-- Enable realtime changes for reactions. Publication may already include the table.
DO $$ BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_publication_tables
   WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='portal_message_reactions'
 ) THEN
   ALTER PUBLICATION supabase_realtime ADD TABLE public.portal_message_reactions;
 END IF;
END $$;
