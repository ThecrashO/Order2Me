# Order2Me Project Documentation

ဤစာတမ်းသည် Order2Me project ကို စတင်လေ့လာသူတစ်ယောက်အနေဖြင့် system ဘယ်လိုအလုပ်လုပ်သလဲ၊ code ကို ဘယ်နေရာကစဖတ်ရမလဲနှင့် database/frontend ဘယ်လိုချိတ်ထားသလဲဆိုတာ နားလည်ရန် ရေးထားခြင်းဖြစ်သည်။

## 1. Project အကျဉ်းချုပ်

Order2Me သည် university canteen အတွက် multi-shop ordering web application ဖြစ်သည်။ ဆိုင်တစ်ဆိုင်၏ menu၊ orders၊ customers နှင့် payments များကို အခြားဆိုင်များနှင့် သီးခြားခွဲထားသည်။

အသုံးပြုသူ role သုံးမျိုးရှိသည်။

1. **Customer** — ဆိုင်ရွေး၊ menu ကြည့်၊ cart ထဲထည့်၊ order တင်နှင့် status ကြည့်နိုင်သည်။
2. **Owner** — ကိုယ့်ဆိုင် menu၊ orders၊ customers နှင့် shop availability ကိုစီမံနိုင်သည်။
3. **Admin** — owner လျှောက်လွှာကို approve/reject/suspend/restore လုပ်နိုင်သည်။

Production website: `https://order2me.vercel.app/`

## 2. အသုံးပြုထားသောနည်းပညာ

| အပိုင်း | နည်းပညာ | အသုံးပြုပုံ |
|---|---|---|
| Frontend | HTML, CSS, JavaScript | Page structure၊ UI နှင့် logic |
| UI | Bootstrap 5 | Grid၊ modal၊ responsive layout |
| Backend | Supabase | Auth၊ PostgreSQL၊ Storage၊ Realtime |
| Hosting | Vercel | Static pages၊ runtime config နှင့် proxy |
| PWA | Manifest + Service Worker | Installable app နှင့် caching |
| Alerts | Browser Notification API | Permission ရရှိချိန် local alerts |

React/Vue/Express မသုံးထားပါ။ HTML pages များက JavaScript files များကို တိုက်ရိုက် load လုပ်သည်။

## 3. System စီးဆင်းပုံ

```text
Browser
  ├─ HTML/CSS/JavaScript (Vercel)
  ├─ /api/config → Supabase URL + publishable key
  ├─ /supabase/* → Vercel rewrite → Supabase REST/Auth/Storage
  └─ Direct Supabase Realtime connection
                          │
                          ▼
             Auth + Postgres + Storage + Realtime
```

Browser က Supabase JavaScript SDK ကိုသုံးသည်။ လုံခြုံရေးကို frontend button မဟုတ်ဘဲ Supabase Row Level Security (RLS) နှင့် database triggers က ဆုံးဖြတ်သည်။

## 4. Folder နှင့် file များ

```text
Order2Me/
├── index.html                 Landing page
├── login.html                 Login
├── signup.html                Customer/Owner signup
├── forgot-password.html       Reset email တောင်းရန်
├── reset-password.html        Password အသစ်ထားရန်
├── customer.html              Customer dashboard
├── owner.html                 Owner dashboard
├── admin.html                 Admin dashboard
├── pending.html               Owner approval စောင့်ရန်
├── history.html               Order history/report
├── css/style.css              UI styles အားလုံး
├── js/
│   ├── supabase.js            Supabase clients
│   ├── auth.js                Auth၊ roles၊ profile/shop creation
│   ├── login.js / signup.js   Auth forms
│   ├── password-recovery.js   Forgot/reset password
│   ├── customer.js            Customer logic
│   ├── owner.js               Owner logic
│   ├── admin.js               Admin logic
│   ├── pending.js             Approval status
│   ├── history.js             History/CSV
│   ├── profile.js             Profile photo helpers
│   └── notification-permissions.js
├── api/config.js              Vercel runtime config
├── vercel.json                Supabase proxy rewrite
├── sw.js                      Service Worker/cache
├── manifest.json              PWA metadata
├── database.sql               Base schema အဟောင်း
└── supabase/                  လက်ရှိ migrations/patches
```

## 5. Page တစ်ခုချင်း၏တာဝန်

### Login နှင့် Signup

`login.html` က email/password sign-in ပြုလုပ်ပြီး `getCurrentProfile()` မှ role ဖတ်ကာ dashboard သို့ပို့သည်။ `signup.html` တွင် name၊ phone၊ email၊ password မဖြစ်မနေလိုသည်။ Owner ရွေးလျှင် shop name/address/description ထပ်ဖြည့်ရပြီး admin approval စောင့်ရသည်။

### Customer dashboard

`customer.html` + `js/customer.js` က:

- Approved shop ရွေးခြင်းနှင့် owner profile/phone ကြည့်ခြင်း
- Menu search/category filtering
- Cart၊ checkout၊ payment method နှင့် screenshot upload
- Today’s orders နှင့် progress tracker
- Owner sent လုပ်ပြီးနောက် customer received အတည်ပြုခြင်း
- Realtime updates၊ polling fallback နှင့် notifications

### Owner dashboard

`owner.html` + `js/owner.js` က:

- Order search/status filters
- Accept၊ reject၊ ready၊ sent status actions
- Customer name နှိပ်ပြီး profile ကြည့်/ဖုန်းခေါ်ခြင်း
- Menu add/edit/delete/availability နှင့် customer-view image preview
- Customers နှင့် history
- Shop open/closed၊ accepting orders၊ opening hours၊ preparation time

### Admin နှင့် Pending

`admin.html` + `js/admin.js` က shops ကို approve/reject/suspend/restore လုပ်သည်။ Owner approved မဖြစ်သေးလျှင် `pending.html` ကိုသာကြည့်ရသည်။

## 6. Account lifecycle

```text
Signup form
  → phone/email/password validation
  → supabase.auth.signUp()
  → verification email
  → user email link နှိပ်
  → ပထမဆုံး login
  → Auth metadata မှ public.users profile ဖန်တီး
  → Owner ဖြစ်လျှင် pending shop ဖန်တီး
```

`signUpAccount()` က name၊ phone၊ role နှင့် shop fields ကို Auth metadata ထဲထည့်သည်။ Confirmation ပြီး ပထမဆုံး login တွင် `getCurrentProfile()` က profile မရှိလျှင် metadata ဖြင့် profile/shop ဖန်တီးသည်။

Email inbox ပိုင်ရှင်ကို စစ်ရန် Supabase Dashboard တွင် `Confirm email = ON` ဖြစ်ရမည်။ Code တစ်ခုတည်းက email ပိုင်ဆိုင်မှုကို မစစ်နိုင်ပါ။

Role redirect:

| State | Page |
|---|---|
| Customer | `customer.html` |
| Approved Owner | `owner.html` |
| Pending/Rejected/Suspended Owner | `pending.html` |
| Admin | `admin.html` |

Password reset flow:

```text
Login → Forgot password → Email ထည့် → Reset link
→ reset-password.html → Password အသစ် → Login ပြန်ဝင်
```

## 7. Database tables

### `users`

Application profiles သိမ်းသည်။ Supabase `auth.users` နှင့် `auth_user_id` ဖြင့်ချိတ်သည်။ အဓိက fields: `id`, `auth_user_id`, `name`, `email`, `phone_number`, `role`, `avatar_path`။

### `shops`

Owner ၏ shop profile ဖြစ်သည်။ `owner_id` က `users.id` ကို reference လုပ်သည်။ Status၊ opening hours၊ accepting-orders controls၊ contact နှင့် address သိမ်းသည်။

### `menu_items`

`shop_id`, name၊ description၊ price၊ category၊ image နှင့် availability သိမ်းသည်။

### `orders`

Customer order header ဖြစ်သည်။ Customer/shop၊ status၊ total၊ delivery note နှင့် created time ပါသည်။

```text
pending → preparing → ready → out_for_delivery → delivered
    └──────────────────────────────→ cancelled
```

Owner က sent အထိပြောင်းနိုင်ပြီး delivered ကို customer ကပစ္စည်းရရှိပြီးမှ confirm လုပ်သည်။ Database trigger က မမှန်သော role/status changes ကိုတားသည်။

### `order_items` နှင့် `payments`

`order_items` က item၊ quantity နှင့် order တင်ချိန် price သိမ်းသည်။ `payments` က payment method နှင့် screenshot storage path သိမ်းသည်။ Private image အတွက် အချိန်ကန့်သတ် signed URL ထုတ်သုံးသည်။

## 8. RLS လုံခြုံရေး

- User သည် ကိုယ့် profile ကိုဖတ်/ပြင်နိုင်သည်။
- Admin သည် profiles/shops အားလုံးကိုစီမံနိုင်သည်။
- Owner သည် ကိုယ့် approved shop ၏ menu/orders/customers ကိုသာကြည့်နိုင်သည်။
- Customer သည် ကိုယ့် orders/payments ကိုသာဖတ်နိုင်သည်။
- Customer သည် approved နှင့် လက်ခံနေသော shop တွင်သာ order တင်နိုင်သည်။
- Order status transition ကို database trigger က server-side စစ်သည်။

Frontend တွင် button ဖျောက်ခြင်းသည် security မဟုတ်ပါ။ Authorization ကို RLS/trigger ကသာ အာမခံသည်။

## 9. Storage

Menu images၊ payment screenshots နှင့် profile images သိမ်းသည်။ Payment/profile images ကို storage policies ဖြင့်ဖတ်ခွင့်စစ်ထားသည်။ Database ထဲ signed URL အမြဲတမ်းမသိမ်းဘဲ storage path သိမ်းပြီးလိုအပ်ချိန် signed URL အသစ်ထုတ်ရသည်။

## 10. Realtime နှင့် polling

Owner/Customer pages က `orders` Realtime updates နားထောင်သည်။ ISP တချို့တွင် Supabase WebSocket မရသောကြောင့် 8 စက္ကန့် polling fallback ပါသည်။

```text
Realtime connected → update ချက်ချင်း
Realtime error/blocked → 8-second polling
```

REST/Auth ကို Vercel proxy မှတစ်ဆင့်သုံးပြီး Realtime ကို direct client သုံးသည်။ Vercel external rewrite က WebSocket proxy အဖြစ်မလုံလောက်သဖြင့် fallback ထားခြင်းဖြစ်သည်။

## 11. Notifications

လက်ရှိ system သည် Browser Notification API၊ sound၊ toast နှင့် Realtime/polling event detection သုံးသည်။ Web Push backend အပြည့်မဟုတ်သောကြောင့် app/browser လုံးဝပိတ်ထားချိန် delivery ကိုအာမခံမရပါ။ Full background push အတွက် push subscription database + server/Edge Function လိုသည်။

## 12. Vercel config နှင့် keys

Vercel Environment Variables:

```text
SUPABASE_URL=https://example.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

`api/config.js` က runtime config ပေးပြီး `vercel.json` က `/supabase/*` requests ကို Supabase သို့ rewrite လုပ်သည်။

- Publishable/anon key ကို frontend တွင်သုံးနိုင်သည်။
- `service_role`/secret key ကို frontend/Git ထဲ လုံးဝမထည့်ရ။
- `.env.local` ကို commit မလုပ်ရ။
- Publishable key သုံးထားလည်း RLS မပိတ်ရ။

## 13. Local run

```powershell
npm install
npx vercel dev
```

Terminal ပြသည့် URL (ပုံမှန် `http://localhost:3000`) ကိုဖွင့်ပါ။ VS Code Live Server သည် `.env.local`, `/api/config` နှင့် Vercel rewrite မ run ပေးပါ။

`.env.local`:

```text
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

## 14. Supabase migration အစီအစဉ်

Fresh/old database အခြေအနေပေါ်မူတည်သော်လည်း လက်ရှိ feature set အတွက်:

1. `database.sql` — base schema မရှိသေးမှသာ
2. `supabase/multi_shop_migration.sql`
3. `supabase/shop_availability.sql`
4. `supabase/profile_images.sql`
5. `supabase/customer_read_owner_profile_images.sql`
6. `supabase/customer_received_confirmation.sql`
7. `supabase/admin_users_notifications_screenshot_patch.sql`
8. `supabase/allow_duplicate_profile_names.sql` — old unique-name constraint ရှိမှသာ
9. `supabase/required_account_contact.sql` — profile အသစ် phone မဖြစ်မနေ
10. `supabase/create_admin.sql` — admin Auth user ဖန်တီးပြီး email ပြင်ကာ run
11. `supabase/v1_security_lockdown.sql` — migration အားလုံးပြီးနောက် anonymous table access ကိုပိတ်ရန် နောက်ဆုံး run

Production တွင် migration မ run မီ backup ယူပါ။ Run ပြီးသား file ကိုမသေချာဘဲ ထပ်မ run သင့်ပါ။

## 15. Email configuration

```text
Authentication → Sign In / Providers → Email → Confirm email = ON
```

```text
Site URL:
https://order2me.vercel.app

Redirect URLs:
https://order2me.vercel.app/login.html
https://order2me.vercel.app/login.html?verified=1
https://order2me.vercel.app/reset-password.html
http://localhost:3000/login.html
http://localhost:3000/login.html?verified=1
http://localhost:3000/reset-password.html
```

Custom SMTP မရှိလျှင် Supabase default email service တွင် production delivery/rate ကန့်သတ်ချက်ရှိသည်။ Code flow ရှိခြင်းနှင့် email တကယ်ရောက်ခြင်း မတူပါ။

## 16. Service Worker cache

`sw.js` က app shell cache လုပ်သည်။ Deploy ပြီးအဟောင်းပဲပေါ်လျှင်:

1. `CACHE_NAME` version တိုးထားကြောင်းစစ်ပါ။
2. `Ctrl + Shift + R` hard refresh လုပ်ပါ။
3. DevTools → Application → Service Workers တွင် update/unregister လုပ်ပါ။
4. Mobile browser site data/cache ရှင်းပါ။

Cache ရှိခြင်းသည် Supabase data offline ရမည်ဟု မဆိုလိုပါ။ Database query အတွက် network လိုသည်။

## 17. Troubleshooting

### Login `Failed to fetch`

- `/api/config` response စစ်ပါ။
- Vercel env variables စစ်ပါ။
- Network tab တွင် `/supabase/auth/v1/...` status ကြည့်ပါ။
- Local တွင် Live Server အစား `npx vercel dev` သုံးပါ။

### Order update မဖြစ်

- Realtime status/Console `CHANNEL_ERROR` စစ်ပါ။
- Realtime publication ထဲ `orders` ပါမပါစစ်ပါ။
- 8 စက္ကန့် polling နောက် update ရမရကြည့်ပါ။
- RLS select policy စစ်ပါ။

### Image မပေါ်

- Bucket/path နှင့် Storage RLS စစ်ပါ။
- Signed URL expire ဖြစ်မဖြစ်စစ်ပါ။
- Public URL နှင့် private storage path မရောထားကြောင်းစစ်ပါ။

### Verification/reset email မရ

- Confirm email ON နှင့် redirect allow list စစ်ပါ။
- Supabase Auth Logs၊ Spam folder နှင့် email rate limit စစ်ပါ။

## 18. Code ကိုစဖတ်ရန်အစီအစဉ်

1. `login.html` → `js/login.js` → `js/auth.js`
2. `js/supabase.js` → `api/config.js` → `vercel.json`
3. `customer.html` → `js/customer.js` ရှိ menu → cart → checkout → order flow
4. `owner.html` → `js/owner.js` ရှိ order lifecycle/menu CRUD
5. `supabase/multi_shop_migration.sql` ရှိ RLS policies/triggers
6. `admin.html` → `js/admin.js` ရှိ approval lifecycle

## 19. Code ပြင်ရာတွင်သတိထားရန်

- Order status အသစ်ထည့်လျှင် database constraint၊ trigger၊ owner/customer UI၊ history နှင့် notifications အားလုံးပြင်ရသည်။
- Column အသစ်ထည့်လျှင် queries၊ RLS၊ grants နှင့် migration စစ်ရသည်။
- Storage ပြောင်းလျှင် upload path၊ signed URL နှင့် policies အားလုံးစစ်ရသည်။
- Cached file ပြောင်းတိုင်း Service Worker cache version တိုးရသည်။
- User string ကို HTML ထဲထည့်လျှင် `escapeHtml()` သုံးရသည်။
- Phone display value နှင့် `tel:` value ကိုသီးခြား sanitize လုပ်ရသည်။

## 20. လက်ရှိအခြေအနေ

Project တွင် multi-shop ordering၊ role dashboards၊ admin approval၊ menu images၊ payment proof၊ profiles၊ phone-call actions၊ realtime + polling၊ browser notifications၊ email confirmation hooks နှင့် password recovery pages ပါရှိသည်။ Production တွင် အဓိကစောင့်ကြည့်ရန်မှာ email delivery limits၊ ISP မှ direct Realtime ပိတ်ခြင်း၊ Service Worker cache နှင့် SQL migrations run ပြီး/မပြီးတို့ဖြစ်သည်။
