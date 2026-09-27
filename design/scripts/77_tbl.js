const rd=Get(n=>n.name==="TUI · читання спеки (v) — рендер Markdown"?n.id:undefined)[0]
const box=Get(rd,n=>n.name==="box flows/checkout.md · читання"?n.id:undefined)[0]
const kids=Get(box,{depth:1}).children
const rows=kids.filter(k=>k.name==="tbl")
const idx=kids.findIndex(k=>k.name==="tbl")
const t=Insert(box,{type:"frame",name:"table",layout:"vertical",gap:0})
Move(t,box,idx)
for(const r of rows){Move(r.id,t);for(const ch of Get(r.id,{depth:1}).children)Update(ch.id,{lineHeight:1.25})}
Export([rd],"png","/home/kosmodev/pet_project/keylang/design/png",{scale:1})
