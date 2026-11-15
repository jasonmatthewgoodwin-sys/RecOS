# Outlook through Microsoft Graph

Route B of section 24.1: RecOS reaches Jason's mailbox and calendar itself, rather than only through Claude's Outlook connector in the cloud routines. Built on 15 November 2026; not deployed.

## Files

| File | What it holds |
| --- | --- |
| `index.ts` | The two routes: `GET /outlook/start` and `GET /outlook/callback` |
| `graph.ts` | The adapter operations of 24.2 and 24.3, importable by other functions without starting a server: `getAccessToken`, `sendMail`, `createDraft`, `findMessages`, `readMessage`, `listEvents`, and the send engine's hook `sendViaGraph` |
| `../connections/index.ts` | Granola and Spott keys, and Disconnect for all three apps |

## How Jason connects

1. Settings, Connections, Connect Outlook. The browser asks the database for a one-time state (`connection_oauth_begin`, owner only, good for ten minutes, only its hash is kept) and opens `/outlook/start?state=...`.
2. `start` checks the state and sends him to Microsoft's `common` endpoint with `offline_access User.Read Mail.Send Mail.ReadWrite Calendars.Read`. He signs in with his work account and consents as a user.
3. `callback` takes the state once, swaps the code for tokens, reads his name and address from `/me`, stores the refresh token in Supabase Vault (`connection_connect`) and sends him back to `/settings/connections?outlook=connected`, or `?outlook=error&reason=...` (`state`, `declined`, `microsoft`, `no_code`, `token`, `profile`, `store`, `not_configured`).

Sign-in to RecOS is unchanged: it still asks Microsoft for name and email only (CLAUDE.md rule 7). This is a separate connection, made once, with its own app registration.

## The app registration

Multi-tenant, in an Azure directory Jason owns (his firm's Entra does not let him register apps). Web platform, redirect URI `https://vbnzdugfgoletjlumxba.supabase.co/functions/v1/outlook/callback`. Delegated Graph permissions: `offline_access`, `User.Read`, `Mail.Send`, `Mail.ReadWrite`, `Calendars.Read`. One client secret.

```bash
supabase secrets set MS_CLIENT_ID=... MS_CLIENT_SECRET=... --project-ref vbnzdugfgoletjlumxba
# Optional; these are the defaults:
supabase secrets set MS_REDIRECT_URI=https://vbnzdugfgoletjlumxba.supabase.co/functions/v1/outlook/callback APP_URL=https://rec-os-gules.vercel.app --project-ref vbnzdugfgoletjlumxba
supabase functions deploy outlook --no-verify-jwt
supabase functions deploy connections --no-verify-jwt
```

Type the secret values in the terminal, never in a chat. If his firm requires admin consent for user apps, the consent screen will say so and the callback returns `reason=declined` or `microsoft`.

## Where the secrets live

The refresh token, and the Granola and Spott keys, are Vault secrets named `recos_conn_<provider>_<owner id>`. Only the definer functions in migration 0038 touch the vault, and all but `connection_oauth_begin` and `connection_owner` are granted to `service_role` alone. The browser sees the `connections` table: status, account label, when it was connected and last worked, the last error. Microsoft rotates the refresh token; `getAccessToken` stores the new one each time.

Health (24.9): a good token refresh marks the connection `connected` and moves `last_ok_at`; `invalid_grant` or a 401 marks it `needs_sign_in`; a 403 or 5xx from Graph marks it `failing`.

## The send engine hook

Today the send engine (migration 0034, `functions/send`) hands queued email to the `a8_sender` routine, a Claude cloud routine that calls `/send/tick`, sends each message through Jason's Outlook connector and posts `/send/report`. That stays as it is.

Once Outlook is connected, the tick can carry email itself. In a later commit to `functions/send` (its builder's file, not changed here):

```ts
import { sendViaGraph } from '../outlook/graph.ts'

// In the /send/tick handler, after send_tick returns:
const left = []
for (const m of data.messages) {
  if (m.channel !== 'email') { left.push(m); continue }
  const r = await sendViaGraph(m.message_id, db)
  if (!r.sent && r.fallback) left.push(m)   // the routine carries it, as today
}
return ok({ messages: left, count: left.length })
```

`sendViaGraph(messageId)` only acts on a message already in state `sending` (the engine has decided; rule 5 holds). It sends with `POST /me/sendMail`, `saveToSentItems: true`, and calls `send_report` with the outcome, so the send log, the follow-up, the KPI event, the three-try rule and the email pause all work as they do for the routine. It returns `fallback: true` without reporting when Graph cannot carry the message (Outlook not connected or needing sign-in, the app registration not set, no address held), so the routine still sends it. A scheduled call to `/send/tick` (pg_cron or the routine itself) then sends without Claude in the loop.

Pending Jason in `docs/decisions.md`: prefer Graph, fall back to the routine.
