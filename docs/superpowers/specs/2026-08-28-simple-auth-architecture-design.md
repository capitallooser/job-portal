# TalentBridge Simple Authentication Architecture

Date: 2026-08-28
Status: Approved in chat; written spec awaiting final review

## 1. Goal

Replace the current browser-managed Supabase Auth flow with a small TalentBridge-owned session layer while keeping Supabase Auth as the password/token issuer and keeping the existing Supabase PostgreSQL database, Row Level Security (RLS), user IDs, profiles, roles, jobs, applications, approvals, notifications, and audit data unchanged.

The primary success criterion is reliable account switching and login in a normal browser window without hangs, auth locks, stale Supabase SDK sessions, or Incognito workarounds.

The required acceptance sequence is:

1. Candidate1 logs in and reaches Candidate Jobs.
2. Candidate1 logs out.
3. Akash logs in and reaches the Admin area.
4. Akash logs out.
5. Mayank logs in and reaches the Super Admin area.
6. Mayank logs out.
7. The original Super Admin account logs in and reaches the Super Admin area.

All of the above must work in the same normal Chrome profile and browser window.

## 2. Non-goals

This rebuild will not:

- move the database away from Supabase;
- build a custom password database or password hashing scheme;
- store passwords in PostgreSQL, GitHub, GitLab, or frontend code;
- replace existing Supabase Auth user IDs;
- rewrite the existing RLS policies merely to support the new session layer;
- add a paid backend service;
- change the existing role model (`super_admin`, `admin`, `associate`, `candidate`);
- redesign the Jobs UI as part of the authentication rebuild.

The paused Jobs-page redesign can resume after the authentication acceptance sequence passes.

## 3. Architecture

The browser will no longer use the Supabase Auth SDK as its session manager.

```text
GitHub Pages / React
        |
        |  simple POST (text/plain)
        v
Supabase Edge Function: portal-auth
        |
        |  server-to-server Auth REST requests
        v
Supabase Auth
        |
        |  issues normal Supabase access + refresh JWTs
        v
TalentBridge session manager in browser
        |
        |  async accessToken callback
        v
Supabase JS Data Client
        |
        v
PostgREST / RPC / Storage under existing RLS
```

Supabase Auth remains responsible for password verification, access-token issuance, refresh-token issuance, signup identity creation, recovery-token issuance, and token revocation. TalentBridge becomes responsible for storing the returned session, refreshing it predictably, clearing it predictably, and supplying the current access token to database requests.

This intentionally avoids the browser flows that have been unreliable in the current app: `signInWithPassword`, `getSession`, `getUser`, `onAuthStateChange`, automatic Supabase Auth persistence, automatic refresh, and SDK logout state coordination.

## 4. Backend authentication boundary: `portal-auth`

Create one Supabase Edge Function named `portal-auth`. It replaces the temporary `password-login` function once the new flow is verified.

The function uses `verify_jwt = false` because login, signup, recovery, and refresh must be callable before the browser has a valid access token. Therefore the function body is the security boundary and must validate every action explicitly.

The browser sends a JSON object encoded as `text/plain` so the cross-origin request remains a CORS-simple POST and does not depend on the problematic Auth preflight path observed from GitHub Pages.

Supported actions:

### `login`

Input: email, password.

The function calls Supabase Auth server-to-server using the project publishable key and password grant. It returns only the normal user/session payload required by TalentBridge: access token, refresh token, expiry, token type, and basic Auth user identity.

It does not log passwords or tokens.

### `refresh`

Input: refresh token.

The function calls the Supabase Auth refresh-token grant server-to-server and returns the replacement session. Refresh-token rotation is respected: whenever Supabase returns a new refresh token, TalentBridge replaces the old one atomically.

### `logout`

Input: access token.

The function requests server-side token/session revocation from Supabase Auth. The browser clears its local TalentBridge session regardless of whether the remote revoke request succeeds, so logout can never hang the UI.

### `signup`

Input: full name, mobile, email, password.

The function calls the Supabase Auth signup endpoint server-to-server. Existing database triggers remain responsible for creating the profile and candidate role. The function returns account-created status rather than establishing a browser session, because new candidates still require approval before protected access.

Current project policy remains: Email provider enabled, candidate signup allowed, and email confirmation disabled unless the product requirement is changed later.

### `request_password_reset`

Input: email and the fixed TalentBridge reset redirect URL.

The function requests Supabase Auth password recovery server-to-server. The frontend always displays a neutral success message to avoid disclosing whether an email is registered.

### `update_recovered_password`

Input: recovery access token and new password.

After the user follows the recovery email to the TalentBridge reset route, the frontend extracts the recovery token supplied by Supabase and sends it to this action. The Edge Function uses that token server-to-server to update the user's password. After success, the recovery state is cleared and the user signs in normally.

## 5. Browser session model

Create a focused module such as `src/features/auth/sessionManager.ts`.

Use a single versioned storage key:

`talentbridge.session.v1`

Stored shape:

```ts
type TalentBridgeSession = {
  accessToken: string
  refreshToken: string
  expiresAt: number
  tokenType: 'bearer'
  user: {
    id: string
    email?: string
  }
}
```

The session store does not persist role, approval status, blocked status, or permissions as authoritative values. Those remain database-controlled and are resolved from `profiles` and `user_roles` after authentication.

The initial implementation uses `localStorage`, matching the persistence level already used by browser Supabase Auth. No secret API key is stored there. The security consequence is the standard browser-token/XSS risk; therefore the app must not use unsafe HTML injection for untrusted content and must never place service-role or secret keys in the frontend.

Session-manager responsibilities:

- read and validate the stored shape;
- write a complete session atomically;
- clear the session synchronously;
- report the current user ID without an Auth SDK call;
- return a valid access token;
- refresh when expiry is less than 60 seconds away;
- share one in-flight refresh Promise so simultaneous queries cannot create a refresh storm;
- clear the session if refresh fails with an invalid/expired refresh token;
- expose a small subscription/event mechanism so React can update without Supabase `onAuthStateChange`.

## 6. Supabase data client

Keep `@supabase/supabase-js` for database, RPC, Storage, and Edge Function access, but configure the main data client so Supabase Auth does not manage browser state.

Conceptually:

```ts
createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  accessToken: async () => sessionManager.getValidAccessToken(),
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})
```

Supabase documentation supports supplying an async `accessToken` callback to a client. The callback returns the current user's JWT or null. This allows PostgREST/RPC requests to carry the normal Supabase Auth JWT even though the browser Auth SDK is not managing the session.

Because the tokens are still genuine Supabase Auth JWTs, existing RLS expressions such as `auth.uid()` continue to resolve the same user UUIDs. No role-table migration is required.

A separate lightweight unauthenticated client may be kept only where genuinely needed, but there must be one clear default authenticated data client for application data.

## 7. Login flow

1. User submits email/password.
2. Frontend immediately clears any old TalentBridge session and cached profile locally. It does not wait for a network logout.
3. Frontend calls `portal-auth` action `login` using the simple POST transport.
4. On invalid credentials, show the Auth error and keep the user on Login.
5. On success, write the returned session atomically.
6. Fetch `profiles` and `user_roles` for `session.user.id` through the authenticated data client.
7. If blocked, rejected, or pending, route to the access-status page.
8. If approved, resolve role priority as `super_admin` > `admin` > `associate` > `candidate`.
9. Route privileged roles to `/admin`; route candidates to `/jobs`.
10. If profile loading fails, show a bounded retry/error state; never leave the button spinning indefinitely.

No full browser reload is required for correctness. A reload may be used only if implementation testing proves it simplifies route initialization without reintroducing state problems.

## 8. Logout and account switching

Logout is local-first:

1. Capture the current access token if present.
2. Clear TalentBridge session and cached profile synchronously.
3. Route immediately to `/login`.
4. Fire a bounded `portal-auth` logout request to revoke the remote session.
5. A failed revoke must not restore the old local session or block the user.

Because the local session is cleared before network work, the next account can log in immediately. There is no Supabase Auth lock, no `onAuthStateChange` race, and no wait for browser SDK logout state.

## 9. Session refresh

`getValidAccessToken()` is the only path the data client uses to obtain authentication.

Behavior:

- If no TalentBridge session exists, return null.
- If the access token has more than 60 seconds remaining, return it immediately.
- If it is near expiry, start one refresh request through `portal-auth`.
- Concurrent callers await the same in-flight refresh Promise.
- On success, atomically store the rotated session and return the new access token.
- On definitive refresh failure, clear the session and emit a signed-out event.
- UI route guards then redirect to Login with a "Session expired. Please sign in again." message.

Network timeouts are bounded and surfaced. No authentication Promise is allowed to leave a button or route in an infinite loading state.

## 10. React authentication state

Replace the current Supabase Auth-driven session/profile hook with a TalentBridge-owned auth context or hook.

Suggested separation:

- `sessionManager.ts`: token storage, refresh, local events;
- `portalAuthApi.ts`: calls to the Edge Function;
- `authProfileApi.ts`: profile/role loading by known user ID;
- `AuthProvider.tsx` or equivalent: React state derived from the session manager;
- route guards: consume AuthProvider state only.

The provider state should distinguish:

- booting;
- signed_out;
- loading_profile;
- approved_candidate;
- approved_privileged;
- pending_approval;
- rejected;
- blocked;
- session_error.

This makes route behavior explicit instead of relying on several overlapping Supabase Auth callbacks.

## 11. Existing code to remove or replace

Normal application flow must not call the following browser Auth APIs after cutover:

- `supabase.auth.signInWithPassword()`;
- `supabase.auth.getSession()`;
- `supabase.auth.getUser()`;
- `supabase.auth.onAuthStateChange()`;
- `supabase.auth.signOut()` for normal logout;
- Supabase Auth automatic browser persistence/refresh.

Current temporary files/workarounds such as `directAuth.ts`, the direct `/auth/v1/token` browser request, the old login timeout workaround, and the temporary `password-login` Edge Function are removed after the replacement acceptance tests pass.

Application modules that currently discover the user through `supabase.auth.getUser()` must instead use the TalentBridge session user's UUID. This includes, where present:

- job interests;
- saved jobs;
- candidate applications;
- notifications;
- profile screens;
- admin settings/actions that need the current actor ID.

Authorization decisions remain server/database controlled. Supplying a user ID from the session is not a substitute for RLS or role checks.

## 12. Candidate approval and roles

No role migration is required.

Existing rows in `public.user_roles` remain authoritative. Existing `profiles.approval_status` and `profiles.is_blocked` remain authoritative.

The current examples remain valid:

- Candidate1: candidate;
- Akash: admin + candidate, effective role admin;
- Mayank: super_admin + candidate, effective role super_admin;
- original Super Admin: super_admin + candidate, effective role super_admin.

The role resolver always chooses the highest privilege role rather than deleting the candidate role.

## 13. Error handling

Authentication errors are categorized for useful UI behavior:

- invalid credentials: show "Invalid email or password";
- pending/rejected/blocked: authenticate successfully but route to access status;
- temporary network failure: show retryable connection error;
- login timeout: stop loading and show retry action;
- refresh expired/revoked: clear session and require sign-in;
- profile/role fetch error: preserve the valid session, show retry, and do not incorrectly downgrade/upgrade the role;
- malformed stored session: delete it and start signed out.

Passwords, access tokens, refresh tokens, recovery tokens, and service credentials must never be written to console logs, audit logs, GitHub Actions logs, or database audit payloads.

## 14. Security requirements

- Browser contains only the public/publishable Supabase key.
- No service-role or secret key is committed to GitHub or embedded in the Vite build.
- `portal-auth` uses server-side environment configuration supplied by Supabase.
- Login/refresh/signup/recovery calls use Supabase Auth as the credential authority; TalentBridge does not verify password hashes itself.
- `portal-auth` validates action names, required fields, input lengths, and JSON shape.
- Function responses use restrictive CORS for the TalentBridge production origin plus explicit local-development origins; CORS is treated as browser hygiene, not the authentication boundary.
- Function does not reflect arbitrary redirect URLs for password recovery; the production reset URL is allowlisted.
- Existing RLS remains enabled and is tested with candidate/admin/super-admin tokens.
- Access tokens are short-lived; refresh-token rotation is honored.
- Logout clears local state even if network revocation fails.
- No privileged authorization is based only on frontend role text.

## 15. Signup and approval behavior

Candidate signup stays available from "Request membership".

After signup:

1. Supabase Auth identity is created through `portal-auth`.
2. Existing profile/role trigger creates a pending candidate profile.
3. The browser does not retain a login session for the new candidate.
4. UI shows "Account created — waiting for admin approval."
5. Super Admin/Admin approval remains handled through the existing approved backend path.
6. Once approved, the candidate signs in normally through the new login flow.

## 16. Database impact

Expected database schema migration: none.

Before implementation, existing RLS policies and helper functions will be regression-tested with genuine Supabase Auth JWTs supplied through the new data-client callback. A database migration will be introduced only if a concrete failing policy proves necessary; it is not part of the planned architecture.

## 17. Testing strategy

### Unit tests

Cover:

- session serialization/deserialization;
- malformed-session clearing;
- access-token expiry calculation;
- single-flight refresh behavior;
- refresh-token rotation;
- refresh failure clears session;
- logout clears state synchronously;
- role-priority resolution;
- route decision for approved/pending/rejected/blocked accounts;
- portal-auth request transport does not use the old direct Auth browser path;
- no auth call can leave a Promise unbounded without UI recovery.

### Edge Function tests

Cover each action with success and failure cases, including invalid JSON, unsupported action, missing fields, invalid credentials, expired refresh token, and recovery-flow errors.

### Integration tests

With test accounts, verify:

- authenticated PostgREST query reaches data permitted by RLS;
- candidate cannot perform admin-only actions;
- admin can perform admin-authorized actions but not Super-Admin-only actions where restricted;
- Super Admin retains full intended access;
- token refresh does not change `auth.uid()`;
- role changes are picked up on the next profile/role load without recreating the Auth user.

### Browser acceptance test

In one normal Chrome profile:

Candidate1 login -> Candidate Jobs -> logout -> Akash login -> Admin -> logout -> Mayank login -> Super Admin -> logout -> original Super Admin login -> Super Admin.

Repeat once after an access token has been forced near expiry to verify refresh.

No step may require Incognito, local-storage manual clearing, a password reset, or a hard refresh.

## 18. Rollout

Use a staged cutover:

1. Implement session manager and portal-auth tests first.
2. Deploy `portal-auth` without removing the old path.
3. Wire the data client to the async access-token callback.
4. Replace Login and Logout.
5. Replace user-ID discovery in candidate/admin modules.
6. Replace Signup and password recovery.
7. Run unit/typecheck/build in GitHub Actions.
8. Run the full browser acceptance sequence.
9. Only after acceptance passes, remove temporary auth workarounds and the temporary `password-login` function.
10. Resume the Candidate Jobs grid redesign.

Rollback remains simple during the staged period because the existing database and Auth identities are unchanged.

## 19. Completion criteria

The authentication rebuild is complete only when all of the following are demonstrated with fresh evidence:

- GitHub Actions tests, typecheck, and production build pass;
- `portal-auth` is active and its action tests pass;
- Candidate1, Akash, Mayank, and the original Super Admin can all log in with correct routing;
- switching accounts in one browser works repeatedly;
- logout never blocks account switching;
- token refresh works;
- existing RLS still enforces candidate/admin/Super Admin permissions;
- no production browser flow uses Supabase Auth session-management APIs;
- no passwords or privileged secrets are exposed in frontend code or logs.
