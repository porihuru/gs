'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),Store=require('./store'),D=require('./public/domain');
const dir=process.env.GS_DATA_DIR||path.join(__dirname,'data'),store=Store.create(dir),sessions=new Map(),port=Number(process.env.PORT||8787);
function send(res,code,body){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
function mail(db){db.requests.forEach(r=>r.notifications.forEach(n=>{if(n.state==='pending'){n.state=n.to?'simulated':'failed';n.error=n.to?'':'メールアドレスが未登録です';n.sentAt=new Date().toISOString();n.body=r.name+' / '+r.kind+' / '+r.startDate+' '+r.startTime+' ～ '+r.endDate+' '+r.endTime+'\nhttp://localhost:'+port+'/#'+r.id;db.audit.push({id:crypto.randomUUID(),at:n.sentAt,actor:'通知処理',account:'CSV模擬送信',action:'mail',target:r.id,after:D.copy(n)});}}));}
function handler(req,res){
 const url=new URL(req.url,'http://localhost:'+port);
 if(!url.pathname.startsWith('/api/')){let rel=url.pathname==='/'?'index.html':url.pathname.slice(1);if(!/^[a-zA-Z0-9_.-]+$/.test(rel)){res.writeHead(404);return res.end();}let file=path.join(__dirname,'public',rel);if(!fs.existsSync(file)){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':({'html':'text/html','js':'application/javascript','css':'text/css'}[rel.split('.').pop()]||'text/plain')+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return fs.createReadStream(file).pipe(res);}
 let bytes=0,parts=[];req.on('data',b=>{bytes+=b.length;if(bytes>2e6){req.destroy();return;}parts.push(b);});req.on('end',()=>{try{
  if(req.method==='POST' && (req.headers['x-gs-request']!=='1'||(req.headers.origin&&!['http://localhost:'+port,'http://127.0.0.1:'+port].includes(req.headers.origin))))return send(res,403,{error:'許可されていないリクエストです'});
  let data=parts.length?JSON.parse(Buffer.concat(parts).toString('utf8')):{},db=store.load(),sid=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('gs_session=')),session=sid?sessions.get(sid.slice(11)):null;
  if(session && Date.now()-session.at>8*3600000){sessions.delete(sid.slice(11));session=null;}
  if(url.pathname==='/api/login'&&req.method==='POST'){let u=D.user(db,data.id);if(!u||!u.active||u.password!==D.enc(data.password)||!data.password)return send(res,401,{error:'利用者IDまたはパスワードが違います'});let token=crypto.randomBytes(32).toString('hex');sessions.set(token,{id:u.id,at:Date.now()});res.setHeader('Set-Cookie','gs_session='+token+'; HttpOnly; SameSite=Strict; Path=/');return send(res,200,{user:D.cleanUser(u),account:'テスト：'+u.name});}
  if(!session||!D.user(db,session.id)||!D.user(db,session.id).active)return send(res,401,{error:'ログインしてください'});
  if(url.pathname==='/api/logout'&&req.method==='POST'){sessions.delete(sid.slice(11));res.setHeader('Set-Cookie','gs_session=; Max-Age=0; Path=/');return send(res,200,{});}
  if(url.pathname==='/api/state'&&req.method==='GET')return send(res,200,{db:D.view(db),user:D.cleanUser(D.user(db,session.id)),account:'テスト：'+D.user(db,session.id).name});
  if(url.pathname==='/api/action'&&req.method==='POST'){let r=D.apply(db,session.id,data.action,data.input,'テスト：'+D.user(db,session.id).name);mail(db);store.save(db);return send(res,200,{id:r.id});}
  send(res,404,{error:'不明なAPIです'});
 }catch(e){send(res,400,{error:e.message});}});
}
module.exports={handler};
if(require.main===module)http.createServer(handler).listen(port,'127.0.0.1',()=>console.log('GS_READY http://localhost:'+port));
