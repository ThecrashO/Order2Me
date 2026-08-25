# Order2Me Q&A — Member 5

တာဝန်ယူရန် — Database design, testing, limitations, deployment နှင့် future plan

## လေ့ကျင့်ရန် စကားပြောပုံ

**ဆရာမ:** Database မှာ အဓိက table တွေကဘာတွေလဲ?

**အဖွဲ့ဝင်:** Users၊ Shops၊ Menu Items၊ Orders၊ Order Items နဲ့ Payments tables တွေဖြစ်ပါတယ်။ Users မှာ profile နဲ့ role၊ Shops မှာ shop information နဲ့ approval status၊ Menu Items မှာဆိုင်ရဲ့ menu၊ Orders မှာ Customer၊ Shop၊ total နဲ့ status၊ Order Items မှာမှာယူထားတဲ့ item တစ်ခုချင်းစီ၊ Payments မှာ payment method နဲ့ screenshot path ကိုသိမ်းထားပါတယ်။

**ဆရာမ:** Table တွေကို ဘယ်လိုဆက်စပ်ထားလဲ?

**အဖွဲ့ဝင်:** Shop တစ်ဆိုင်မှာ menu items အများကြီးရှိပြီး Menu Item တစ်ခုစီမှာ Shop ID ပါပါတယ်။ Order တစ်ခုမှာ Customer ID နဲ့ Shop ID ပါပြီး Order Items တွေကို Order ID နဲ့ချိတ်ထားပါတယ်။ Payment record ကိုလည်း Order ID နဲ့ချိတ်ထားပါတယ်။ ဒီဆက်စပ်မှုတွေကို primary key နဲ့ foreign key တွေသုံးပြီး ထိန်းထားပါတယ်။

**ဆရာမ:** PostgreSQL ဆိုတာဘာလဲ?

**အဖွဲ့ဝင်:** PostgreSQL က open-source relational database management system ဖြစ်ပါတယ်။ Data ကို table၊ row နဲ့ column ပုံစံသိမ်းပြီး table အချင်းချင်းကို keys တွေနဲ့ဆက်စပ်နိုင်ပါတယ်။ MySQL နဲ့ PostgreSQL နှစ်ခုလုံးက SQL relational database systems ဖြစ်ပြီး PostgreSQL က MySQL ရဲ့ နောက်တစ်ဆင့်ဆိုတာမျိုး မဟုတ်ပါဘူး။

**ဆရာမ:** Migration ဆိုတာဘာလဲ?

**အဖွဲ့ဝင်:** Database structure နဲ့ security policies တွေကို version တစ်ခုကနေ နောက် version ကို စနစ်တကျပြောင်းပေးတဲ့ SQL script ဖြစ်ပါတယ်။ ဥပမာ Shops table ထည့်ခြင်း၊ Order ထဲ Shop ID ထည့်ခြင်း၊ status အသစ်ထည့်ခြင်းနဲ့ RLS policies ပြောင်းခြင်းတို့ကို ရှိပြီးသား data မပျောက်အောင် migration နဲ့လုပ်ပါတယ်။

**ဆရာမ:** Testing ကိုဘယ်လိုလုပ်ထားလဲ?

**အဖွဲ့ဝင်:** Customer၊ Owner နဲ့ Admin သီးခြား accounts တွေနဲ့ end-to-end manual testing လုပ်ထားပါတယ်။ Registration၊ OTP၊ password reset၊ order တင်ခြင်း၊ payment screenshot၊ realtime status၊ notification၊ menu availability နဲ့ shop approval workflow တွေကိုစမ်းထားပါတယ်။ Desktop နဲ့ mobile view နှစ်မျိုးလုံး စမ်းထားပေမယ့် automated test နဲ့ formal load testing ကိုတော့ ဆက်လုပ်ဖို့လိုပါတယ်။

**ဆရာမ:** တစ်ပြိုင်တည်း Customer အများကြီးသုံးရင် ခံနိုင်လား?

**အဖွဲ့ဝင်:** PostgreSQL က concurrent requests တွေကိုကိုင်တွယ်နိုင်ပြီး Shop ID၊ status နဲ့ created time လို column တွေမှာ index သုံးထားပါတယ်။ UCSY pilot scale အတွက် ရည်ရွယ်ထားပေမယ့် အတိအကျဘယ်လောက်ခံနိုင်တယ်ဆိုတာပြောဖို့ load testing လိုပါတယ်။ Usage များလာရင် pagination၊ query optimization၊ monitoring နဲ့ paid infrastructure plan တွေလိုလာနိုင်ပါတယ်။

**ဆရာမ:** Internet မရှိရင်သုံးလို့ရလား?

**အဖွဲ့ဝင်:** Cache ရှိလို့ static interface အချို့ပေါ်နိုင်ပေမယ့် order တင်ခြင်း၊ data အသစ်ရယူခြင်း၊ screenshot upload နဲ့ realtime update တွေက server connection လိုတာကြောင့် internet မရှိရင် မလုပ်နိုင်ပါဘူး။ Order data ကို local မှာသိမ်းပြီး နောက်မှ sync လုပ်တဲ့ offline ordering feature ကို လက်ရှိမှာမထည့်ထားပါဘူး။

**ဆရာမ:** AI tools အသုံးပြုခဲ့လား?

**အဖွဲ့ဝင်:** Idea စဉ်းစားခြင်း၊ error နားလည်ခြင်း၊ code structure အကြံပြုချက်၊ documentation နဲ့ testing checklist အတွက် assistant အဖြစ်အသုံးပြုခဲ့ပါတယ်။ AI ထုတ်ပေးတဲ့ code ကိုတိုက်ရိုက်မယုံဘဲ function အလိုက်ဖတ်ပြီး browser၊ network၊ database နဲ့ role အလိုက်ပြန်စမ်းကာ project requirement နဲ့ကိုက်မှသာ အသုံးပြုခဲ့ပါတယ်။

**ဆရာမ:** Project Show ပြီးရင် တကယ်သုံးမှာလား?

**အဖွဲ့ဝင်:** Project Show နဲ့ပဲရပ်ထားမှာမဟုတ်ဘဲ UCSY canteen တစ်ဆိုင်မှာ pilot အဖြစ် စတင်အသုံးပြုဖို့ ရည်ရွယ်ထားပါတယ်။ Menu၊ payment information နဲ့ Owner data အမှန်တွေထည့်ပြီး ကျောင်းသားအနည်းစုနဲ့စမ်းပါမယ်။ Customer နဲ့ Owner feedback အပေါ်မူတည်ပြီး ပြဿနာတွေပြင်ကာ တည်ငြိမ်မှ အသုံးပြုသူပိုများအောင်တိုးပါမယ်။

**ဆရာမ:** နောက်ပိုင်းဘာတွေထပ်ထည့်ချင်လဲ?

**အဖွဲ့ဝင်:** Integrated payment verification၊ Pending cancel request၊ refund workflow၊ estimated delivery time၊ delivery staff role၊ ratings and reviews နဲ့ sales report တွေထည့်ချင်ပါတယ်။ ဆိုင်များလာရင် search၊ category၊ opening hours နဲ့ delivery zones လိုလာနိုင်ပါတယ်။ Pilot feedback အပေါ်မူတည်ပြီး အရေးကြီးတာကိုအရင်ထည့်မှာဖြစ်ပါတယ်။

**ဆရာမ:** Order2Me ရဲ့ innovation ကဘာလဲ?

**အဖွဲ့ဝင်:** Food ordering concept ကိုယ်တိုင်ကအသစ်မဟုတ်ပါဘူး။ Innovation က UCSY hostel-to-canteen workflow ကို လေ့လာပြီး Customer၊ Owner နဲ့ Admin ကို system တစ်ခုတည်းမှာချိတ်ဆက်ထားခြင်းဖြစ်ပါတယ်။ Menu availability၊ payment proof၊ realtime status၊ receipt confirmation နဲ့ shop approval ကို ကျောင်းတွင်းလိုအပ်ချက်နဲ့ကိုက်အောင် ပေါင်းစပ်ထားပါတယ်။

**ဆရာမ:** ရိုးရိုး CRUD Website မဟုတ်ဘူးလို့ ဘယ်လိုပြမလဲ?

**အဖွဲ့ဝင်:** CRUD ပါပေမယ့် Authentication၊ role-based access၊ RLS၊ Realtime၊ Web Push Notification၊ secured Storage၊ controlled status workflow၊ multi-shop separation နဲ့ Admin approval တို့လည်းပါပါတယ်။ Customer တင်တဲ့ order Owner ဆီ realtime ရောက်ပြီး Owner status ပြောင်းတာ Customer ဘက်မှာ ချက်ချင်းပြောင်းတာကို live demo နဲ့သက်သေပြနိုင်ပါတယ်။

**ဆရာမ:** အစကပြန်လုပ်ရမယ်ဆိုရင် ဘာပြောင်းမလဲ?

**အဖွဲ့ဝင်:** Actual canteen Owner နဲ့ကျောင်းသားတွေကို အစောပိုင်းမှာ interview လုပ်ပြီး requirement ကိုအရင်အတည်ပြုပါမယ်။ Database design၊ permissions နဲ့ status flow ကို code မရေးခင်ပိုစနစ်တကျရေးဆွဲပါမယ်။ Automated testing၊ monitoring နဲ့ payment verification ကိုလည်း အစကတည်းကထည့်စဉ်းစားပါမယ်။ Feature များများတစ်ပြိုင်တည်းလုပ်တာထက် core workflow ကိုအရင်တည်ငြိမ်အောင်လုပ်ပါမယ်။

## မှတ်ထားရန်

Actual canteen testing သို့မဟုတ် formal agreement မရှိသေးပါက ရှိသည်ဟုမပြောပါနှင့်။ “Project Show ပြီးနောက် pilot စတင်ရန် ရည်ရွယ်ထားသည်” ဟု အမှန်အတိုင်းပြောပါ။
