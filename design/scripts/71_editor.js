const {tui,mn}=TuiFrame("TUI · редактор — автодоповнення з індексу + ghost агента",0,6300,[["map/application.md",0],["flows/refund.md ●",1],["flows/checkout.md",0,"✗"]],"INSERT","$ok",[["  flows/refund.md* ",C.sig],["  8:24",C.cm],["  ◌ 2 без коду","$warn"]],[["Tab","вставити"],["Ctrl+Space","агент"],["Ctrl+G","текст→спека"],["Ctrl+R","голос"],["v","читати"]])
const ed=Box(mn,"flows/refund.md · новий",{width:"fill_container",height:"fill_container",pad:[12,8,8,4]})
Ln(ed,"1",null,[["# flow refund",C.h,{fontWeight:"700"}]])
Ln(ed,"2",null,[["Повернення коштів за скасоване замовлення тим самим способом оплати.",C.tx]])
Ln(ed,"3",null,[" "])
Ln(ed,"4",null,[Bl(),Kw("kind "),["business","$l-domain"]])
Ln(ed,"5","unv",[Bl(),Kw("trigger "),["presentation.api.refund","$l-pres",{underline:true}],["   немає в коді · Enter → spec-to-code",GH]])
Ln(ed,"6","ok",[Bl(),Kw("step "),Id("application.purchase.cancel")])
Ln(ed,"7","ok",["  ",Bl(),Kw("reads "),Id("infrastructure.orderStore.find")])
Ln(ed,"8",null,["  ",Bl(),Kw("step "),["infrastructure.or","$l-infra"],["▏","$accent",{fontWeight:"700"}]],{cur:1})
Ln(ed,"9","gh",["    ",Gh("- step infrastructure.payments.refund")])
Ln(ed,"10","gh",["  ",Gh("- emits event order.refunded")])
Ln(ed,"11","gh",[Gh("- when повернення пізніше 14 днів")])
Ln(ed,"12","gh",["  ",Gh("- then application.purchase.RefundExpired")])
Banner(ed,GH,"#5A657314",[[["✦ агент  ",C.sig,{fontWeight:"700"}],["4 рядки · за текстом рядка 2 і схожим flow cancel-order   ",GH],["Tab","#0D1015",{}]]])
const bn=Get(ed,n=>n.name==="inline banner"?n.id:undefined)[0];const bl=Get(bn,{depth:2}).children[0].children;Delete(bl[bl.length-1].id);Keys(Get(bn,{depth:1}).children[0].id,[["Tab","прийняти"],["Alt+]","інший варіант"],["Esc","сховати"]])
Menu(ed,"infrastructure.or… · з індексу",430,188,600,[
{s:[["ƒ ",C.cm],["infrastructure.",C.sig],["orderStore.save","$l-infra",{fontWeight:"700"}]],r:[["(order: Order) → Promise<void>",C.cm]]},
{s:[["ƒ ",C.cm],["infrastructure.",C.sig],["orderStore.remove","$l-infra",{fontWeight:"700"}]],r:[["(id: OrderId) → Promise<void>",C.cm]]},
{s:[["ƒ ",C.cm],["infrastructure.",C.sig],["orderStore.find","$l-infra",{fontWeight:"700"}]],r:[["(id) → Order | undefined",C.cm]]},
{s:[["▣ ",C.cm],["infrastructure.",C.sig],["orderStore","$l-infra",{fontWeight:"700"}]],r:[["module · 4 fn",C.cm]]},
{s:[["ƒ ",C.cm],["infrastructure.",C.sig],["orders.legacyImport",C.n,{strikethrough:true}]],r:[["deny: application ✗","$fail"]],dis:1},
{s:[["─".repeat(66),"#3A4452"]]},
{s:[["remove",C.h,{fontWeight:"700"}],["  src/infra/order-store.ts:21",C.path,{underline:true}]]},
{s:[["Видаляє замовлення зі сховища.",C.sig]]},
{s:[["у потоках  ",C.cm],["cancel-order ",C.tx],["✓","$ok"]]}],1)
const rc=F(mn,{name:"Right column",width:300,height:"fill_container",layout:"vertical",gap:14})
const ob=Box(rc,"Outline",{width:"fill_container",pad:[12,8,8,8]})
Rows(ob,[[["flow ",C.kw],["refund",C.h,{fontWeight:"700"}]],[["  trigger     ",C.sig],["◌","$warn"]],[["  step cancel ",C.sig],["✓","$ok"]],[["    reads     ",C.sig],["✓","$ok"]],{s:[["    step …",C.h]],sel:1},[["  ✦ 4 від агента",GH]]])
const nb=Box(rc,"Без коду · spec-to-code",{width:"fill_container",pad:[12,8,8,8]})
Rows(nb,[[["◌ ","$warn"],["presentation.api.refund",C.tx]],[["◌ ","$warn"],["infrastructure.payments.refund",GH]],[[" ",C.cm]],[["Enter",C.h],[" на рядку → створити",C.cm]]])
const hb=Box(rc,"Підказки",{width:"fill_container",height:"fill_container",pad:[12,8,8,8]})
Rows(hb,[[["список  ",C.cm],["з індексу, без LLM",C.sig]],[["сірий   ",C.cm],["ghost від агента",C.sig]],[["фільтр  ",C.cm],["allow/deny з rules",C.sig]]])
Update(tui,{placeholder:false})
Get(tui,(n,c)=>c.problems&&n.name!=="title"&&Print(n.name,"|",c.parentCtx&&c.parentCtx.node.name,"|",c.problems))
Export([tui],"png","/tmp/claude-1000/-home-kosmodev-pet-project-kosmo-lang-ai/4723d380-7591-4195-864a-ac659da5eac8/scratchpad/pen/exp",{scale:1})
