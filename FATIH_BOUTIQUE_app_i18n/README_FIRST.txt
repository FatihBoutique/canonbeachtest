FATIH BOUTIQUE — Phase 3 Participant Experience

1. Back up your currently working Phase 2 site and Supabase schema.
2. Review and run phase3_setup.sql in the existing Supabase project's SQL Editor.
   IMPORTANT: if SQL reports duplicate usernames or a schema mismatch, STOP and share the exact error.
3. Replace ONLY index.html, styles.css and app.js in your test GitHub Pages repository.
4. Keep existing config.js and i18n.js unchanged. Do not publish your service_role key.
5. Commit, wait for GitHub Pages, and hard refresh.
6. Test with two confirmed participant accounts and one organizer account:
   - Change username; ensure another user cannot claim the same name with different case.
   - Verify the chat shows updated username after refresh.
   - Share, update, and remove a voluntary meeting point.
   - Confirm organizers can view check-ins; other participants cannot view someone else's check-in.
   - Suspend a test participant; verify it cannot change username or read/write check-ins.
   - Retest Phase 2 chat, reactions, announcements, and admin management.

Scope and limitations:
- This adds a basic editable username profile and a private, voluntary manual meeting-point check-in.
- It does NOT implement GPS tracking, profile photo upload, phone/password changes, push notifications,
  or automatic pickup dispatch. Those require separate requirements and security review.
- Phase 2 message history, unread counts, and Realtime suspension behavior still need verification.
- JS syntax was checked, but integration/security behavior has not been tested against your live Supabase.
- Keep the test site private until all RLS and access checks are completed.
