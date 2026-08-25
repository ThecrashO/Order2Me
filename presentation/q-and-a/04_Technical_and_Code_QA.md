# Order2Me Q&A — Member 4

တာဝန်ယူရန် — Technology stack, code flow, Realtime, Proxy, Service Worker နှင့် keys

## လေ့ကျင့်ရန် စကားပြောပုံ

**ဆရာမ:** Frontend မှာ ဘာတွေသုံးထားလဲ?

**အဖွဲ့ဝင်:** HTML က page structure၊ CSS က design နဲ့ layout၊ Bootstrap 5 က responsive components၊ JavaScript က login၊ cart၊ order၊ database request နဲ့ realtime update လို application behavior တွေကို လုပ်ဆောင်ပါတယ်။ ဖုန်းနဲ့ computer နှစ်မျိုးလုံးမှာ သုံးနိုင်အောင် responsive design ပြုလုပ်ထားပါတယ်။

**ဆရာမ:** Supabase ကို ဘာကြောင့်ရွေးထားတာလဲ?

**အဖွဲ့ဝင်:** PostgreSQL Database၊ Authentication၊ Email OTP၊ Storage၊ Realtime နဲ့ Row Level Security တို့ကို platform တစ်ခုတည်းမှာရလို့ဖြစ်ပါတယ်။ Order2Me ရဲ့ realtime multi-user workflow အတွက်လိုအပ်တဲ့ backend services တွေနဲ့ကိုက်ညီပြီး backend ကိုအစကနေ အကုန်ရေးရမယ့်အချိန်ကိုလည်း လျှော့ချပေးပါတယ်။

**ဆရာမ:** Realtime ဘယ်လိုအလုပ်လုပ်လဲ?

**အဖွဲ့ဝင်:** Owner Dashboard က သူ့ဆိုင်ရဲ့ order changes ကို Supabase Realtime နဲ့ subscribe လုပ်ထားပါတယ်။ Customer order တင်တာနဲ့ database ထဲ record အသစ်ဝင်ပြီး Supabase က active WebSocket connection ကတစ်ဆင့် Owner browser ဆီ event ပို့ပါတယ်။ Owner status ပြောင်းတဲ့အခါ Customer browser က UPDATE event ရပြီး page refresh မလုပ်ဘဲ status အသစ်ကိုပြပါတယ်။

**ဆရာမ:** Role Guard နဲ့ RLS ဘာကွာလဲ?

**အဖွဲ့ဝင်:** Role Guard က frontend မှာ ဘယ် page ကိုဝင်နိုင်သလဲစစ်ပါတယ်။ RLS က database မှာ ဘယ် row ကိုဖတ်၊ ထည့်၊ ပြင်၊ ဖျက်နိုင်သလဲစစ်ပါတယ်။ Role Guard ကိုတံခါးစစ်ဆေးမှုလို့ယူဆနိုင်ပြီး RLS က data တစ်ခုချင်းစီရဲ့သော့နဲ့တူပါတယ်။ Frontend ကိုပြင်ပြီး Role Guard ကျော်ဖို့ကြိုးစားရင်တောင် RLS က database ဘက်မှာတားပါတယ်။

**ဆရာမ:** Public Key နဲ့ Service-Role Key ဘာကွာလဲ?

**အဖွဲ့ဝင်:** Public anon သို့မဟုတ် publishable key က frontend မှာအသုံးပြုဖို့ဖြစ်ပြီး browser မှာမြင်နိုင်ပါတယ်။ ဒီ key က Authentication နဲ့ RLS ကိုလိုက်နာရပါတယ်။ Service-role key က trusted backend အတွက်သာဖြစ်ပြီး RLS ကို bypass လုပ်နိုင်တာကြောင့် secret အဖြစ်ထားရပါတယ်။ Order2Me frontend ထဲမှာ service-role key မထည့်ထားပါဘူး။

**ဆရာမ:** Vercel Proxy ကို ဘာကြောင့်ထည့်ထားလဲ?

**အဖွဲ့ဝင်:** မြန်မာ mobile network အချို့မှာ browser က Supabase domain ကိုတိုက်ရိုက်ချိတ်တဲ့အခါ VPN မပါဘဲ Failed to Fetch ဖြစ်ခဲ့ပါတယ်။ ဒါကြောင့် Browser က Vercel domain ကိုအရင်ခေါ်ပြီး Proxy က Supabase ဆီ request ဆက်ပို့အောင်ပြုလုပ်ထားပါတယ်။ Flow က Browser မှ Vercel Proxy၊ ပြီးမှ Supabase ဖြစ်ပါတယ်။

**ဆရာမ:** Service Worker က ဘာလုပ်လဲ?

**အဖွဲ့ဝင်:** Service Worker က browser နောက်ခံမှာအလုပ်လုပ်နိုင်တဲ့ JavaScript component ဖြစ်ပါတယ်။ Static files တွေ cache လုပ်ခြင်း၊ cache အဟောင်းရှင်းခြင်းနဲ့ app ကို background ထားတဲ့အချိန် Push Notification လက်ခံပြသခြင်းတို့အတွက် အသုံးပြုထားပါတယ်။

**ဆရာမ:** Realtime နဲ့ Push Notification ဘာကွာလဲ?

**အဖွဲ့ဝင်:** Realtime က app ဖွင့်ထားချိန် page ထဲက data ကိုချက်ချင်းပြောင်းပြပါတယ်။ Push Notification က app မဖွင့်ထားချိန် သို့မဟုတ် background မှာထားချိန် operating system notification အဖြစ်အသိပေးပါတယ်။ Notification မရလည်း database data မပျောက်ဘဲ app ထဲဝင်ကြည့်ရင် status ကိုမြင်နိုင်ပါတယ်။

**ဆရာမ:** Cache version ကို ဘာကြောင့်ပြောင်းရလဲ?

**အဖွဲ့ဝင်:** Browser က CSS နဲ့ JavaScript file အဟောင်းတွေကို cache ထဲက ဆက်သုံးနေရင် deploy လုပ်ထားတဲ့ feature အသစ်ကို user ကမမြင်နိုင်ပါဘူး။ Cache version တိုးလိုက်တဲ့အခါ Service Worker က cache အဟောင်းရှင်းပြီး files အသစ်ကိုပြန်ယူပါတယ်။

**ဆရာမ:** Password တွေကို database ထဲမှာ သိမ်းထားလား?

**အဖွဲ့ဝင်:** Public users table ထဲ plaintext password မသိမ်းထားပါဘူး။ Supabase Authentication က secure one-way hashing နဲ့ password ကိုစီမံပါတယ်။ Developer နဲ့ Admin က user ရဲ့မူရင်း password ကိုဖတ်လို့မရပါဘူး။ Users table မှာတော့ name၊ email၊ phone နဲ့ role လို profile information ကိုပဲထားပါတယ်။

**ဆရာမ:** Customer ကနေ Owner ထိ Code Flow ကိုရှင်းပြပါ။

**အဖွဲ့ဝင်:** Customer checkout လုပ်တဲ့အခါ JavaScript က Customer ID၊ Shop ID၊ total နဲ့ Pending status ပါတဲ့ record ကို orders table ထဲထည့်ပါတယ်။ Item တစ်ခုချင်းစီကို Order ID နဲ့ order_items ထဲထည့်ပြီး payment record နဲ့ screenshot path ကိုလည်း Order ID နဲ့ချိတ်ပါတယ်။ Owner Dashboard က သူ့ Shop ID နဲ့သက်ဆိုင်တဲ့ orders ကိုပဲယူပြီး Realtime event ရတာနဲ့ order အသစ်ကိုပြပါတယ်။

## မှတ်ထားရန်

Public key ကိုမြင်ရုံနှင့် database ကိုစိတ်ကြိုက်ပြင်နိုင်သည်ဟု မပြောပါနှင့်။ Security ကို Authentication နှင့် RLS ကဆုံးဖြတ်ပြီး service-role key ကိုသာ secret အဖြစ်ထားရပါသည်။
