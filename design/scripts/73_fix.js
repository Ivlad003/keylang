const s=Get(n=>n.name==="TUI · редактор — автодоповнення з індексу + ghost агента"?n.id:undefined)[0]
Get(s,n=>{if(n.type==="text"&&typeof n.content==="string"&&/^─{60,}$/.test(n.content))Update(n.id,{content:"─".repeat(56)})})
Get(s,(n,c)=>c.problems&&n.name!=="title"&&Print(n.name,"|",c.problems))
Export([s],"png","/tmp/claude-1000/-home-kosmodev-pet-project-kosmo-lang-ai/4723d380-7591-4195-864a-ac659da5eac8/scratchpad/pen/exp",{scale:1})
