window.LUA=window.LUA||{};
LUA.memory={
 db:null,dbName:'lua_memory_db',version:1,
 stats:{conversations:0,learnings:0,contexts:0,errors:0,lastSave:null,lastRead:null,lastSync:null,lastError:null,permission:'backend',ready:false},
 _counters:{conversation:0,learning:0,context:0,error:0},
 init:async function(){
  try{await this.openDB();}catch(e){this.logError('init',e.message);return;}
  await this.refreshCounts();
  this.stats.ready=true;this.stats.lastRead=new Date().toISOString();
  this.updatePanel();
 },
 openDB:function(){
  return new Promise((resolve,reject)=>{
   const req=indexedDB.open(this.dbName,this.version);
   req.onupgradeneeded=(e)=>{
    const db=e.target.result;
    if(!db.objectStoreNames.contains('conversations'))db.createObjectStore('conversations',{keyPath:'id'});
    if(!db.objectStoreNames.contains('learnings'))db.createObjectStore('learnings',{keyPath:'id'});
    if(!db.objectStoreNames.contains('contexts'))db.createObjectStore('contexts',{keyPath:'id'});
    if(!db.objectStoreNames.contains('errors'))db.createObjectStore('errors',{keyPath:'id'});
    if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta',{keyPath:'key'});
   };
   req.onsuccess=(e)=>{this.db=e.target.result;resolve(this.db);};
   req.onerror=(e)=>reject(e.target.error||new Error('Falha ao abrir IndexedDB'));
  });
 },
 tx:function(store,mode){return this.db.transaction(store,mode).objectStore(store);},
 getAll:function(store){
  return new Promise((resolve,reject)=>{
   const req=this.tx(store,'readonly').getAll();
   req.onsuccess=()=>resolve(req.result||[]);
   req.onerror=()=>reject(req.error);
  });
 },
 put:function(store,obj){
  return new Promise((resolve,reject)=>{
   const req=this.tx(store,'readwrite').put(obj);
   req.onsuccess=()=>resolve(obj);
   req.onerror=()=>reject(req.error);
  });
 },
 clearStore:function(store){
  return new Promise((resolve,reject)=>{
   const req=this.tx(store,'readwrite').clear();
   req.onsuccess=()=>resolve(true);
   req.onerror=()=>reject(req.error);
  });
 },
 getMeta:function(key){
  return new Promise((resolve)=>{
   try{const req=this.tx('meta','readonly').get(key);req.onsuccess=()=>resolve(req.result?req.result.value:undefined);req.onerror=()=>resolve(undefined);}catch(_){resolve(undefined);}
  });
 },
 setMeta:function(key,value){
  return new Promise((resolve)=>{
   try{const req=this.tx('meta','readwrite').put({key,value});req.onsuccess=()=>resolve(true);req.onerror=()=>resolve(false);}catch(_){resolve(false);}
  });
 },
 newId:function(prefix){this._counters[prefix]=(this._counters[prefix]||0)+1;return prefix+'_'+Date.now()+'_'+this._counters[prefix];},
 restoreFolderHandle:async function(){
  try{
   const handle=await this.getMeta('folderHandle');
   if(handle){this.folderHandle=handle;await this.ensurePermission(false);this.stats.permission=await this.permissionState();if(this.memoryDirHandle===null||this.memoryDirHandle===undefined)await this.getMemoryDir(false);}
  }catch(e){this.logError('restoreFolderHandle',e.message);}
 },
 permissionState:async function(){
  if(!this.folderHandle)return 'sem pasta';
  try{
   const q=await this.folderHandle.queryPermission({mode:'readwrite'});
   return q==='granted'?'concedida':(q==='prompt'?'pendente':'negada');
  }catch(_){return 'desconhecida';}
 },
 ensurePermission:async function(request){
  if(!this.folderHandle)return false;
  try{
   let q=await this.folderHandle.queryPermission({mode:'readwrite'});
   if(q!=='granted'&&request){q=await this.folderHandle.requestPermission({mode:'readwrite'});}
   this.stats.permission=(q==='granted'?'concedida':(q==='prompt'?'pendente':'negada'));
   return q==='granted';
  }catch(e){this.stats.permission='erro';return false;}
 },
 getMemoryDir:async function(create){
  if(!this.folderHandle)return null;
  const ok=await this.ensurePermission(false);
  if(!ok)return null;
  try{
   const dir=await this.folderHandle.getDirectoryHandle('memoria',{create:!!create});
   this.memoryDirHandle=dir;
   return dir;
  }catch(e){this.logError('getMemoryDir',e.message);return null;}
 },
 selectFolder:async function(){
  if(!window.showDirectoryPicker){alert('Seu navegador não suporta a File System Access API. A memória continuará no IndexedDB.');return false;}
  try{
   this.folderHandle=await window.showDirectoryPicker({mode:'readwrite'});
   await this.setMeta('folderHandle',this.folderHandle);
   this.memoryDirHandle=await this.getMemoryDir(true);
   this.stats.permission=await this.permissionState();
   this.stats.lastSync=new Date().toISOString();
   this.updatePanel();
   return true;
  }catch(e){if(e.name!=='AbortError')this.logError('selectFolder',e.message);return false;}
 },
 readFileText:async function(name){
  if(!this.memoryDirHandle)return null;
  try{
   const fh=await this.memoryDirHandle.getFileHandle(name);
   const file=await fh.getFile();
   this.stats.lastRead=new Date().toISOString();
   return await file.text();
  }catch(_){return null;}
 },
 appendFile:async function(name,text){
  if(this.noBackend||location.protocol==='file:')return false;
  try{
   const r=await fetch((window.API_BASE||'')+'/api/memory/append',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file:name,content:text})});
   const j=await r.json().catch(()=>({}));
   if(r.status===404||r.status===405){this.noBackend=true;return false;}
   if(!r.ok)throw new Error(j.error||('HTTP '+r.status));
   return true;
  }catch(e){this.logError('appendFile:'+name,e.message);return false;}
 },
 refreshCounts:async function(){
  try{
   const convs=await this.getAll('conversations');
   const learns=await this.getAll('learnings');
   const ctxs=await this.getAll('contexts');
   const errs=await this.getAll('errors');
   this.stats.conversations=convs.length;
   this.stats.learnings=learns.length;
   this.stats.contexts=ctxs.length;
   this.stats.errors=errs.length;
  }catch(e){this.logError('refreshCounts',e.message);}
 },
 tokenize:function(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/[^a-z0-9]+/).filter(t=>t.length>2);},
 scoreText:function(queryTokens,text){
  if(!queryTokens.length||!text)return 0;
  const toks=this.tokenize(text);
  let score=0;
  for(const t of queryTokens)if(toks.includes(t))score+=1;
  return score/queryTokens.length;
 },
 retrieveContext:async function(query){
  try{
   const convs=await this.getAll('conversations');
   const learns=await this.getAll('learnings');
   const qtoks=this.tokenize(query);
   const items=[];
   for(const c of convs){
    const text=(c.question||'')+' '+(c.answer||'')+' '+(c.memoryContext||'');
    const s=this.scoreText(qtoks,text);
    if(s>=0.6)items.push({type:'conversa',score:s,created:c.createdAt,text:'Pergunta: '+(c.question||'').slice(0,160)+' | Resposta: '+(c.answer||'').slice(0,240)});
   }
   for(const l of learns){
    if(l.status==='rejeitado')continue;
    const s=this.scoreText(qtoks,(l.content||'')+' '+(l.origin||''));
    if(s>=0.6)items.push({type:'aprendizado',score:s*(l.confidence||0.5),created:l.createdAt,text:'Aprendizado: '+(l.content||'').slice(0,280)});
   }
   items.sort((a,b)=>b.score-a.score||(b.created>a.created?1:-1));
   const top=items.slice(0,3);
   this.stats.lastRead=new Date().toISOString();
   this.updatePanel();
   return top.map(x=>x.text).join('\n');
  }catch(e){this.logError('retrieveContext',e.message);return '';}
 },
 saveConversation:async function(record){
  try{
   if(!record||!record.question||!record.answer)return false;
   const obj=Object.assign({id:this.newId('conv'),createdAt:new Date().toISOString()},record);
   await this.put('conversations',obj);
   const block=this.formatConversation(obj);
   const ok=await this.appendFile('memoria.txt',block);
   if(ok){
    await this.setMeta('lastSyncConversationId',obj.id);
    this.stats.lastSync=new Date().toISOString();
   }
   await this.refreshCounts();
   this.stats.lastSave=new Date().toISOString();
   this.updatePanel();
   return true;
  }catch(e){this.logError('saveConversation',e.message);return false;}
 },
 formatConversation:function(c){
  const d=new Date(c.createdAt);
  return [
   '========================================',
   'REGISTRO DE CONVERSA',
   '========================================',
   '',
   'ID: '+c.id,
   'DATA: '+d.toLocaleDateString('pt-BR'),
   'HORÁRIO: '+d.toLocaleTimeString('pt-BR'),
   '',
   'USUÁRIO:',
   c.question,
   '',
   'LUA:',
   c.answer,
   '',
   'INTENÇÃO:',
   (c.intent||'desconhecida')+' (confiança '+Math.round((c.confidence||0)*100)+'%)',
   '',
   'PROCESSAMENTO:',
   c.method||'não informado',
   '',
   'MEMÓRIA RECUPERADA:',
   c.memoryContext||'nenhuma',
   '',
   'FONTES:',
   c.sources||'interna',
   '',
   'VALIDAÇÃO:',
   c.validation||'não informada',
   '',
   '========================================',
   ''
  ].join('\n');
 },
 saveLearning:async function(record){
  try{
   if(!record||!record.content)return false;
   const obj=Object.assign({id:this.newId('learn'),createdAt:new Date().toISOString(),status:'pendente',confidence:0.5},record);
   await this.put('learnings',obj);
   const block=[
    '========================================',
    'APRENDIZADO',
    '========================================',
    'ID: '+obj.id,
    'DATA: '+new Date(obj.createdAt).toLocaleString('pt-BR'),
    'CONTEÚDO: '+obj.content,
    'ORIGEM: '+(obj.origin||'conversa'),
    'FONTE: '+(obj.source||'interna'),
    'CONFIANÇA: '+obj.confidence,
    'ESTADO: '+obj.status,
    'REGISTROS RELACIONADOS: '+(obj.related||'nenhum'),
    '========================================',
    ''
   ].join('\n');
   await this.appendFile('aprendizado.txt',block);
   await this.refreshCounts();
   this.stats.lastSave=new Date().toISOString();
   this.updatePanel();
   return true;
  }catch(e){this.logError('saveLearning',e.message);return false;}
 },
 saveContext:async function(summary){
  try{
   const obj={id:this.newId('ctx'),createdAt:new Date().toISOString(),summary:String(summary||'').slice(0,2000),refs:[]};
   await this.put('contexts',obj);
   const block='['+new Date().toLocaleString('pt-BR')+'] '+obj.summary+'\n';
   await this.appendFile('contexto.txt',block);
   await this.refreshCounts();
   this.stats.lastSave=new Date().toISOString();
   this.updatePanel();
   return true;
  }catch(e){this.logError('saveContext',e.message);return false;}
 },
 logError:async function(operation,message){
  try{
   const obj={id:this.newId('err'),createdAt:new Date().toISOString(),operation:String(operation||''),message:String(message||'').slice(0,500)};
   await this.put('errors',obj);
   const block='['+new Date().toLocaleString('pt-BR')+'] OP: '+obj.operation+' | ERRO: '+obj.message+'\n';
   await this.appendFile('historico_erros.txt',block);
   this.stats.errors=(this.stats.errors||0)+1;
   this.stats.lastError=obj.message;
   this.updatePanel();
  }catch(_){}
 },
 syncFiles:async function(){
  if(!this.memoryDirHandle){await this.logError('syncFiles','Pasta de memória não selecionada.');return false;}
  const ok=await this.ensurePermission(true);
  if(!ok){await this.logError('syncFiles','Sem permissão para acessar a pasta.');return false;}
  try{
   const lastConv=await this.getMeta('lastSyncConversationId');
   const convs=await this.getAll('conversations');
   let newConvs=convs;
   if(lastConv){const idx=convs.findIndex(c=>c.id===lastConv);if(idx>=0)newConvs=convs.slice(idx+1);}
   for(const c of newConvs)await this.appendFile('memoria.txt',this.formatConversation(c));
   if(newConvs.length)await this.setMeta('lastSyncConversationId',newConvs[newConvs.length-1].id);

   const lastLearn=await this.getMeta('lastSyncLearningId');
   const learns=await this.getAll('learnings');
   let newLearns=learns;
   if(lastLearn){const idx=learns.findIndex(l=>l.id===lastLearn);if(idx>=0)newLearns=learns.slice(idx+1);}
   for(const l of newLearns){
    const block=['ID: '+l.id,'DATA: '+new Date(l.createdAt).toLocaleString('pt-BR'),'CONTEÚDO: '+l.content,'ORIGEM: '+(l.origin||''),'FONTE: '+(l.source||''),'CONFIANÇA: '+l.confidence,'ESTADO: '+l.status,''].join('\n');
    await this.appendFile('aprendizado.txt',block);
   }
   if(newLearns.length)await this.setMeta('lastSyncLearningId',newLearns[newLearns.length-1].id);

   this.stats.lastSync=new Date().toISOString();
   await this.refreshCounts();
   this.updatePanel();
   return true;
  }catch(e){await this.logError('syncFiles',e.message);return false;}
 },
 exportMemory:async function(){
  try{
   const data={
    exportedAt:new Date().toISOString(),
    conversations:await this.getAll('conversations'),
    learnings:await this.getAll('learnings'),
    contexts:await this.getAll('contexts'),
    errors:await this.getAll('errors')
   };
   const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
   const a=document.createElement('a');
   a.href=URL.createObjectURL(blob);
   a.download='lua_memoria_export.json';
   a.click();
   setTimeout(()=>URL.revokeObjectURL(a.href),1000);
   return true;
  }catch(e){this.logError('exportMemory',e.message);return false;}
 },
 importMemory:async function(file){
  try{
   const text=await file.text();
   const data=JSON.parse(text);
   if(Array.isArray(data.conversations))for(const c of data.conversations)await this.put('conversations',c);
   if(Array.isArray(data.learnings))for(const l of data.learnings)await this.put('learnings',l);
   if(Array.isArray(data.contexts))for(const c of data.contexts)await this.put('contexts',c);
   if(Array.isArray(data.errors))for(const e of data.errors)await this.put('errors',e);
   await this.refreshCounts();
   this.updatePanel();
   return true;
  }catch(e){this.logError('importMemory',e.message);return false;}
 },
 clearMemory:async function(){
  if(!confirm('Tem certeza que deseja apagar toda a memória do IndexedDB? Os arquivos TXT não serão apagados.'))return false;
  try{
   await this.clearStore('conversations');
   await this.clearStore('learnings');
   await this.clearStore('contexts');
   await this.clearStore('errors');
   await this.clearStore('meta');
   this.folderHandle=null;this.memoryDirHandle=null;
   await this.refreshCounts();
   this.updatePanel();
   return true;
  }catch(e){this.logError('clearMemory',e.message);return false;}
 },
 updatePanel:function(){
  const el=document.getElementById('memoryStats');
  if(!el)return;
  el.textContent=
   'Estado: '+(this.stats.ready?'pronta':'inicializando')+'\n'+
   'IndexedDB: '+(this.db?'conectado':'desconectado')+'\n'+
   'Arquivos TXT: '+(this.stats.lastSync?'sincronizados via backend':'pendente de sincronização')+'\n'+
   'Arquivos .txt: '+(this.noBackend||location.protocol==="file:"?"indisponível (sem servidor; usando só o navegador)":"servidor Node.js (memoria/)")+'\n'+
   'Conversas: '+this.stats.conversations+'\n'+
   'Aprendizados: '+this.stats.learnings+'\n'+
   'Contextos: '+this.stats.contexts+'\n'+
   'Erros de memória: '+this.stats.errors+'\n'+
   'Última gravação: '+(this.stats.lastSave||'nenhuma')+'\n'+
   'Última leitura: '+(this.stats.lastRead||'nenhuma')+'\n'+
   'Última sincronização: '+(this.stats.lastSync||'nenhuma')+'\n'+
   (this.stats.lastError?'Último erro: '+this.stats.lastError:'Sem erros recentes.');
 }
};