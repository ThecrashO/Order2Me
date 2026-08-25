# Order2Me Q&A — Member 3

တာဝန်ယူရန် — Admin workflow, shop approval, access control နှင့် security

## လေ့ကျင့်ရန် စကားပြောပုံ

**ဆရာမ:** Admin approval ကို ဘာကြောင့်လိုတာလဲ?

**အဖွဲ့ဝင်:** မည်သူမဆို ဆိုင်အတုဖွင့်ပြီး Customer ဆီက order နဲ့ payment information ရယူတာမျိုး မဖြစ်စေဖို့ Admin approval လိုပါတယ်။ Admin ကဆိုင်ဟာ UCSY canteen မှာ အမှန်တကယ်ရှိ၊ မရှိနဲ့ Owner information ကိုစစ်ပြီး Approved ဖြစ်တဲ့ဆိုင်ကိုပဲ Customer ဘက်မှာပြပါတယ်။

**ဆရာမ:** Admin ကဆိုင်အသစ်ကို ဘာတွေစစ်ဆေးလဲ?

**အဖွဲ့ဝင်:** ဆိုင်အမည်၊ Owner အမည်၊ email၊ ဖုန်းနံပါတ်၊ address နဲ့ description ကိုစစ်ပါတယ်။ လိုအပ်ရင် canteen ရဲ့အမှန်တကယ်ရှိတဲ့ဆိုင်စာရင်း သို့မဟုတ် တာဝန်ရှိသူနဲ့အတည်ပြုနိုင်ပါတယ်။ အချက်အလက်မှန်ရင် Approve လုပ်ပြီး မမှန်ရင် reason နဲ့ Reject လုပ်ပါတယ်။

**ဆရာမ:** Request ကို Reject လုပ်ရင် ဘာဖြစ်မလဲ?

**အဖွဲ့ဝင်:** Shop status က Rejected ဖြစ်သွားပြီး rejection reason ကိုသိမ်းထားပါတယ်။ အဲဒီ shop က Customer ဘက်မှာမပေါ်သလို Owner က approved shop အဖြစ် menu တင်ပြီး order လက်ခံလို့မရပါဘူး။ အချက်အလက်ပြင်ပြီးရင် Admin က နောက်တစ်ကြိမ် Approve လုပ်နိုင်ပါတယ်။

**ဆရာမ:** Admin ကဆိုင်တစ်ဆိုင်ကို ပိတ်ထားနိုင်လား?

**အဖွဲ့ဝင်:** ပိတ်နိုင်ပါတယ်။ Approved shop တစ်ဆိုင်မှာ ပြဿနာရှိလာရင် Admin က reason နဲ့ Suspend လုပ်နိုင်ပါတယ်။ Suspended ဖြစ်နေစဉ် Customer ဘက်က ပုံမှန်အတိုင်း order တင်လို့မရပါဘူး။ ပြဿနာဖြေရှင်းပြီးရင် Restore လုပ်ကာ Approved အဖြစ်ပြန်ဖွင့်နိုင်ပါတယ်။

**ဆရာမ:** Admin က System ထဲမှာ ဘာတွေလုပ်နိုင်လဲ?

**အဖွဲ့ဝင်:** Shop requests တွေကို Pending၊ Approved၊ Rejected နဲ့ Suspended အလိုက်ကြည့်ပြီး Approve၊ Reject၊ Suspend နဲ့ Restore လုပ်နိုင်ပါတယ်။ Customer၊ Owner နဲ့ Admin user စာရင်းကိုလည်း role အလိုက်ကြည့်ပြီး ရှာဖွေနိုင်ပါတယ်။ လက်ရှိ Version 1 Admin UI မှာ user account ကိုတိုက်ရိုက် delete သို့မဟုတ် suspend လုပ်တာတော့ မပါသေးပါဘူး။

**ဆရာမ:** Customer က Admin account ရယူနိုင်လား?

**အဖွဲ့ဝင်:** မရပါဘူး။ ပုံမှန် registration ကနေ Customer account ပဲရပါတယ်။ Admin role ကို frontend ကနေ ကိုယ်တိုင်ရွေးချယ်ပြောင်းလို့မရပါဘူး။ Admin page ကို URL နဲ့တိုက်ရိုက်ဝင်ရင် Role Guard ကတားပြီး database operation ကို RLS ကထပ်ကာကွယ်ပါတယ်။

**ဆရာမ:** Admin account ဝင်မရတော့ရင် ဘယ်လိုလုပ်မလဲ?

**အဖွဲ့ဝင်:** Password မေ့တာဆိုရင် verified email နဲ့ OTP အသုံးပြုပြီး reset လုပ်နိုင်ပါတယ်။ Email ပါဝင်မရတော့ရင် authorised developer သို့မဟုတ် Supabase project administrator က Dashboard ကနေ recovery လုပ်ပေးရပါတယ်။ တကယ်အသုံးပြုတဲ့အခါ single point of failure မဖြစ်အောင် authorised Admin နှစ်ယောက်ထားသင့်ပါတယ်။

**ဆရာမ:** Customer က တခြား Customer ရဲ့ order ကိုကြည့်နိုင်လား?

**အဖွဲ့ဝင်:** မရပါဘူး။ Order တစ်ခုစီကို Customer identity နဲ့ချိတ်ထားပြီး RLS က login ဝင်ထားတဲ့ Customer ကို သူကိုယ်တိုင်တင်ထားတဲ့ rows ကိုပဲ ဖတ်ခွင့်ပေးပါတယ်။ Order ID သိရုံနဲ့ တခြားသူရဲ့ data ကိုရယူလို့မရပါဘူး။

**ဆရာမ:** Database data ကို ဘယ်လိုကာကွယ်ထားလဲ?

**အဖွဲ့ဝင်:** Supabase Authentication နဲ့ identity အတည်ပြုပြီး Role Guard နဲ့ page access ကိုစစ်ပါတယ်။ Database မှာ RLS policy နဲ့ row တစ်ခုချင်းစီရဲ့ read၊ insert၊ update နဲ့ delete permission ကိုကန့်သတ်ထားပါတယ်။ HTTPS ကိုအသုံးပြုပြီး service-role key ကို frontend ထဲမထားပါဘူး။ Payment screenshots ကိုလည်း Storage access policy နဲ့သက်ဆိုင်သူတွေကိုပဲ ဖွင့်ခွင့်ပေးထားပါတယ်။

**ဆရာမ:** Spam orders တွေအများကြီးတင်ရင် ဘယ်လိုကာကွယ်မလဲ?

**အဖွဲ့ဝင်:** Verified account၊ phone number နဲ့ payment proof လိုအပ်တာက anonymous spam ကိုလျှော့ပေးပါတယ်။ ဒါပေမယ့် Version 1 မှာ application-level rate limit နဲ့ account suspension အပြည့်အဝမပါသေးပါဘူး။ Production မှာ order rate limit၊ suspicious activity log နဲ့ Admin account restriction feature တွေ ထပ်ထည့်သင့်ပါတယ်။

## မှတ်ထားရန်

Admin က user list ကိုကြည့်နိုင်သော်လည်း လက်ရှိ UI တွင် user account delete/suspend မပါသေးပါ။ Shop ကိုသာ Approve, Reject, Suspend, Restore လုပ်နိုင်ပါသည်။
