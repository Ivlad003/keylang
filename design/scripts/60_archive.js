Get(n=>{if(n.type==="text"&&typeof n.content==="string"&&n.content.includes("kosmo"))Update(n.id,{content:n.content.replace(/kosmo/g,"keylang")})})
Get((n,c)=>{if(c.depth===0){c.skipChildren();if(n.name&&/^0\d · /.test(n.name))Update(n.id,{name:"v0 web (архів) · "+n.name})}})
Get((n,c)=>{c.skipChildren();Print(n.id,n.name,c.bounds.x,c.bounds.y,c.bounds.width,c.bounds.height)})
