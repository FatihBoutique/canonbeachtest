# FATIH BOUTIQUE — Phase 4 security and release verification

**Status:** Audit package; NOT a production-ready certification. This package contains the unchanged Phase 3 frontend and a read-only SQL audit. It intentionally does not claim to fix backend security without inspecting the actual Supabase policies and Edge Functions.

## Before testing
- Back up the current GitHub files and record the last working commit.
- Confirm Phase 2 and Phase 3 SQL migrations ran successfully.
- Run `phase4_readonly_audit.sql` in the Supabase SQL Editor; inspect results, especially RLS and function privileges. Do not paste service-role keys or private tokens into chat.
- Use two **test** confirmed participant accounts, one organizer account, and one test account you can suspend.

## Functional acceptance checks
1. Profiles: view own details, change username; reject case-insensitive duplicate and invalid characters.
2. Check-ins: confirmed participant can create, update, delete own check-in; cannot read another participant's check-in via browser or direct REST query; organizer can view relevant check-ins.
3. Chat: latest 50 messages, load older pages without duplicates, live INSERT and DELETE, delete only own messages unless organizer.
4. Reactions: add/change/remove reaction, cannot alter another user's reaction.
5. Unread indicator: navigate away, receive messages, return; verify indicator and local read state on reload.
6. Mobile: narrow viewport, announcements expand/collapse, keyboard and scroll usability.

## Critical security acceptance checks
7. **Suspension with open tab:** Suspend a test participant while logged in on another device. Verify REST requests for messages, announcements, reactions, profiles and check-ins are denied or return no protected rows. Check whether any Realtime payloads still arrive in the existing subscription; if yes, block production and adjust server-side authorization / channel design. Frontend checks are not a substitute for server enforcement.
8. **Role boundaries:** Test admin, editor, viewer (if supported) and participant permissions directly against Supabase endpoints. The frontend currently treats `admin` and `editor` as staff; confirm intended viewer policy and whether viewers should access the portal.
9. **Auth:** Participant phone/password login is intentionally disabled. If required for launch, implement rate limiting and abuse protections in the Edge Function first, then separately test it. Never enable based only on client-side validation.
10. **SQL function review:** Inspect SECURITY DEFINER functions, `search_path`, object ownership and EXECUTE grants; ensure no anonymous or unconfirmed access to sensitive data.
11. **Secrets:** Only Supabase publishable/anon key in public `config.js`; never expose service-role key or Edge Function secrets in GitHub Pages.

## Performance / resilience
12. Test on throttled mobile network, offline/reconnect, token refresh, duplicate Realtime subscriptions, large chat history, and repeated navigation.
13. Confirm accessibility: focus states, descriptive controls, keyboard use, text contrast.

## Release gate
- Do not publish as production-ready until checks 1–13 pass or explicitly documented non-critical exceptions are approved.
- If a critical test fails, keep the known-good deployment and fix that issue first.
- Rollback: restore the previously working GitHub commit; database migrations may require a separately reviewed rollback and must not be reversed blindly.

## Report template
Record each test as PASS / FAIL / NOT TESTED with account role, browser, timestamp, expected behavior, observed behavior, and relevant sanitized error message.
