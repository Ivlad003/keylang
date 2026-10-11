const LC={domain:"$l-domain",application:"$l-app",infrastructure:"$l-infra",presentation:"$l-pres"}

const layerOf=id=>id.split(".")[0]

function F(p,o){return Insert(p,{type:"frame",...o})}

function T(p,c,o){return Insert(p,{type:"text",name:o&&o.name||c.slice(0,24),content:c,fontFamily:"$font-ui",fontSize:13,fill:"$text",...o})}

function Ic(p,icon,s,fill){return Insert(p,{type:"icon",name:"icon "+icon,library:"lucide",icon,width:s||14,height:s||14,fill:fill||"$text-2"})}

function Dot(p,col,s){return Insert(p,{type:"ellipse",name:"dot",width:s||8,height:s||8,fill:col})}

const C={kw:"#FF7AB2",cm:"#6C7986",path:"#6BDFFF",sig:"#A8B1BD",tx:"#DDE3EA",b:"#6C7986",h:"#FFFFFF",n:"#4B5563",sel:"#243044"}

const FS=13,LH=1.5

function Sp(p,t,col,o){return Insert(p,{type:"text",name:"sp "+t.slice(0,16),content:t,fontFamily:"$font-code",fontSize:FS,lineHeight:LH,fill:col||C.tx,...o})}

function idCol(id){return LC[layerOf(id)]||C.tx}

function Ln(p,n,st,spans,o){const r=F(p,{name:"ln "+n,width:"fill_container",alignItems:"center",fill:o&&o.cur?C.sel:undefined});const g=F(r,{name:"gutter",width:44,justifyContent:"end",padding:[0,8,0,0]});Sp(g,n===""?" ":String(n),C.n);const s=F(r,{name:"st",width:18});

if(st){const m={ok:["✓","$ok"],fail:["✗","$fail"],unv:["◌","$warn"],llm:["+?","$warn"],agree:["=","$ok"],conf:["!","$fail"],algo:["=","$accent"],add:["+","$ok"],del:["-","$fail"],gh:["✦","#56606C"]}[st];Sp(s,m[0],m[1],{fontWeight:"700"})}else Sp(s," ");const tx=F(r,{name:"text",gap:0,alignItems:"center"});

for(const x of spans){if(Array.isArray(x))Sp(tx,x[0],x[1],x[2]);else Sp(tx,x)}

return r}

function Box(p,title,o){o=o||{};const {pad,tc,...rest}=o;const b=F(p,{name:"box "+title,layout:"vertical",strokeWidth:1,...rest,stroke:rest.stroke||"#3A4452",padding:pad||[10,10,6,10]});const t=F(b,{name:"title",layoutPosition:"absolute",x:12,y:-10,padding:[0,4],fill:rest.fill||"$bg"});Sp(t,title,tc||C.sig,{fontWeight:"600"});

return b}

function Kw(t){return [t,C.kw]}

 function Cm(t){return [t,C.cm]}

 function Id(t,o){return [t,idCol(t),o]}

 function Pa(t){return [t,C.path,{underline:true}]}

 function Bl(t){return [t||"- ",C.b]}

function TuiFrame(name,x,y,tabs,mode,mcol,st,hints){const tui=Insert(document,{type:"frame",name,x,y,width:1280,height:800,layout:"vertical",fill:"$bg",clip:true,placeholder:true});const tl=F(tui,{name:"Tab line",width:"fill_container",alignItems:"center",fill:"#10141A"});const br=F(tl,{name:"brand",padding:[4,10],fill:"$accent"});Sp(br,"keylang","#0D1015",{fontWeight:"700"});

for(const [t,a,s2] of tabs){const x2=F(tl,{name:"tab "+t,padding:[4,12],gap:8,fill:a?C.sel:undefined,alignItems:"center"});Sp(x2,t,a?C.h:C.sig);

if(s2)Sp(x2,s2,s2==="✗"?"$fail":"$warn")}

F(tl,{name:"sp",width:"fill_container",height:1});const rp=F(tl,{name:"repo",padding:[4,12]});Sp(rp,"shop-example · main",C.cm);const mn=F(tui,{name:"Main",width:"fill_container",height:"fill_container",gap:8,padding:[14,8,8,8]});const sl=F(tui,{name:"Status line",width:"fill_container",alignItems:"center",fill:"#10141A"});const md=F(sl,{name:"mode",padding:[3,10],fill:mcol});Sp(md,mode,"#0D1015",{fontWeight:"700"});

for(const [t,c2] of st)Sp(sl,t,c2);F(sl,{name:"sp",width:"fill_container",height:1});

for(const [k,t] of hints){const g=F(sl,{name:"hint "+k,gap:5,padding:[3,8],alignItems:"center"});const kb=F(g,{name:"kb",padding:[0,5],fill:"#2A3340"});Sp(kb,k,C.h);Sp(g,t,C.sig)}

return {tui,mn}}

function Banner(p,col,bg,lines){const b=F(p,{name:"inline banner",width:"fill_container",layout:"vertical",padding:[4,10,4,62],fill:bg,stroke:col,strokeWidth:{left:2}});

for(const l of lines){const r=F(b,{name:"bl",alignItems:"center"});

for(const s2 of l)Sp(r,s2[0],s2[1],s2[2])}

return b}

function Keys(p,list){const hk=F(p,{name:"keys",gap:14,alignItems:"center"});

for(const [k,t] of list){const g=F(hk,{name:"k "+k,gap:6,alignItems:"center"});const kb=F(g,{name:"kb",padding:[0,5],fill:"#3A4452"});Sp(kb,k,C.h);Sp(g,t,C.sig)}

return hk}

function Rows(p,rows){for(const r of rows){const x=F(p,{name:"row",width:"fill_container",padding:[0,4],fill:r.sel?C.sel:undefined});

for(const s2 of (r.s||r))Sp(x,s2[0],s2[1],s2[2])}}

const GH="#5A6573"

function Gh(t){return [t,GH,{fontStyle:"italic"}]}

function Menu(p,title,x,y,w,items,sel,o){const b=Box(p,title,{layoutPosition:"absolute",x,y,width:w,fill:"$panel-2",stroke:"#8AA4FF88",pad:[12,4,6,4],gap:0,tc:(o&&o.tc)||C.sig,effect:{type:"shadow",offset:{x:0,y:10},blur:28,color:"#000000A0"}});items.forEach((it,i)=>{const r=F(b,{name:"item",width:"fill_container",padding:[1,8],gap:0,alignItems:"center",fill:i===sel?C.sel:undefined,opacity:it.dis?0.5:1});

for(const s2 of it.s)Sp(r,s2[0],s2[1],s2[2]);

if(it.r){F(r,{name:"sp",width:"fill_container",height:1});

for(const s2 of it.r)Sp(r,s2[0],s2[1],s2[2])}});

return b}
