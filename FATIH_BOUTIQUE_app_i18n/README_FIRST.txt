FATIH BOUTIQUE — PHASE 2

1. Back up the current working canonbeachtest files.
2. In Supabase SQL Editor, run phase2_reactions.sql ONCE. Confirm success.
3. Upload index.html, styles.css and app.js to your GitHub Pages repository.
4. Keep your existing config.js and i18n.js unchanged. Never publish service_role keys.
5. Commit, wait for deployment, then hard refresh (Ctrl+Shift+R).
6. Test: send messages in two authenticated browsers; emoji reaction add/change/remove; delete own message; 50-message history; unread badge; mobile announcements.
7. Security: suspend a confirmed participant while their chat tab remains open; verify they cannot receive new message content, post, or react. Reconnect/reload and test again. Also test an existing valid session.

IMPORTANT: Public phone login remains disabled until server-side rate limiting is implemented. Do not use this as proof of production readiness.

Note: Realtime delivery of DELETE events depends on PostgreSQL Realtime behavior; test with two browsers. SQL is intended for the existing portal schema, not a fresh Supabase project.
