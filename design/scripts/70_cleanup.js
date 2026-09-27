Get((n,c)=>{c.skipChildren();if(n.name.startsWith("v0 web")||n.name==="04 · Генерація — форма й звіряння algo × LLM"){Print("delete",n.name);Delete(n.id)}})
Get((n,c)=>{c.skipChildren();Print(n.id,n.name,c.bounds.x,c.bounds.y)})
