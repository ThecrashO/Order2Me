# Order2Me Q&A — Member 2

တာဝန်ယူရန် — Owner dashboard, order processing, payment နှင့် menu management

## လေ့ကျင့်ရန် စကားပြောပုံ

**ဆရာမ:** Customer တင်တဲ့ order က Owner ဘက်ကို ဘယ်လိုရောက်လာသလဲ?

**အဖွဲ့ဝင်:** Customer က order တင်လိုက်တဲ့အခါ Customer ID နဲ့ Shop ID ပါတဲ့ order record ကို Supabase PostgreSQL database ထဲမှာ သိမ်းပါတယ်။ Owner Dashboard က Owner ပိုင်တဲ့ Shop ID နဲ့သက်ဆိုင်တဲ့ order တွေကိုပဲရယူပါတယ်။ Order အသစ်ဝင်လာတာနဲ့ Supabase Realtime က Owner browser ဆီ event ပို့လို့ Pending order အသစ်အဖြစ် ချက်ချင်းပေါ်လာပါတယ်။

**ဆရာမ:** Owner က refresh မလုပ်ဘဲ order အသစ်ရောက်လာတာ ဘယ်လိုသိလဲ?

**အဖွဲ့ဝင်:** Owner Dashboard က သက်ဆိုင်ရာ order changes တွေကို Supabase Realtime နဲ့ subscribe လုပ်ထားပါတယ်။ Database ထဲ order အသစ်ဝင်တာနဲ့ active connection ကတစ်ဆင့် event ရောက်လာပြီး Live Feed ကို update လုပ်ပါတယ်။ Browser notification ဖွင့်ထားရင် app ကို background ထားတဲ့အချိန်မှာလည်း အသိပေးနိုင်ပါတယ်။

**ဆရာမ:** Owner က Customer ပေးချေထားတဲ့ငွေကို ဘယ်လိုစစ်သလဲ?

**အဖွဲ့ဝင်:** Customer တင်ထားတဲ့ KBZPay သို့မဟုတ် WavePay screenshot ကို Order Detail ထဲမှာဖွင့်ပြီး order total၊ ငွေလွှဲချိန်နဲ့ transaction information ကိုစစ်ပါတယ်။ မသေချာရင် Owner ရဲ့ payment account transaction history နဲ့ ထပ်တိုက်စစ်နိုင်ပါတယ်။

**ဆရာမ:** Screenshot အတုဆိုရင် System ကသိလား?

**အဖွဲ့ဝင်:** လက်ရှိ Version 1 မှာ အလိုအလျောက်မသိနိုင်သေးပါဘူး။ Owner က manually စစ်ဆေးရပါတယ်။ မမှန်ကန်ရင် Reject Order ကိုအသုံးပြုပြီး အကြောင်းပြချက်နဲ့ order ကို cancelled အဖြစ်ပြောင်းနိုင်သလို Customer ကိုဖုန်းဆက်ပြီးလည်း အသိပေးနိုင်ပါတယ်။ နောက်ပိုင်းမှာ payment gateway သို့မဟုတ် transaction verification API ထည့်နိုင်ပါတယ်။

**ဆရာမ:** Owner က Customer ကို ဘာကြောင့်ဖုန်းခေါ်ဖို့လိုတာလဲ?

**အဖွဲ့ဝင်:** Delivery location မရှင်းလင်းတာ၊ payment မကိုက်တာ၊ item မရနိုင်တာ၊ cancel ညှိနှိုင်းရတာနဲ့ delivery ရောက်ချိန် Customer ကိုရှာမတွေ့တာမျိုးမှာ တိုက်ရိုက်ဆက်သွယ်ဖို့လိုပါတယ်။ Customer အမည်ကိုနှိပ်ပြီး profile ဖွင့်ကာ Call button နဲ့ အလွယ်တကူခေါ်နိုင်ပါတယ်။

**ဆရာမ:** Menu item ကုန်သွားရင် ဘယ်လိုလုပ်လဲ?

**အဖွဲ့ဝင်:** Item ကိုဖျက်စရာမလိုဘဲ Unavailable အဖြစ်ပြောင်းနိုင်ပါတယ်။ အဲဒီအချိန်မှာ Customer က item ကို order တင်လို့မရတော့ပါဘူး။ ပြန်ရောင်းနိုင်တဲ့အခါ Available အဖြစ်ပြန်ဖွင့်နိုင်ပါတယ်။ Owner Dashboard မှာ Available နဲ့ Unavailable view ကိုခွဲကြည့်နိုင်ပါတယ်။

**ဆရာမ:** Owner က တခြားဆိုင်ရဲ့ order ကိုကြည့်လို့ရလား?

**အဖွဲ့ဝင်:** မရပါဘူး။ Order မှာ Shop ID ပါပြီး Owner ကိုလည်း သူပိုင်တဲ့ဆိုင်နဲ့ချိတ်ထားပါတယ်။ Database Row Level Security က Owner ကို သူ့ဆိုင်ရဲ့ order နဲ့ payment တွေကိုပဲ ဖတ်ပြီး update လုပ်ခွင့်ပေးထားပါတယ်။

**ဆရာမ:** Owner နှစ်ယောက်က order တစ်ခုကိုတစ်ပြိုင်တည်းပြင်ရင် ဘာဖြစ်မလဲ?

**အဖွဲ့ဝင်:** လက်ရှိ design မှာ ဆိုင်တစ်ဆိုင်ကို Owner profile တစ်ခုနဲ့ပဲ ချိတ်ထားပါတယ်။ ဒါပေမယ့် တူညီတဲ့ account ကို device နှစ်ခုကဝင်ရင် update နှစ်ခုဖြစ်နိုင်ပါတယ်။ Database က status ကို သတ်မှတ်ထားတဲ့အစဉ်အတိုင်းပဲပြောင်းခွင့်ပေးလို့ မမှန်တဲ့ transition ကိုတားဆီးပါတယ်။ နောက်ပိုင်းမှာ staff account နဲ့ audit log ထည့်ပြီး ဘယ်သူပြောင်းခဲ့တယ်ဆိုတာ မှတ်တမ်းတင်နိုင်ပါတယ်။

**ဆရာမ:** Status မှားပြီးပြောင်းမိရင် ပြန်ပြောင်းလို့ရလား?

**အဖွဲ့ဝင်:** လက်ရှိ Version 1 မှာ status ကိုနောက်ပြန်လျှော့လို့မရပါဘူး။ Status အစဉ်မမှန်တာကိုကာကွယ်ဖို့ database က Pending ကနေ Preparing၊ Ready၊ Out for Delivery ဆိုတဲ့ flow အတိုင်းပဲ ခွင့်ပြုထားပါတယ်။ မှားပြောင်းမိရင် Customer ကိုဆက်သွယ်ရပြီး နောက် version မှာ reason နဲ့ audit log ပါတဲ့ controlled correction feature ထည့်နိုင်ပါတယ်။

**ဆရာမ:** Owner က shop အသစ်တင်တာနဲ့ Customer ဘက်မှာပေါ်လား?

**အဖွဲ့ဝင်:** မပေါ်သေးပါဘူး။ Shop request က Pending အဖြစ် Admin Dashboard ကိုရောက်ပါတယ်။ Admin ကအချက်အလက်စစ်ပြီး Approve လုပ်မှ Customer ဘက်မှာပေါ်ပြီး Owner က menu တင်ကာ order လက်ခံနိုင်ပါတယ်။

## မှတ်ထားရန်

`Supabase` ကို `SuperPay` ဟုမပြောပါနှင့်။ Screenshot ကို system က အလိုအလျောက်အတည်ပြုသည်ဟုလည်း မပြောပါနှင့်။
