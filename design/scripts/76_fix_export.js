const rd=Get(n=>n.name==="TUI · читання спеки (v) — рендер Markdown"?n.id:undefined)[0]
Get(rd,n=>{if(n.name==="tbl"){for(const ch of Get(n.id,{depth:1}).children)Update(ch.id,{lineHeight:1.2})}})
const sc=Get(n=>n.name==="TUI · spec-to-code — з рядка спеки в код + e2e"?n.id:undefined)[0]
Get(sc,n=>{if(n.name==="box дії · presentation.api.refund")Update(n.id,{y:146})})
for(const t of [rd,sc])Get(t,(n,c)=>c.problems&&n.name!=="title"&&Print(n.name,"|",c.problems))
const names={"TUI · map (component)":"1-map-hover","TUI · flow checkout — жолоб і помилка e2e":"2-flow-gutter-e2e","TUI · draft hybrid — злиття algo × LLM":"3-draft-hybrid-merge","TUI · пояснення вузла (e)":"4-explain-node","Варіант A · keylang у терміналі":"5-variant-terminal","Варіант B · keylang web у браузері":"6-variant-browser","TUI · редактор — автодоповнення з індексу + ghost агента":"7-editor-autocomplete","TUI · агент — співавторство, контекст, голос":"8-agent-context-voice","TUI · читання спеки (v) — рендер Markdown":"9-read-markdown","TUI · spec-to-code — з рядка спеки в код + e2e":"10-spec-to-code"}
const ids=Get((n,c)=>{c.skipChildren();return names[n.name]?n.id:undefined})
Get((n,c)=>{c.skipChildren();if(names[n.name])Print(n.id,"=",names[n.name])})
Export(ids,"png","/home/kosmodev/pet_project/keylang/design/png",{scale:1})
