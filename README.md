# Order2Me

University Canteen Ordering System

## Tech Stack

- HTML
- CSS
- JavaScript
- Bootstrap
- Supabase


## Current Progress

Day 2:
- Project Setup Completed
- Database Connected
- Menu Fetch Completed

Day 3:
- Menu UI Created (Student & Owner)
- Owner Add/Edit/Delete Menu Implemented
- Student Cart System Started
- Enhanced Styling & Animations

## Features

### Student Dashboard
- Browse available menu items
- View food name, description, and price
- Add items to cart
- Real-time menu updates

### Owner Dashboard
- Add new menu items
- Edit existing menu items
- Delete menu items
- Toggle item availability
- View all menu items in a table

### Multi-Shop & Administration
- Customers can choose from multiple approved shops
- Each owner's menu, orders, customers, payments, and reports are isolated by shop
- Shop owners apply during signup and wait for administrator approval
- Administrators can approve, reject, suspend, and restore shops
- Existing data is migrated into an approved `Main Canteen` shop

## Multi-Shop Database Setup

For an existing Supabase project:

1. Run `supabase/multi_shop_migration.sql` in the Supabase SQL Editor.
2. Create an authentication user for the administrator in Supabase Dashboard.
3. Edit the email in `supabase/create_admin.sql`, then run that file.
4. Hard-refresh the web app so service-worker cache `order2me-v11` is active.

## Profile Photos and Vercel

1. Run `supabase/profile_images.sql` in Supabase SQL Editor.
2. Follow `VERCEL_DEPLOY.md` to configure `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.
3. Never add a Supabase Secret key or `service_role` key to this frontend project.

## Database Schema

### menu_items table
- `id` (Primary Key)
- `name` (Text)
- `description` (Text)
- `price` (Numeric)
- `is_available` (Boolean)
- `created_at` (Timestamp)
