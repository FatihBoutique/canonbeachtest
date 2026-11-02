# FATIH BOUTIQUE – Participant Portal (starter)

This is a separate, static web app intended to live independently from the existing excursion homepage. It uses the SAME Supabase project but does not change the existing `public.admins` table.

## Included in this first version
- Sign in using email or phone + password
- Account registration with full name and unique username
- New participant accounts default to `pending`
- Admin-only participant approval/suspension
- Official announcements (admin/editor publish)
- Basic participant discussion feed
- Row Level Security policies in `schema.sql`

## Before deployment

1. **Back up your Supabase project** and review the SQL below before running it.
2. In Supabase SQL Editor, run `schema.sql`. It creates new tables and policies; it does not drop or modify `public.admins`.
3. In Supabase Authentication settings, configure the providers you intend to use:
   - Enable Email + Password.
   - Enable Phone + Password if phone login is required; configure an SMS provider and phone verification settings.
   - For production, keep email/phone verification enabled as appropriate.
4. Put your project URL and publishable/anon key in `config.js`.
   - Never use the `service_role` key in `config.js` or any browser code.
5. Serve the files from a local web server or static hosting. Do not open `index.html` as a `file://` URL.
6. Test with a separate test participant account before inviting real participants.

## Existing admin users

Your existing `public.admins` table remains the source of admin/editor roles. Existing auth users listed there retain their roles. The app currently shows participant management only to the `admin` role. Both `admin` and `editor` can publish announcements.

## Important implementation notes

- The signup trigger creates a participant profile with `pending` status.
- A participant cannot approve themselves. Status changes go through the `admin_set_participant_status` database function, which checks that the caller has `role = 'admin'` in `public.admins`.
- Username uniqueness is case-insensitive.
- Login accepts an email address or phone number. Phone/password login must be enabled and configured in Supabase Auth; the browser app cannot configure an SMS provider.
- This is a starter version. Password reset, post reporting/moderation queue, comments/replies, rate limits, audit logs, live location sharing and pickup requests are not included yet.
- The current UI is English-first; wording can be localized to French later.

## Critical production checks

Before using this with real participants, verify:
- Supabase Auth email and phone provider settings.
- Email/SMS verification and password recovery.
- RLS with pending, confirmed, suspended, admin and editor test accounts.
- Username collision behavior.
- Admin access and status-change RPC.
- Your existing excursion site still works after the SQL migration.

Do not share your Supabase service-role key. The project URL and anon/publishable key are intended for client use when RLS is correctly configured.
