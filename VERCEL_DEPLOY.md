# Vercel and Supabase configuration

Order2Me loads its browser-safe Supabase configuration from the Vercel Function at `/api/config`. The values are no longer committed in `js/supabase.js`.

## 1. Prepare Supabase

1. Open **Supabase Dashboard → SQL Editor**.
2. Run `supabase/profile_images.sql` once.
3. Open **Project Settings → API Keys**.
4. Copy the **Project URL** and a **Publishable key** (`sb_publishable_...`).

Never use a Secret key or the legacy `service_role` key in this frontend project. Those keys bypass Row Level Security.

## 2. Add Vercel environment variables

Open **Vercel Dashboard → Order2Me project → Settings → Environment Variables** and add:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | Your Supabase Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Your `sb_publishable_...` key |

Select **Production**, **Preview**, and **Development** for both variables, then save them.

## 3. Deploy

Push the project to the Git repository connected to Vercel. If the current deployment was created before the variables were added, open **Deployments**, choose the latest deployment, and select **Redeploy**. Environment-variable changes apply only to new deployments.

After deployment:

1. Open `https://YOUR-DOMAIN/api/config` and confirm it returns `window.__ORDER2ME_CONFIG__`.
2. Open the app and sign in as customer, owner, and admin.
3. Upload a JPG, PNG, or WebP profile image smaller than 3 MB.
4. Hard-refresh once so service-worker cache `order2me-v12` replaces the old app shell.

The publishable key returned by `/api/config` is intentionally visible to browsers. Security is enforced by the database and Storage RLS policies. The endpoint keeps configuration out of Git and lets each Vercel environment use a different Supabase project.

## Local development

Use Vercel's local runtime because a plain static server cannot run `/api/config`:

```powershell
vercel link
vercel dev
```

Alternatively, copy `.env.example` to `.env.local`, fill in the two browser-safe values, and run `vercel dev`. `.env.local` is ignored by Git.
