const ids=Get((n,c)=>{c.skipChildren();return (n.name.startsWith("TUI")||n.name.startsWith("Варіант"))?[n.id,n.name]:undefined})
for(const [i,nm] of ids)Print(i,"=",nm)
Export(ids.map(x=>x[0]),"png","/home/kosmodev/pet_project/keylang/design/png",{scale:1})
