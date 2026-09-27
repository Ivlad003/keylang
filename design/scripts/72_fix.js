const s=Get(n=>n.name==="TUI · редактор — автодоповнення з індексу + ghost агента"?n.id:undefined)[0]
Get(s,n=>{if(n.name==="inline banner")Delete(n.id)})
Get(s,n=>{if(n.name==="box infrastructure.or… · з індексу")Update(n.id,{x:445,y:196,width:500})})
Get(s,n=>{if(n.name==="hint Ctrl+G"){const k=Get(n.id,{depth:2}).children;Update(k[0].children[0].id,{content:"Alt+]"});Update(k[1].id,{content:"інший ✦"})}})
Get(s,n=>{if(n.name==="hint Tab"){const k=Get(n.id,{depth:1}).children;Update(k[1].id,{content:"вставити / ✦ прийняти"})}})
Get(s,(n,c)=>c.problems&&n.name!=="title"&&Print(n.name,"|",c.problems))
Export([s],"png","/tmp/claude-1000/-home-kosmodev-pet-project-kosmo-lang-ai/4723d380-7591-4195-864a-ac659da5eac8/scratchpad/pen/exp",{scale:1})
