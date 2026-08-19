const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  ImageRun, PageBreak, Header, Footer, PageNumber, TabStopType, TabStopPosition,
  LevelFormat
} = require('docx');

const OUT = path.resolve(__dirname, '../outputs/Order2Me_Project_Show_Document_MM.docx');
const NAVY = '17324D', BLUE = '176B87', TEAL = '36A6A6', PALE = 'EAF6F6', GOLD = 'F0B44D';
const GREY = '52616B', LIGHT = 'F4F7F9', WHITE = 'FFFFFF', RED = 'B94A48', GREEN = '398564';
const font = 'Nirmala UI';

function tr(text, opts={}) { return new TextRun({text, font, size: opts.size || 22, bold: opts.bold, color: opts.color, italics: opts.italics, break: opts.break}); }
function p(text='', opts={}) {
  const children = Array.isArray(text) ? text : [tr(text, opts)];
  return new Paragraph({children, alignment: opts.align, spacing:{after: opts.after ?? 130, line: opts.line || 300}, indent: opts.indent, pageBreakBefore: opts.pageBreakBefore, keepNext: opts.keepNext});
}
function h(text, level=1) { return new Paragraph({text, heading: level===1?HeadingLevel.HEADING_1:level===2?HeadingLevel.HEADING_2:HeadingLevel.HEADING_3, spacing:{before:level===1?300:220,after:140}, keepNext:true}); }
function bullet(text, level=0) { return new Paragraph({children:[tr(text)], numbering:{reference:'bullets',level}, spacing:{after:75,line:285}}); }
function note(text) {
  return new Table({width:{size:100,type:WidthType.PERCENTAGE}, rows:[new TableRow({children:[new TableCell({shading:{fill:'FFF5DA',type:ShadingType.CLEAR}, margins:{top:140,bottom:140,left:180,right:180}, borders:{top:{style:BorderStyle.SINGLE,color:GOLD,size:8},bottom:{style:BorderStyle.SINGLE,color:GOLD,size:8},left:{style:BorderStyle.SINGLE,color:GOLD,size:8},right:{style:BorderStyle.SINGLE,color:GOLD,size:8}}, children:[p([tr('PROJECT SHOW မှာ ရှင်းပြရန်  ',{bold:true,color:'7A5410'}),tr(text,{color:'4C3B16'})],{after:0})]})]})]});
}
function table(headers, rows, widths) {
  const border={style:BorderStyle.SINGLE,color:'CBD5DC',size:5};
  const cell=(text,head=false,i=0)=>new TableCell({width:widths?{size:widths[i],type:WidthType.PERCENTAGE}:undefined, shading:head?{fill:NAVY,type:ShadingType.CLEAR}:undefined, margins:{top:90,bottom:90,left:110,right:110}, borders:{top:border,bottom:border,left:border,right:border}, children:[p([tr(String(text),{bold:head,color:head?WHITE:undefined,size:20})],{after:0,line:260})]});
  return new Table({width:{size:100,type:WidthType.PERCENTAGE}, rows:[new TableRow({tableHeader:true,children:headers.map((x,i)=>cell(x,true,i))}),...rows.map(r=>new TableRow({children:r.map((x,i)=>cell(x,false,i))}))]});
}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function svgDiagram(title, nodes, edges, width=1100, height=540) {
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><marker id="a" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#52616B"/></marker><filter id="sh"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity=".16"/></filter></defs><rect width="100%" height="100%" rx="18" fill="#F8FBFC"/><text x="${width/2}" y="38" text-anchor="middle" font-family="Arial" font-size="24" font-weight="700" fill="#17324D">${esc(title)}</text>`;
  for(const e of edges){const a=nodes[e[0]],b=nodes[e[1]]; s+=`<line x1="${a.x+a.w/2}" y1="${a.y+a.h/2}" x2="${b.x+b.w/2}" y2="${b.y+b.h/2}" stroke="#52616B" stroke-width="3" marker-end="url(#a)"/>`; if(e[2]) s+=`<text x="${(a.x+a.w/2+b.x+b.w/2)/2}" y="${(a.y+a.h/2+b.y+b.h/2)/2-7}" text-anchor="middle" font-family="Arial" font-size="14" fill="#52616B">${esc(e[2])}</text>`;}
  for(const n of nodes){const fill=n.fill||'#EAF6F6'; s+=`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="14" fill="${fill}" stroke="${n.stroke||'#176B87'}" stroke-width="2" filter="url(#sh)"/>`; const lines=n.label.split('\n'); lines.forEach((l,i)=>s+=`<text x="${n.x+n.w/2}" y="${n.y+n.h/2+(i-(lines.length-1)/2)*20+6}" text-anchor="middle" font-family="Arial" font-size="${n.fs||16}" font-weight="${i===0?'700':'400'}" fill="#17324D">${esc(l)}</text>`);}
  return Buffer.from(s+'</svg>');
}
let diagramCounter = 0;
function renderPng(svg) {
  const id = String(++diagramCounter).padStart(2, '0');
  const svgPath = path.resolve(__dirname, `diagram-${id}.svg`);
  const pngPath = path.resolve(__dirname, `diagram-${id}.png`);
  fs.writeFileSync(svgPath, svg);
  execFileSync(process.execPath, [path.resolve(__dirname, 'render_svg_png.js'), svgPath, pngPath]);
  return fs.readFileSync(pngPath);
}
function diagram(title,nodes,edges,w=1100,h=540,displayW=650,displayH=319){const png=renderPng(svgDiagram(title,nodes,edges,w,h));return new Paragraph({alignment:AlignmentType.CENTER,spacing:{before:100,after:160},children:[new ImageRun({data:png,transformation:{width:displayW,height:displayH},type:'png'})]});}
function flow(title, labels, colors=[]) {
  const n=labels.length, W=1100,H=260, gap=20, box=Math.floor((W-80-gap*(n-1))/n);
  const nodes=labels.map((label,i)=>({x:40+i*(box+gap),y:95,w:box,h:90,label,fill:colors[i]||'#EAF6F6',fs:n>5?13:15}));
  return diagram(title,nodes,labels.slice(1).map((_,i)=>[i,i+1]),W,H,650,154);
}
function page(){return new Paragraph({children:[new PageBreak()]});}

const children=[];
// Cover
children.push(p('ORDER2ME',{align:AlignmentType.CENTER,after:40,size:54,bold:true,color:NAVY}),p('University Canteen Multi‑Shop Ordering System',{align:AlignmentType.CENTER,after:280,size:27,bold:true,color:BLUE}),p('PROJECT SHOW DOCUMENT',{align:AlignmentType.CENTER,after:110,size:30,bold:true,color:WHITE}),p('နည်းပညာနားလည်သူနှင့် မနားလည်သူ နှစ်မျိုးစလုံးအတွက်\nSystem Overview • Architecture • Data Flow • Security • Operations',{align:AlignmentType.CENTER,after:360,size:24,color:WHITE}),diagram('Order2Me at a Glance',[
  {x:80,y:130,w:220,h:110,label:'CUSTOMER\nBrowse • Order • Track',fill:'#D9F2EF'},
  {x:440,y:105,w:220,h:160,label:'ORDER2ME\nMulti‑Shop Platform',fill:'#FFF0CF',stroke:'#F0B44D'},
  {x:800,y:130,w:220,h:110,label:'OWNER\nMenu • Orders • Shop',fill:'#DDECF8'},
  {x:440,y:350,w:220,h:95,label:'ADMIN\nApprove • Control',fill:'#F6DFE1',stroke:'#B94A48'}
],[[0,1],[1,2],[3,1]],1100,500,650,295),p('Prepared from PROJECT_DOCUMENTATION_MM.md  |  Production: https://order2me.vercel.app/',{align:AlignmentType.CENTER,size:18,color:'DDE7ED'}),page());

children.push(h('Document Guide',1),p('ဤစာတမ်းသည် presentation slide deck မဟုတ်ဘဲ project show တွင် system တစ်ခုလုံးကို အဆင့်လိုက်ရှင်းပြနိုင်ရန် စုစည်းထားသော reference document ဖြစ်သည်။ Diagram တိုင်းအောက်ရှိ callout ကို ပြောဆိုရန်မှတ်စုအဖြစ်သုံးနိုင်သည်။'),table(['အပိုင်း','ရည်ရွယ်ချက်'],[
  ['Project Overview & Roles','ဘာပြဿနာကို ဘယ်သူများအတွက် ဖြေရှင်းသလဲ'],['Flows & Lifecycles','Account၊ order နှင့် payment evidence စီးဆင်းပုံ'],['Architecture & DFDs','Browser မှ Supabase အထိ system/data flow'],['Database & Security','Documented tables၊ relationships၊ RLS နှင့် triggers'],['Operations','Vercel၊ local run၊ PWA၊ migrations၊ troubleshooting']
],[35,65]),h('Scope & Source Discipline',2),p('ဤစာတမ်းရှိ feature၊ status၊ table နှင့် technical behavior များကို ပေးထားသော PROJECT_DOCUMENTATION_MM.md မှသာ ယူထားသည်။ Source တွင်မဖော်ပြထားသော online payment gateway၊ delivery rider role၊ background web push၊ offline database access စသည့် feature များကို မထည့်သွင်းထားပါ။'),page());

children.push(h('1. Executive / Project Overview',1),p('Order2Me သည် university canteen အတွက် multi‑shop ordering web application ဖြစ်သည်။ ဆိုင်တစ်ဆိုင်ချင်းစီ၏ menu၊ orders၊ customers နှင့် payments ကို အခြားဆိုင်များနှင့် ခွဲထားပြီး Customer၊ Owner၊ Admin role သုံးမျိုးဖြင့် လည်ပတ်သည်။'),table(['မေးခွန်း','အဖြေ'],[
  ['ဘာအတွက်လဲ?','Canteen ဆိုင်များကိုတစ်နေရာတည်းမှရွေး၊ menu ကြည့်၊ order တင်၊ status စောင့်ကြည့်နိုင်ရန်။'],['ဘယ်သူတွေသုံးလဲ?','Customer၊ Owner၊ Admin။'],['Backend ဘာသုံးလဲ?','Supabase Auth + PostgreSQL + Storage + Realtime။'],['ဘယ်မှာ host လုပ်လဲ?','Static frontend၊ runtime config နှင့် proxy ကို Vercel တွင် host လုပ်သည်။'],['Framework?','HTML/CSS/JavaScript တိုက်ရိုက်သုံးပြီး React/Vue/Express မသုံးထားပါ။']
],[28,72]),note('“Order2Me ကို canteen marketplace တစ်ခုလို စဉ်းစားနိုင်ပါတယ်။ Customer က ဆိုင်ရွေးပြီး order တင်တယ်၊ Owner က ကိုယ့်ဆိုင်ကိုသာစီမံတယ်၊ Admin က owner access ကိုအတည်ပြုတယ်” ဟု စတင်ရှင်းပြပါ။'),h('Problem → Solution',2),table(['တွေ့နိုင်သည့်ပြဿနာ','Order2Me ၏ဖြေရှင်းပုံ'],[
  ['ဆိုင်များနှင့် menu များကို လွယ်ကူစွာမကြည့်နိုင်ခြင်း','Approved shops နှင့် menu search/category filtering'],['Order တိုးတက်မှု မသိရခြင်း','Today’s orders၊ progress tracker၊ Realtime/polling updates'],['ဆိုင်တစ်ဆိုင်၏ data ကို အခြားဆိုင်နှင့်မရောစေလိုခြင်း','shop_id/owner relationship နှင့် RLS အခြေပြု ခွဲခြားမှု'],['Owner အသစ်တိုင်း ချက်ချင်းအသုံးမပြုစေလိုခြင်း','Admin approval lifecycle နှင့် pending page'],['Payment proof ကို လုံခြုံစွာကြည့်လိုခြင်း','Private storage path + limited-time signed URL']
],[42,58]),page());

children.push(h('2. User Roles & Responsibilities',1),table(['Role','လုပ်ဆောင်နိုင်သည့်အရာ','အဓိကကန့်သတ်ချက်'],[
  ['Customer','Approved shop ရွေး၊ menu ကြည့်၊ cart/checkout၊ payment screenshot upload၊ order status ကြည့်၊ sent နောက် received confirm','ကိုယ့် orders/payments ကိုသာ; approved & accepting shop တွင်သာ order တင်'],
  ['Owner','ကိုယ့်ဆိုင် menu CRUD/availability၊ order accept/reject/ready/sent၊ customers/history၊ shop open/closed နှင့် settings','Approved ဖြစ်ရမည်; ကိုယ့် approved shop ကိုသာ'],
  ['Admin','Shop approve/reject/suspend/restore; profiles/shops စီမံ','Administrative control role']
],[16,50,34]),flow('Role Interaction', ['Customer\nplaces order','Order2Me\nvalidates & stores','Owner\nfulfills order','Customer\nconfirms received'],['#D9F2EF','#FFF0CF','#DDECF8','#D9F2EF']),h('Role-based Redirect',2),table(['State','Destination'],[['Customer','customer.html'],['Approved Owner','owner.html'],['Pending / Rejected / Suspended Owner','pending.html'],['Admin','admin.html']],[50,50]),note('Role သည် UI အပြင် data access ကိုပါသက်ရောက်သည်။ Button ဖျောက်ထားခြင်းကို security ဟုမဆိုနိုင်ဘဲ RLS နှင့် trigger က server-side စစ်ပေးသည်ဟု အလေးပေးပါ။'),page());

children.push(h('3. Technology Stack',1),table(['Layer','Technology','Responsibility'],[
  ['Frontend','HTML, CSS, JavaScript','Page structure၊ UI၊ browser-side logic'],['UI','Bootstrap 5','Grid၊ modal၊ responsive layout'],['Backend platform','Supabase','Auth၊ PostgreSQL၊ Storage၊ Realtime'],['Hosting / edge','Vercel','Static pages၊ runtime config၊ REST/Auth/Storage proxy'],['PWA','Manifest + Service Worker','Installable app၊ app-shell caching'],['Alerts','Browser Notification API','Permission ရချိန် local alerts']
],[22,28,50]),h('High-Level End-to-End Flow',2),flow('From Sign-in to Completed Order',['Sign up / Login','Choose approved shop','Browse & add cart','Checkout + proof','Owner processes','Customer confirms'],['#DDECF8','#EAF6F6','#EAF6F6','#FFF0CF','#DDECF8','#D9F2EF']),bullet('Browser က Supabase JavaScript SDK ကိုသုံးသည်။'),bullet('REST/Auth/Storage request များသည် Vercel proxy path ကိုသုံးပြီး Realtime သည် Supabase သို့တိုက်ရိုက်ဆက်သွယ်သည်။'),bullet('Data authorization ကို RLS နှင့် database triggers က ဆုံးဖြတ်သည်။'),page());

children.push(h('4. System Architecture',1),diagram('System Architecture',[
  {x:40,y:190,w:190,h:110,label:'USER BROWSER\nHTML • CSS • JS',fill:'#D9F2EF'},
  {x:320,y:70,w:220,h:90,label:'VERCEL\nStatic pages',fill:'#DDECF8'},
  {x:320,y:205,w:220,h:90,label:'/api/config\nRuntime URL + key',fill:'#DDECF8'},
  {x:320,y:340,w:220,h:90,label:'/supabase/*\nExternal rewrite',fill:'#DDECF8'},
  {x:670,y:55,w:220,h:80,label:'SUPABASE AUTH',fill:'#FFF0CF'},
  {x:670,y:160,w:220,h:80,label:'POSTGRES + RLS',fill:'#FFF0CF'},
  {x:670,y:265,w:220,h:80,label:'STORAGE',fill:'#FFF0CF'},
  {x:670,y:370,w:220,h:80,label:'REALTIME\nDirect WebSocket',fill:'#F6DFE1',stroke:'#B94A48'}
],[[0,1,'pages/assets'],[0,2,'config'],[0,3,'REST/Auth/Storage'],[3,4],[3,5],[3,6],[0,7,'direct']],1100,510,650,301),p('Request path ကိုနှစ်မျိုးခွဲထားသည်။ Normal API traffic သည် Vercel rewrite မှတစ်ဆင့်သွားပြီး Realtime WebSocket သည် Supabase ကိုတိုက်ရိုက်ချိတ်သည်။ Vercel external rewrite ကို WebSocket proxy အဖြစ် မယုံကြည်ထားသဖြင့် polling fallback ပါရှိသည်။'),note('Diagram ၏အဓိက message သည် “Vercel က website နှင့် proxy ကိုပေးတယ်; Supabase က identity, data, files, live events ကိုပေးတယ်” ဖြစ်သည်။ Publishable key သည် frontend တွင်ရှိနိုင်သော်လည်း RLS မဖြုတ်ရပါ။'),h('Vercel / Supabase Request Path',2),flow('Request Routing',['Browser','Vercel page','/api/config','/supabase/* rewrite','Supabase service'],['#D9F2EF','#DDECF8','#DDECF8','#DDECF8','#FFF0CF']),page());

children.push(h('5. Context Diagram',1),diagram('Context Diagram — Order2Me as One System',[
  {x:40,y:90,w:210,h:100,label:'CUSTOMER\norders • payments',fill:'#D9F2EF'},
  {x:40,y:350,w:210,h:100,label:'OWNER\nmenu • fulfillment',fill:'#DDECF8'},
  {x:850,y:90,w:210,h:100,label:'ADMIN\napproval decisions',fill:'#F6DFE1',stroke:'#B94A48'},
  {x:850,y:350,w:210,h:100,label:'EMAIL SERVICE\nverify • reset links',fill:'#F2E9FA',stroke:'#75518A'},
  {x:390,y:190,w:320,h:170,label:'ORDER2ME SYSTEM\nMulti‑shop ordering platform',fill:'#FFF0CF',stroke:'#F0B44D'}
],[[0,4,'browse/order/status'],[4,0,'menu/progress'],[1,4,'menu/status/settings'],[4,1,'orders/customers'],[2,4,'approve/control'],[4,2,'shops/profiles'],[4,3,'verification/reset'],[3,4,'link result']],1100,520,650,307),p('Context diagram က internal details ကိုဖျောက်ပြီး system နယ်နိမိတ်နှင့် external actors ကိုသာပြသည်။ Email verification/reset က code flow ရှိသော်လည်း actual delivery သည် Supabase email configuration/service limitation များပေါ်မူတည်သည်။'),note('Technical မဟုတ်သူအတွက် “ဘယ်သူက system ထဲကို ဘာပေးပြီး ဘာပြန်ရသလဲ” ဟုရှင်းပြပါ။ Delivery rider သို့မဟုတ် external payment gateway ကို source မဖော်ပြထားသောကြောင့် diagram တွင်မပါပါ။'),page());

children.push(h('6. DFD Level 0',1),diagram('DFD Level 0 — Major Processes & Data Stores',[
  {x:20,y:80,w:160,h:80,label:'CUSTOMER',fill:'#D9F2EF'}, {x:20,y:380,w:160,h:80,label:'OWNER',fill:'#DDECF8'}, {x:920,y:80,w:160,h:80,label:'ADMIN',fill:'#F6DFE1'},
  {x:260,y:60,w:220,h:95,label:'1.0 ACCOUNT\n& ACCESS',fill:'#EAF6F6'}, {x:260,y:220,w:220,h:95,label:'2.0 SHOP &\nMENU',fill:'#EAF6F6'}, {x:260,y:380,w:220,h:95,label:'3.0 ORDER\nPROCESSING',fill:'#EAF6F6'},
  {x:610,y:60,w:220,h:95,label:'4.0 ADMIN\nAPPROVAL',fill:'#EAF6F6'}, {x:610,y:220,w:220,h:95,label:'5.0 PAYMENT\nPROOF',fill:'#EAF6F6'}, {x:610,y:380,w:220,h:95,label:'6.0 UPDATES &\nNOTIFICATIONS',fill:'#EAF6F6'},
  {x:410,y:505,w:280,h:65,label:'DATA STORES\nDB • Storage • Auth',fill:'#FFF0CF'}
],[[0,3],[0,4],[0,5],[1,4],[1,5],[2,6],[3,9],[4,9],[5,9],[6,9],[7,9],[8,9],[5,8],[8,0],[8,1]],1100,590,650,349),p('Level 0 သည် account/access၊ shop/menu၊ ordering၊ admin approval၊ payment proof နှင့် live updates ကို major process ခြောက်ခုအဖြစ် ခွဲပြသည်။ Data stores အဖြစ် Supabase Auth၊ PostgreSQL tables နှင့် Storage ကိုစုစည်းပြထားသည်။'),page());

children.push(h('7. DFD Level 1 — Customer Ordering',1),diagram('Customer Ordering Flow',[
  {x:20,y:205,w:150,h:90,label:'CUSTOMER',fill:'#D9F2EF'},
  {x:220,y:60,w:180,h:85,label:'2.1 Browse\napproved shops'}, {x:220,y:185,w:180,h:85,label:'2.2 Search/filter\nmenu'}, {x:220,y:310,w:180,h:85,label:'2.3 Cart &\ncheckout'},
  {x:470,y:60,w:180,h:85,label:'DB\nshops/menu',fill:'#FFF0CF'}, {x:470,y:310,w:180,h:85,label:'3.1 Create order\n+ items'},
  {x:720,y:310,w:180,h:85,label:'5.1 Upload\npayment proof'}, {x:720,y:60,w:180,h:85,label:'DB\norders/items',fill:'#FFF0CF'},
  {x:930,y:185,w:150,h:90,label:'STORAGE\nprivate path',fill:'#FFF0CF'}, {x:720,y:440,w:180,h:75,label:'6.1 Track /\nconfirm received'}
],[[0,1],[1,4],[4,2],[2,3],[3,5],[5,7],[5,6],[6,8],[7,9],[9,0]],1100,550,650,325),bullet('Customer သည် approved နှင့် accepting-orders shop တွင်သာ order တင်နိုင်သည်။'),bullet('Checkout တွင် payment method နှင့် screenshot upload ပါနိုင်ပြီး database တွင် storage path သိမ်းသည်။'),bullet('Owner sent/out_for_delivery ဖြစ်ပြီးမှ customer က received/delivered confirm လုပ်သည်။'),note('Cart သည် order မဖြစ်သေးပါ။ Checkout အပြီးမှ order header + item snapshots + payment record/proof path ကို ဆိုင်နှင့် customer ခွဲခြားထားသော data အဖြစ် သိမ်းသည်ဟုရှင်းပြပါ။'),page());

children.push(h('8. DFD Level 1 — Owner Order & Menu Management',1),diagram('Owner Management Flow',[
  {x:25,y:215,w:160,h:90,label:'OWNER',fill:'#DDECF8'},
  {x:240,y:55,w:200,h:85,label:'3.2 View/filter\nshop orders'}, {x:240,y:180,w:200,h:85,label:'3.3 Accept / reject\nready / sent'}, {x:240,y:305,w:200,h:85,label:'2.4 Menu\nadd/edit/delete'}, {x:240,y:430,w:200,h:70,label:'2.5 Shop\navailability'},
  {x:560,y:55,w:210,h:85,label:'ORDERS\nshop-scoped',fill:'#FFF0CF'}, {x:560,y:180,w:210,h:85,label:'STATUS TRIGGER\nrole + transition',fill:'#F6DFE1'}, {x:560,y:305,w:210,h:85,label:'MENU_ITEMS\nshop-scoped',fill:'#FFF0CF'}, {x:560,y:430,w:210,h:70,label:'SHOPS\nsettings',fill:'#FFF0CF'},
  {x:870,y:180,w:190,h:85,label:'CUSTOMER\nprogress update',fill:'#D9F2EF'}, {x:870,y:305,w:190,h:85,label:'CUSTOMER VIEW\nmenu/image preview',fill:'#D9F2EF'}
],[[0,1],[5,1],[0,2],[2,6],[6,5],[5,9],[0,3],[3,7],[7,10],[0,4],[4,8]],1100,540,650,319),p('Owner dashboard သည် order search/status filters၊ customer profile/phone၊ menu CRUD/availability၊ customer-view image preview၊ customers/history နှင့် shop operation settings ကို စီမံသည်။ Owner access သည် approved shop နှင့်သက်ဆိုင်သော data ကိုသာရရှိစေသည်။'),page());

children.push(h('9. DFD Level 1 — Admin Approval',1),diagram('Admin Approval Lifecycle',[
  {x:30,y:185,w:175,h:95,label:'OWNER\nsignup request',fill:'#DDECF8'},
  {x:270,y:70,w:210,h:90,label:'4.1 Review\nowner/shop'}, {x:270,y:300,w:210,h:90,label:'PENDING PAGE\nrestricted access',fill:'#FFF0CF'},
  {x:555,y:70,w:210,h:90,label:'4.2 Decision\napprove/reject'}, {x:555,y:300,w:210,h:90,label:'4.3 Later control\nsuspend/restore'},
  {x:850,y:70,w:210,h:90,label:'ADMIN',fill:'#F6DFE1',stroke:'#B94A48'}, {x:850,y:300,w:210,h:90,label:'OWNER DASHBOARD\napproved only',fill:'#D9F2EF'}
],[[0,1],[1,5],[5,3],[3,2,'reject/pending'],[3,6,'approve'],[5,4],[4,2,'suspend'],[4,6,'restore']],1100,470,650,278),p('Owner signup အပြီး pending shop ဖန်တီးပြီး admin decision မရမချင်း pending.html သို့ပို့သည်။ Approved Owner သာ owner.html ကိုရောက်ပြီး rejected/suspended state များသည် pending page တွင်သာရှိသည်။'),note('Admin သည် orders ကို fulfill လုပ်သူမဟုတ်ပါ။ Admin ၏အဓိကတာဝန်မှာ Owner/shop access lifecycle ကိုအတည်ပြုနှင့်ထိန်းချုပ်ခြင်းဖြစ်သည်။'),page());

children.push(h('10. Account Lifecycle',1),flow('Account Creation & First Login',['Signup form','Validate contact','Auth signUp','Email verify','First login','Create profile / shop'],['#DDECF8','#EAF6F6','#FFF0CF','#F2E9FA','#EAF6F6','#D9F2EF']),p('signUpAccount() သည် name၊ phone၊ role နှင့် owner ဖြစ်ပါက shop fields ကို Auth metadata ထဲထည့်သည်။ Email confirmation အပြီး ပထမဆုံး login တွင် getCurrentProfile() က public.users profile မရှိသေးလျှင် metadata မှ profile ကိုဖန်တီးပြီး Owner အတွက် pending shop ကိုလည်းဖန်တီးသည်။'),h('Password Reset',2),flow('Password Recovery',['Login','Forgot password','Enter email','Reset link','New password','Login again'],['#DDECF8','#EAF6F6','#EAF6F6','#F2E9FA','#FFF0CF','#D9F2EF']),bullet('Email ownership verification အတွက် Supabase Dashboard တွင် Confirm email = ON ဖြစ်ရမည်။'),bullet('Code flow ရှိခြင်းသည် email တကယ်ရောက်မည်ဟု အာမမခံပါ; default email service တွင် delivery/rate limits ရှိနိုင်သည်။'),page());

children.push(h('11. Order Status Lifecycle',1),flow('Order State Machine',['pending','preparing','ready','out_for_delivery','delivered'],['#FFF0CF','#DDECF8','#DDECF8','#F2E9FA','#D9F2EF']),p([tr('Cancellation path: ',{bold:true}),tr('pending မှစ၍ documented lifecycle အတွင်း cancelled သို့ရောက်နိုင်သည်။ Database trigger က role နှင့် transition မှန်ကန်မှုကို server-side စစ်သည်။')]),table(['Status','အဓိပ္ပာယ် / Actor'],[
  ['pending','Order အသစ်; Owner action စောင့်'],['preparing','Owner က accept လုပ်ပြီး ပြင်ဆင်နေ'],['ready','ပစ္စည်းအသင့်ဖြစ်'],['out_for_delivery','Owner “sent” action နောက် ပို့ဆောင်နေ/ပေးပို့ပြီး'],['delivered','Customer က ပစ္စည်းရရှိကြောင်း confirm'],['cancelled','Order ကိုပယ်ဖျက်ထား']
],[28,72]),note('Source UI တွင် Owner action ကို “sent” ဟုခေါ်သော်လည်း database status ကို out_for_delivery ဟုဖော်ပြထားသည်။ Delivered ကို Customer က received confirm လုပ်ပြီးမှရောက်သည်။'),page());

children.push(h('12. Database / ER-style Relationship',1),diagram('Documented Core Tables & Relationships',[
  {x:30,y:60,w:230,h:130,label:'USERS\nid (PK)\nauth_user_id → auth.users\nrole • contact • avatar'},
  {x:315,y:60,w:230,h:120,label:'SHOPS\nowner_id → users.id\nstatus • availability'},
  {x:600,y:60,w:230,h:120,label:'MENU_ITEMS\nshop_id → shops\nprice • category'},
  {x:315,y:300,w:230,h:125,label:'ORDERS\ncustomer → users\nshop → shops\nstatus • total'},
  {x:600,y:300,w:230,h:120,label:'ORDER_ITEMS\norder → orders\nitem • qty • price'},
  {x:870,y:300,w:200,h:120,label:'PAYMENTS\norder-related\nmethod • proof path'}
],[[0,1,'1 owner : shops'],[1,2,'1 : many'],[0,3,'customer'],[1,3,'1 : many'],[3,4,'1 : many'],[3,5,'payment record']],1100,500,650,295),p('Relationship label များသည် source documentation တွင်ဖော်ပြထားသော table purpose နှင့် keys ကိုအခြေခံထားသည်။ Source က `order_items`/`payments` ၏ column-level foreign key အမည်အားလုံးကိုမပေးထားသောကြောင့် semantic “order-related” relationship အဖြစ်သာပြထားသည်။'),table(['Table','Documented core content'],[
  ['users','id, auth_user_id, name, email, phone_number, role, avatar_path'],['shops','owner_id, status, opening hours, accepting-orders, contact, address'],['menu_items','shop_id, name, description, price, category, image, availability'],['orders','customer/shop, status, total, delivery note, created time'],['order_items','item, quantity, order-time price snapshot'],['payments','payment method, screenshot storage path']
],[25,75]),note('ER diagram ကို “Auth account ကို users profile ကချိတ်၊ Owner profile မှ shop ထွက်၊ shop မှ menu/orders ထွက်၊ order အောက်တွင် items/payment evidence ရှိ” ဟု ဘယ်မှညာ၊ အပေါ်မှအောက် လိုက်ရှင်းပါ။'),page());

children.push(h('13. Authentication, Authorization & RLS Security',1),table(['Security layer','What it does'],[
  ['Supabase Auth','Signup၊ login၊ verification link၊ password recovery နှင့် session identity'],['public.users profile','Application role/contact/profile data; auth_user_id ဖြင့် Auth identity ကိုချိတ်'],['Row Level Security','Current user/role/shop အလိုက် row ဖတ်/ပြင်/ထည့်ခွင့်ကို database တွင်စစ်'],['Database trigger','Order status transition နှင့် actor role မှန်ကန်မှုကို server-side စစ်'],['Storage policies','Payment/profile images ဖတ်ခွင့်နှင့် path access စစ်'],['Signed URL','Private image ကို အချိန်ကန့်သတ်ဖြင့်ကြည့်စေ']
],[30,70]),h('Documented Access Rules',2),bullet('User သည် ကိုယ့် profile ကိုဖတ်/ပြင်နိုင်သည်။'),bullet('Admin သည် profiles/shops အားလုံးကို စီမံနိုင်သည်။'),bullet('Owner သည် ကိုယ့် approved shop ၏ menu/orders/customers ကိုသာကြည့်နိုင်သည်။'),bullet('Customer သည် ကိုယ့် orders/payments ကိုသာဖတ်နိုင်သည်။'),bullet('Customer သည် approved နှင့် order လက်ခံနေသော shop တွင်သာ order တင်နိုင်သည်။'),p([tr('အရေးကြီးသော principle — ',{bold:true,color:RED}),tr('Frontend button ဖျောက်ခြင်းသည် security မဟုတ်ပါ။ Publishable/anon key ကို frontend တွင်သုံးနိုင်သော်လည်း RLS ကိုပိတ်မထားရ၊ service_role/secret key ကို frontend သို့မဟုတ် Git ထဲ လုံးဝမထည့်ရပါ။')]),page());

children.push(h('14. Storage & Payment Screenshot Flow',1),flow('Payment Proof Storage',['Customer checkout','Select method','Upload screenshot','Store private path','Create signed URL','Authorized viewer'],['#D9F2EF','#EAF6F6','#DDECF8','#FFF0CF','#F2E9FA','#D9F2EF']),p('Menu images၊ payment screenshots နှင့် profile images ကို Supabase Storage တွင်သိမ်းသည်။ Private image အတွက် database ထဲ signed URL အမြဲမသိမ်းဘဲ storage path ကိုသိမ်းပြီး လိုအပ်ချိန်တွင် limited-time signed URL အသစ်ထုတ်သည်။'),table(['မှန်ကန်သည့်ပုံစံ','ရှောင်ရန်'],[['Database တွင် stable storage path သိမ်း','Expire ဖြစ်နိုင်သည့် signed URL ကို permanent value အဖြစ်သိမ်း'],['Storage policy ဖြင့် authorized access စစ်','Public URL နှင့် private path ရောသုံး'],['လိုအပ်ချိန် signed URL ထုတ်','service_role key ကို browser တွင်သုံး']],[50,50]),note('Payment gateway transaction မဟုတ်ဘဲ “payment method + screenshot proof” flow ဖြစ်ကြောင်း ခွဲပြောပါ။ Source က automatic payment verification သို့မဟုတ် refund feature မဖော်ပြထားပါ။'),page());

children.push(h('15. Realtime, Polling & Notifications',1),diagram('Live Update Strategy',[
  {x:35,y:200,w:180,h:90,label:'ORDER CHANGE\nPostgres',fill:'#FFF0CF'},
  {x:290,y:70,w:230,h:95,label:'REALTIME\nDirect WebSocket',fill:'#D9F2EF'},
  {x:290,y:335,w:230,h:95,label:'FALLBACK\nPoll every 8 seconds',fill:'#F6DFE1'},
  {x:610,y:200,w:210,h:90,label:'CUSTOMER / OWNER\nrefresh UI',fill:'#DDECF8'},
  {x:890,y:200,w:180,h:90,label:'TOAST • SOUND\nBrowser notification',fill:'#F2E9FA'}
],[[0,1,'connected'],[0,2,'error/blocked'],[1,3,'instant event'],[2,3,'periodic fetch'],[3,4,'detected change']],1100,500,650,295),p('Owner/Customer pages သည် orders Realtime updates ကိုနားထောင်သည်။ ISP တချို့တွင် Supabase WebSocket မရနိုင်သဖြင့် Realtime error/blocked ဖြစ်လျှင် 8-second polling fallback သုံးသည်။'),h('Notification Behavior & Limitation',2),bullet('Browser Notification API၊ sound၊ toast နှင့် event detection ကိုသုံးသည်။'),bullet('Notification permission ရရှိမှ browser notification ပြနိုင်သည်။'),bullet('Web Push backend အပြည့်မရှိသဖြင့် app/browser လုံးဝပိတ်ထားချိန် delivery ကိုအာမခံမရပါ။'),bullet('Full background push အတွက် push subscriptions database + server/Edge Function လိုအပ်မည်—လက်ရှိ feature မဟုတ်ပါ။'),page());

children.push(h('16. PWA & Service Worker',1),p('manifest.json က installable app metadata ပေးပြီး sw.js က app shell ကို cache လုပ်သည်။ ထို့ကြောင့် core pages/assets ကို browser cache မှပြနိုင်သော်လည်း Supabase database query များအတွက် network လိုသည်—offline database mode ဟုမယူဆရပါ။'),flow('PWA Loading',['Browser / installed app','Service Worker','App-shell cache','Static UI loads','Network → Supabase'],['#D9F2EF','#DDECF8','#FFF0CF','#EAF6F6','#F2E9FA']),h('Stale Cache Fix',2),table(['အဆင့်','လုပ်ဆောင်ချက်'],[['1','sw.js ရှိ CACHE_NAME version တိုးထားကြောင်းစစ်'],['2','Ctrl + Shift + R hard refresh'],['3','DevTools → Application → Service Workers တွင် update/unregister'],['4','Mobile browser site data/cache ရှင်း']],[12,88]),note('“PWA cache က application shell ကိုမြန်စေတယ်၊ ဒါပေမယ့် live orders/menu data ကို offline မပေးဘူး” ဟု ကန့်သတ်ချက်နှင့်အတူရှင်းပြပါ။'),page());

children.push(h('17. Project Folder / Module Map',1),table(['Area','Key files','Responsibility'],[
  ['Entry/auth pages','index.html, login.html, signup.html, forgot-password.html, reset-password.html','Landing၊ authentication နှင့် recovery UI'],['Role pages','customer.html, owner.html, admin.html, pending.html, history.html','Role dashboards၊ approval state၊ reports/history'],['Shared backend client','js/supabase.js, js/auth.js','Supabase clients၊ role/profile/shop creation'],['Role logic','js/customer.js, js/owner.js, js/admin.js, js/pending.js','Ordering၊ fulfillment/menu၊ approval၊ status waiting'],['Supporting JS','history.js, profile.js, notification-permissions.js','CSV/history၊ profile images၊ notification permission'],['Vercel','api/config.js, vercel.json','Runtime config နှင့် Supabase proxy rewrite'],['PWA','sw.js, manifest.json','Caching နှင့် install metadata'],['Database','database.sql, supabase/*','Base schema အဟောင်းနှင့် current migrations/patches']
],[18,39,43]),h('Recommended Code Reading Order',2),p('1) login.html → js/login.js → js/auth.js\n2) js/supabase.js → api/config.js → vercel.json\n3) customer.html → js/customer.js (menu → cart → checkout → order)\n4) owner.html → js/owner.js (lifecycle + menu CRUD)\n5) supabase/multi_shop_migration.sql (RLS + triggers)\n6) admin.html → js/admin.js (approval lifecycle)'),page());

children.push(h('18. Deployment & Local Run Overview',1),diagram('Development to Production',[
  {x:30,y:170,w:190,h:100,label:'LOCAL CODE\nHTML/CSS/JS + SQL',fill:'#D9F2EF'},
  {x:290,y:70,w:210,h:100,label:'VERCEL DEV\n/api + rewrites',fill:'#DDECF8'},
  {x:290,y:300,w:210,h:100,label:'SUPABASE\nMigrations + policies',fill:'#FFF0CF'},
  {x:600,y:70,w:210,h:100,label:'VERCEL PROD\nstatic + config + proxy',fill:'#DDECF8'},
  {x:600,y:300,w:210,h:100,label:'SUPABASE PROD\nAuth/DB/Storage/RT',fill:'#FFF0CF'},
  {x:890,y:170,w:180,h:100,label:'USERS\norder2me.vercel.app',fill:'#F2E9FA'}
],[[0,1],[0,2],[1,3,'deploy'],[2,4,'migrate safely'],[3,5],[4,5]],1100,480,650,284),h('Local Run',2),p('1. npm install\n2. npx vercel dev\n3. Terminal ပြသည့် URL (ပုံမှန် http://localhost:3000) ကိုဖွင့်ပါ။'),p('`.env.local` တွင် SUPABASE_URL နှင့် SUPABASE_PUBLISHABLE_KEY ထည့်ရသည်။ VS Code Live Server သည် .env.local၊ /api/config နှင့် Vercel rewrite ကို run မပေးသဖြင့် သင့်တော်သော local runner မဟုတ်ပါ။'),h('Production Configuration',2),bullet('Vercel Environment Variables: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY'),bullet('Supabase Email: Confirm email = ON; production/local redirect URLs allow-list'),bullet('Production migration မတိုင်မီ backup ယူပြီး run ပြီးသား file ကို မသေချာဘဲ ပြန်မ run ပါနှင့်။'),page());

children.push(h('19. Migration Sequence (Documented)',1),table(['#','Migration / condition'],[
  ['1','database.sql — base schema မရှိသေးမှသာ'],['2','supabase/multi_shop_migration.sql'],['3','supabase/shop_availability.sql'],['4','supabase/profile_images.sql'],['5','supabase/customer_read_owner_profile_images.sql'],['6','supabase/customer_received_confirmation.sql'],['7','supabase/admin_users_notifications_screenshot_patch.sql'],['8','supabase/allow_duplicate_profile_names.sql — old unique-name constraint ရှိမှသာ'],['9','supabase/required_account_contact.sql — new profile phone required'],['10','supabase/create_admin.sql — Admin Auth user ပြီး email ပြင်ကာ run']
],[10,90]),p([tr('Risk control: ',{bold:true,color:RED}),tr('Fresh/old database အခြေအနေကွာနိုင်သည်။ Backup ယူခြင်း၊ applied migrations စစ်ခြင်းနှင့် environment မှန်ကန်ကြောင်းအတည်ပြုခြင်းသည် production data ကိုကာကွယ်ရန်အရေးကြီးသည်။')]),page());

children.push(h('20. Key Limitations & Risks',1),table(['Area','Current limitation / risk','Practical implication'],[
  ['Notifications','Full Web Push backend မဟုတ်','Browser/app ပိတ်လျှင် notification delivery မအာမခံ'],['Realtime','Direct WebSocket ကို ISP ကပိတ်နိုင်','8-second polling အထိ update delay ဖြစ်နိုင်'],['Email','Default Supabase email delivery/rate limits','Verification/reset flow ရှိသော်လည်း email မရောက်နိုင်'],['PWA cache','Old cached shell ကျန်နိုင်','Deploy အသစ်မပေါ်လျှင် cache version/update လို'],['Offline','App shell cache သာ','Database queries အတွက် network လို'],['Migrations','Fresh/old DB state ကွာနိုင်','Duplicate/out-of-order SQL run မလုပ်သင့်'],['Secrets','Frontend key visibility','Publishable key သာ; RLS always on; secret/service_role မထည့်'],['Payment','Screenshot proof flow','Automatic gateway verification ကို source မဖော်ပြ']
],[18,37,45]),h('Change Impact Checklist',2),bullet('Order status အသစ် → DB constraint/trigger + Owner/Customer UI + history + notifications အားလုံးပြင်။'),bullet('Column အသစ် → queries + RLS + grants + migration စစ်။'),bullet('Storage change → upload path + signed URL + policies စစ်။'),bullet('Cached file change → Service Worker cache version တိုး။'),bullet('User string → escapeHtml(); phone display နှင့် tel: value သီးခြား sanitize။'),page());

children.push(h('21. Troubleshooting Summary',1),table(['Symptom','Check in this order'],[
  ['Login: Failed to fetch','/api/config response → Vercel env vars → /supabase/auth/v1 status → local runner is vercel dev'],['Order update မဖြစ်','Console CHANNEL_ERROR → Realtime publication has orders → wait 8-sec polling → RLS select policy'],['Image မပေါ်','Bucket/path → Storage RLS → signed URL expiry → public URL/private path မရော'],['Verification/reset email မရ','Confirm email ON → redirect allow list → Auth Logs → Spam → rate limit'],['Deploy အဟောင်းပဲပေါ်','CACHE_NAME → hard refresh → service worker update/unregister → site data clear']
],[30,70]),note('Troubleshooting ကို “Config → Network → Security policy → Cache/expiry” အစီအစဉ်နဲ့စစ်ပါ။ Error ကိုဖုံးထားသော UI ပြဿနာထက် browser Console/Network နှင့် Supabase logs က ပိုတိကျသော evidence ပေးသည်။'),page());

children.push(h('22. Project-Show Speaking Plan',1),table(['အချိန်','ဘာပြမလဲ','ပြောရမည့်အဓိက message'],[
  ['1 min','Cover + overview','University canteen multi-shop platform; roles 3 ခု'],['2 min','Problem/solution + roles','Customer convenience၊ shop separation၊ admin approval'],['3 min','End-to-end demo flow','Customer order → Owner fulfillment → Customer received'],['3 min','Architecture + context','Vercel frontend/proxy; Supabase services; system boundary'],['4 min','DFD Level 0/1','Data/process ဘယ်လိုစီးသလဲ'],['3 min','ER + security','Six documented tables; RLS/trigger is real enforcement'],['2 min','Realtime/PWA/limitations','Instant when possible; 8-sec fallback; no guaranteed closed-app push'],['2 min','Deployment/troubleshooting/conclusion','How to run, operational risks, final value']
],[15,32,53]),h('Suggested Demo Narrative',2),p('Customer အဖြစ် login → approved shop/menu → cart/checkout/payment proof → order pending။ Owner dashboard တွင် order ကို accept → preparing → ready → sent ပြောင်း။ Customer tracker update ဖြစ်ပြီး received confirm လုပ်ကာ delivered ဖြစ်ကြောင်းပြပါ။ အချိန်ရလျှင် Admin owner approval နှင့် menu availability ကိုပြပါ။'),p([tr('သတိ: ',{bold:true,color:RED}),tr('Live demo မအောင်မြင်လျှင် architecture diagram နှင့် lifecycle diagram ကို fallback explanation အဖြစ်သုံးပါ။ Source မဖော်ပြသော feature ကို “ရှိသည်” ဟုမပြောပါနှင့်။')]),page());

children.push(h('23. Glossary for Non-Technical Viewers',1),table(['Term','လွယ်ကူသောအဓိပ္ပာယ်'],[
  ['Frontend','အသုံးပြုသူမြင်ပြီးနှိပ်သည့် website မျက်နှာပြင်'],['Backend','Login၊ data၊ files နှင့် system rules ကိုနောက်ကွယ်မှလုပ်ပေးသည့်အပိုင်း'],['Authentication (Auth)','“ဘယ်သူလဲ” ကို login ဖြင့်အတည်ပြုခြင်း'],['Authorization','အဲဒီသူက “ဘာလုပ်ခွင့်ရှိလဲ” ဆုံးဖြတ်ခြင်း'],['Database / PostgreSQL','Users၊ shops၊ menus၊ orders စသည့် structured data သိမ်းရာ'],['RLS','Database row တစ်ကြောင်းချင်းအလိုက် ဘယ်သူဖတ်/ပြင်နိုင်သလဲ စစ်သည့် rule'],['Trigger','Data ပြောင်းသည့်အချိန် database ကအလိုအလျောက်စစ်/လုပ်သည့် rule'],['Storage','ပုံများနှင့် payment screenshot files သိမ်းရာ'],['Signed URL','Private file ကို အချိန်ကန့်သတ်ဖြင့်ဖွင့်နိုင်သော link'],['Realtime','Data ပြောင်းသည်နှင့် page သို့ live event ပို့ခြင်း'],['Polling','သတ်မှတ်အချိန်ခြားတိုင်း update ရှိမရှိပြန်မေးခြင်း'],['Proxy / Rewrite','Browser request ကို Vercel မှတစ်ဆင့် Supabase သို့လမ်းပြောင်းပေးခြင်း'],['PWA','Website ကို app လို install/caching လုပ်နိုင်စေသည့်နည်း'],['Service Worker','Browser နောက်ကွယ်တွင် cache/network request အချို့ကိုစီမံသည့် script'],['Migration','Database structure/policies ကို version အလိုက်ပြောင်းသည့် SQL file']
],[28,72]),page());

children.push(h('24. Conclusion',1),p('Order2Me သည် canteen ordering ကို Customer၊ Owner နှင့် Admin တာဝန်ခွဲခြားမှုဖြင့် စနစ်တကျချိတ်ဆက်ထားသော multi-shop web application ဖြစ်သည်။ Vercel က lightweight HTML/CSS/JavaScript frontend၊ runtime configuration နှင့် API routing ကိုပေးပြီး Supabase က authentication၊ database၊ private file storage နှင့် realtime updates ကိုပေးသည်။'),p('Project ၏အရေးကြီးဆုံး design value များမှာ shop data isolation၊ Admin approval lifecycle၊ role-aware order transitions၊ RLS/trigger security နှင့် unstable WebSocket environment အတွက် 8-second polling fallback ဖြစ်သည်။ တစ်ချိန်တည်းမှာ closed-app notification၊ offline live data၊ email delivery နှင့် migration state တို့၏ကန့်သတ်ချက်များကို အမှန်အတိုင်းသိရှိထားရမည်။'),note('နိဂုံးချုပ်ရာတွင် “Order2Me က order တင်တာတစ်ခုတည်းမဟုတ်ဘဲ account approval၊ shop isolation၊ secure data access၊ order lifecycle နှင့် operational fallback တွေပါဝင်တဲ့ end-to-end system” ဟုတင်ပြပါ။'),p('— End of Project Show Document —',{align:AlignmentType.CENTER,after:0,size:18,color:GREY}));

const doc = new Document({
  numbering:{config:[{reference:'bullets',levels:[{level:0,format:LevelFormat.BULLET,text:'•',alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:420,hanging:220}}}},{level:1,format:LevelFormat.BULLET,text:'◦',alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:760,hanging:220}}}}]}]},
  styles:{default:{document:{run:{font,size:22,color:'263640'},paragraph:{spacing:{line:300,after:120}}}},paragraphStyles:[
    {id:'Title',name:'Title',basedOn:'Normal',next:'Normal',run:{font,size:54,bold:true,color:NAVY},paragraph:{alignment:AlignmentType.CENTER,spacing:{after:180}}},
    {id:'Heading1',name:'Heading 1',basedOn:'Normal',next:'Normal',quickFormat:true,run:{font,size:34,bold:true,color:NAVY},paragraph:{spacing:{before:300,after:140},keepNext:true,border:{bottom:{color:TEAL,space:5,style:BorderStyle.SINGLE,size:12}}}},
    {id:'Heading2',name:'Heading 2',basedOn:'Normal',next:'Normal',quickFormat:true,run:{font,size:27,bold:true,color:BLUE},paragraph:{spacing:{before:220,after:120},keepNext:true}},
    {id:'Heading3',name:'Heading 3',basedOn:'Normal',next:'Normal',quickFormat:true,run:{font,size:23,bold:true,color:GREY},paragraph:{spacing:{before:180,after:90},keepNext:true}}
  ]},
  sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:900,right:850,bottom:850,left:850}},titlePage:true},headers:{default:new Header({children:[new Paragraph({children:[tr('ORDER2ME  |  PROJECT SHOW DOCUMENT',{size:16,bold:true,color:BLUE}),tr('SYSTEM OVERVIEW & TECHNICAL REFERENCE',{size:15,color:GREY})],tabStops:[{type:TabStopType.RIGHT,position:TabStopPosition.MAX}],spacing:{after:0}})]})},footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,children:[tr('Order2Me  •  Source-based documentation  •  Page ',{size:16,color:GREY}),new TextRun({children:[PageNumber.CURRENT],font,size:16,color:GREY})]})]})},children}]
});

fs.mkdirSync(path.dirname(OUT),{recursive:true});
Packer.toBuffer(doc).then(buf=>{fs.writeFileSync(OUT,buf);console.log(`${OUT}\n${buf.length} bytes`)});
