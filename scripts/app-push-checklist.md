# App push ops checklist (Star Conectados)

Server-only Expo Push. App channel: `/api/app/*`. Do not use `/api/whatsapp` or Graph/Meta.

Code paths (already on `main`):

- Register: `POST /api/app/devices` → `public.app_devices`
- Send: `lib/expo-push.ts` → `https://exp.host/--/api/v2/push/send`
- Chat hook: `persistOutboundMessage` → `enqueueAppPush` → `notifyAppChatPush`
- Ticket hook: `createFieldTicket` (INSERT only) → `notifyAppFieldTicketPush`
- Table/column: `public.field_tickets.crm_client_id`

## 0) Production readiness

- [ ] Vercel deploy includes commit with `lib/app-push.ts` + hooks (auto-deploy from `main` if linked).
- [ ] Vercel env: `EXPO_ACCESS_TOKEN` if Expo **Enhanced Security for Push Notifications** is ON.
  - Create: expo.dev → Access tokens → paste into Vercel Production → redeploy.
- [ ] EAS project has FCM (Android) + APNs (iOS). Ticket `ok` without these = no OS banner.
- [ ] Optional Realtime DELETE fix: apply `supabase/migrations/20261021030000_realtime_replica_identity.sql` (app open; not required for background push).

Local probe (no CRM send):

```bash
pnpm verify:expo-push
pnpm verify:expo-push -- --token "ExponentPushToken[…]"
```

## 1) Device registration

- [ ] Login on **EAS APK** (not Expo Go), accept notifications.
- [ ] Supabase: row in `app_devices` for that `client_id` with `ExponentPushToken[…]`.

## 2) Chat push (closes audit item J)

- [ ] App background / locked.
- [ ] CRM: send message on that client's **app** thread (`POST /api/crm/messages/send` / UI Enviar).
- [ ] Banner **Star Conectados** → tap opens Chat.
- [ ] Vercel logs: `[EXPO_PUSH] sent { kind: 'chat_message', status: 200, expoTicketId: '…', expoStatus: 'ok' }`.
- [ ] Negative: internal note (`type=note`) and client inbound (`type=in`) → **no** chat push log.

## 3) Field ticket push

- [ ] App background / locked.
- [ ] CRM: **create** field ticket with `crm_client_id` set (chat form does this).
- [ ] Banner **Visita técnica registrada** → tap opens Mi ticket.
- [ ] Log: `[EXPO_PUSH] sent { kind: 'field_ticket', status: 200, expoTicketId: '…' }`.
- [ ] UPDATE/reassign/close → no new ticket push.

## 4) Evidence to mark J PASS

Save: date, env (`innover-flow.vercel.app`), `client_id`, log snippet with HTTP 200 + `expoTicketId`, manual banner confirmation.

## Troubleshooting

| Symptom | Likely cause |
|--------|----------------|
| `[APP_PUSH] no_devices` | No `app_devices` row — fix APK register |
| HTTP 401/403 from Expo | Missing/invalid `EXPO_ACCESS_TOKEN` |
| `DeviceNotRegistered` | Stale token (CRM deletes it) — re-login APK |
| 200 + `ok` but no banner | FCM/APNs / OS permission / channel `star-chat` in app |
| No `[EXPO_PUSH]` log at all | Deploy missing push code, or send path not `persistOutboundMessage` |
