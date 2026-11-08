# T-CARE Supabase Setup — Free Plan

This is the infrastructure setup for the current backend implementation.

## 1. Create the Supabase project

Create one Supabase project for the T-CARE backend.

For now, use the Free plan.

## 2. Database

Use the project's PostgreSQL database. Copy the server-side connection string from the Supabase Dashboard → Connect and place it in:

```env
DATABASE_URL="..."
```

Prisma uses this connection for T-CARE application tables.

## 3. Storage

Create a private Storage bucket:

```text
Name: tcare-media
Public: OFF
```

Initial media areas can use object-key prefixes:

```text
plants/<plant-id>/...
users/<user-id>/...
services/<booking-id>/...
reports/<report-id>/...
makeovers/<record-id>/...
```

Do not create separate buckets for every resource type unless a later security/compliance requirement justifies it.

## 4. Server credentials

Add these to the backend `.env`:

```env
SUPABASE_URL="https://<project-ref>.supabase.co"
SUPABASE_SECRET_KEY="<server-only-supabase-secret-key>"
SUPABASE_STORAGE_BUCKET="tcare-media"
```

The Supabase Secret API key must never be committed to Git and must never be sent to the browser.

## 5. Frontend credentials

When the React frontend is eventually connected to Supabase directly for any client-safe feature, use only a publishable/anon client credential. Do not reuse the Supabase Secret API key.

The current architecture keeps business operations behind the Node.js API.

## 6. Free → Pro upgrade

No application schema migration is required merely because the Supabase project changes plan. The same project/database/storage resources can continue to be used. The upgrade changes available quotas/resources rather than the T-CARE domain model.

Before production launch, review current Supabase plan limits, backups/PITR options, storage/egress usage and billing controls for the selected plan.
