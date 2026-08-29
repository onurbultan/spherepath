# WhatsApp Groups API activation

Spherepath supports groups created by the official Meta Groups API. It does not scrape WhatsApp Web and does not attach to an existing consumer or WhatsApp Business app group.

## Meta prerequisites

- Official Business Account (OBA) with WhatsApp Groups API access
- Meta app and WhatsApp Business Account
- Business Phone Number ID
- Permanent/system-user Graph API access token with the required WhatsApp permissions
- Meta app secret

## Firebase secrets

Configure the following secrets without placing their values in source control:

```sh
pnpm exec firebase functions:secrets:set WHATSAPP_GRAPH_ACCESS_TOKEN
pnpm exec firebase functions:secrets:set WHATSAPP_APP_SECRET
pnpm exec firebase functions:secrets:set WHATSAPP_WEBHOOK_VERIFY_TOKEN
```

`WHATSAPP_WEBHOOK_VERIFY_TOKEN` is an internal random value chosen by the Spherepath operator. Enter that same value in Meta's webhook configuration.

Deploy the integration functions after all three secrets exist:

```sh
pnpm exec firebase deploy --only functions:getWhatsAppGroupIntegration,functions:configureWhatsAppGroupIntegration,functions:createWhatsAppOfficeGroup,functions:whatsappGroupsWebhook,functions:listInboxItems
```

## Meta webhook

The callback URL is shown under **Ayarlar → WhatsApp grubu**. Subscribe the WhatsApp Business Account to:

- `messages`
- `group_lifecycle_update`
- `group_participants_update`
- `group_settings_update`
- `group_status_update`

Spherepath verifies `X-Hub-Signature-256` with the Meta app secret. Unsupported payloads are ignored. Supported text messages are masked and classified before persistence; raw webhook bodies, sender phone numbers, and unmasked sensitive text are never stored.

## Product setup

1. Open **Ayarlar → WhatsApp grubu** as the office broker.
2. Enter the Business Phone Number ID, group subject, description, and join approval mode.
3. Save the setup, then choose **Meta grubunu oluştur**.
4. Wait for the signed `group_lifecycle_update` webhook. The group ID and invite link appear automatically.
5. Share the invite link with up to eight participants.

Every supported group text message then appears once in the shared office Akış with **Kontrol gerekli** status. No contact, opportunity, or listing is created without a user review step.
