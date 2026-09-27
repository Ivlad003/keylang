const pos={x:0,y:3300}
tui=Insert(document,{type:"frame",name:"TUI · map (component)",reusable:true,x:pos.x,y:pos.y,width:1280,height:800,layout:"vertical",fill:"$bg",clip:true,placeholder:true})
const tl=F(tui,{name:"Tab line",width:"fill_container",alignItems:"center",fill:"#10141A"})
const br=F(tl,{name:"brand",padding:[4,10],fill:"$accent"});Sp(br,"keylang","#0D1015",{fontWeight:"700"})
for(const [t,a,st] of [["map/application.md",1,""],["flows/checkout.md",0,"✗"],["rules.md",0,"✗"],["keylang.toml",0,""]]){const x=F(tl,{name:"tab "+t,padding:[4,12],gap:8,fill:a?C.sel:undefined,alignItems:"center"});Sp(x,t,a?C.h:C.sig);if(st)Sp(x,st,"$fail")}
F(tl,{name:"sp",width:"fill_container",height:1});const rp=F(tl,{name:"repo",padding:[4,12]});Sp(rp,"shop-example · main",C.cm)
const mn=F(tui,{name:"Main",width:"fill_container",height:"fill_container",gap:8,padding:[14,8,8,8]})
const ed=Box(mn,"map/application.md · згенеровано",{width:"fill_container",height:"fill_container",pad:[12,8,8,4]})
const L=[
["",null,[Cm("<!-- keylang:generated — не редагувати, `keylang map` -->")]],
["2",null,[["# application",C.h,{fontWeight:"700"}]]],
["3",null,[["Сервіси бізнес-логіки. Залежать від domain та infrastructure.",C.tx]]],
["4",null,[" "]],
["5","ok",[Bl(),Kw("module "),["[",C.b],["purchase",C.h,{fontWeight:"700"}],["](",C.b],Pa("src/app/purchase.ts#L1"),[")",C.b]]],
["6",null,["  ",Bl(),["order    ",C.sig],Id("domain.orderAggregate")]],
["7",null,["  ",Bl(),["catalog  ",C.sig],Id("infrastructure.products")]],
["8",null,["  ",Bl(),["orders   ",C.sig],Id("infrastructure.orderStore")]],
["9","ok",["  ",Bl(),Kw("fn "),["[",C.b],["buy","$l-app",{fontWeight:"700"}],["](",C.b],Pa("src/app/purchase.ts#L12"),[") ",C.b],["(cart: Cart) → Promise<Order>",C.sig]]],
["10","ok",["    ",Bl(),Kw("calls "),Id("domain.orderAggregate.create"),[", ",C.b],["infrastructure.orderStore.save","$l-infra",{underline:true}]],{cur:1}],
["11","ok",["  ",Bl(),Kw("fn "),["[",C.b],["cancel","$l-app",{fontWeight:"700"}],["](",C.b],Pa("src/app/purchase.ts#L30"),[") ",C.b],["(id: OrderId) → Promise<void>",C.sig]]],
["12","ok",["    ",Bl(),Kw("calls "),Id("infrastructure.orderStore.remove")]],
["13",null,[" "]],
["14",null,[["# presentation",C.h,{fontWeight:"700"}]]],
["15",null,[["Термінал і HTTP API. Точка входу — presentation.terminal.",C.tx]]],
["16",null,[" "]],
["17","ok",[Bl(),Kw("module "),["[",C.b],["terminal",C.h,{fontWeight:"700"}],["](",C.b],Pa("src/ui/terminal.ts#L1"),[")",C.b]]],
["18",null,["  ",Bl(),["checkout ",C.sig],Id("application.purchase")]],
["19","ok",[Bl(),Kw("module "),["[",C.b],["api",C.h,{fontWeight:"700"}],["](",C.b],Pa("src/ui/api.ts#L1"),[")",C.b]]],
["20",null,["  ",Bl(),["purchase ",C.sig],Id("application.purchase")]]]
L[0][0]="1"
for(const [n,st,sp,o] of L)Ln(ed,n,st,sp,o)
const hv=Box(ed,"fn infrastructure.orderStore.save",{layoutPosition:"absolute",x:420,y:258,width:520,fill:"$panel-2",tc:"$l-infra",stroke:"#8AA4FF88",pad:[14,14,10,14],gap:2,effect:{type:"shadow",offset:{x:0,y:10},blur:28,color:"#000000A0"}})
const rows=[[["(order: Order) → Promise<void>",C.sig]],[Pa("src/infra/order-store.ts:9")],[["─".repeat(54),"#3A4452"]],[["  9  ",C.n],Kw("export async function "),["save",C.h],["(order: Order) {",C.tx]],[[" 10  ",C.n],["  orders.set(order.id, order);",C.tx]],[[" 11  ",C.n],["  await flush();",C.tx]],[[" 12  ",C.n],["}",C.tx]],[["─".repeat(54),"#3A4452"]],[["flows   ",C.cm],["checkout ",C.tx],["✓ step 3","$ok"]],[["called  ",C.cm],["← ",C.b],Id("application.purchase.buy")]]
for(const r of rows){const x=F(hv,{name:"hl",alignItems:"center"});for(const s2 of r)Sp(x,s2[0],s2[1],s2[2])}
const hk=F(hv,{name:"keys",gap:14,padding:[8,0,0,0],alignItems:"center"});for(const [k,t] of [["Enter","код"],["Alt+Enter","спека"],["r","посилання · 3"],["Esc","закрити"]]){const g=F(hk,{name:"k "+k,gap:6,alignItems:"center"});const kb=F(g,{name:"kb",padding:[0,5],fill:"#3A4452"});Sp(kb,k,C.h);Sp(g,t,C.sig)}
const nv=Box(mn,"Навігація  Ctrl+1",{width:300,height:"fill_container",pad:[12,8,8,8]})
const NV=[[["▾ ",C.cm],["● ","$l-domain"],["domain",C.h,{fontWeight:"700"}]],[["    ▸ ",C.cm],["orderAggregate",C.tx]],[["▾ ",C.cm],["● ","$l-infra"],["infrastructure",C.h,{fontWeight:"700"}]],[["    ",C.cm],["config",C.tx]],[["    ",C.cm],["logger",C.tx]],[["    ",C.cm],["products",C.tx]],[["    ▾ ",C.cm],["orderStore",C.tx]],[["        ƒ ",C.cm],["save","$l-infra",{underline:true}]],[["    ",C.cm],["server",C.tx]],[["▾ ",C.cm],["● ","$l-app"],["application",C.h,{fontWeight:"700"}]],[["    ▾ ",C.cm],["purchase",C.h,{fontWeight:"700"}],"SEL"],[["        ƒ ",C.cm],["buy",C.tx]],[["        ƒ ",C.cm],["cancel",C.tx]],[["▸ ",C.cm],["● ","$l-pres"],["presentation",C.h,{fontWeight:"700"}]],[[" ",C.cm]],[["ПОТОКИ",C.cm,{fontWeight:"700"}]],[["  checkout      ",C.tx],["✗ 1","$fail"]],[["  cancel-order  ",C.tx],["✓","$ok"]],[["  http-retry    ",C.tx],["◌ 2","$warn"]],[[" ",C.cm]],[["ПРАВИЛА",C.cm,{fontWeight:"700"}]],[["  rules.md      ",C.tx],["✗ 2","$fail"]]]
for(const r of NV){const sel=r[r.length-1]==="SEL";const x=F(nv,{name:"nav",width:"fill_container",padding:[0,4],fill:sel?C.sel:undefined});for(const s2 of r)if(s2!=="SEL")Sp(x,s2[0],s2[1],s2[2])}
const sl=F(tui,{name:"Status line",width:"fill_container",alignItems:"center",fill:"#10141A"})
const md=F(sl,{name:"mode",padding:[3,10],fill:"$accent"});Sp(md,"NORMAL","#0D1015",{fontWeight:"700"})
for(const [t,c2] of [[" ✗ 2 ","$fail"],[" ◌ 5 ","$warn"],["  application.purchase.buy ",C.sig],["  10:31",C.cm]])Sp(sl,t,c2)
F(sl,{name:"sp",width:"fill_container",height:1})
for(const [k,t] of [["Enter","код"],["Alt+Enter","спека"],["/","пошук"],["F5","check"],["g","генерувати"],["?","клавіші"]]){const g=F(sl,{name:"hint "+k,gap:5,padding:[3,8],alignItems:"center"});const kb=F(g,{name:"kb",padding:[0,5],fill:"#2A3340"});Sp(kb,k,C.h);Sp(g,t,C.sig)}
Update(tui,{placeholder:false})
Get(tui,(n,c)=>c.problems&&Print(n.name,"|",c.parentCtx&&c.parentCtx.node.name,"|",c.problems))
Export([tui],"png","/tmp/claude-1000/-home-kosmodev-pet-project-kosmo-lang-ai/4723d380-7591-4195-864a-ac659da5eac8/scratchpad/pen/exp",{scale:1})
