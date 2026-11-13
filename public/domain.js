/* ES5: shared rules for CSV server and SharePoint client. */
(function (root) {
 'use strict';
 var D = {}, KEY = 'gs-simple-2026';
 D.copy = function (x) { return JSON.parse(JSON.stringify(x)); };
 D.enc = function (s) { var out = 's1:', i, n; s = String(s || ''); for (i=0;i<s.length;i++) { n=(s.charCodeAt(i)^KEY.charCodeAt(i%KEY.length)).toString(16); out+=('0000'+n).slice(-4); } return out; };
 D.dec = function (s) { var out='',i; if (!s) { return ''; } if (!/^s1:([0-9a-f]{4})*$/.test(s)) { throw new Error('保存データの形式が正しくありません'); } for(i=3;i<s.length;i+=4) { out+=String.fromCharCode(parseInt(s.substr(i,4),16)^KEY.charCodeAt(((i-3)/4)%KEY.length)); } return out; };
 D.count = function (s) { return String(s).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g,'x').length; };
 D.user = function (db,id) { var i; for(i=0;i<db.users.length;i++) { if(db.users[i].id===id) { return db.users[i]; } } return null; };
 D.role = function (u,r) { return u && u.active && u.roles.indexOf(r)>=0; };
 D.date = function (date,time) { var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date), t=/^(\d{2}):(\d{2})$/.exec(time), d; if(!m||!t) { throw new Error('日付・時刻を確認してください'); } d=new Date(+m[1],+m[2]-1,+m[3]); if(d.getFullYear()!==+m[1]||d.getMonth()!==+m[2]-1||d.getDate()!==+m[3]||+t[1]>24||+t[2]>59||(+t[1]===24&&+t[2]!==0)) { throw new Error('日付・時刻を確認してください'); } d.setHours(+t[1],+t[2],0,0); return d.getTime(); };
 D.next = function (r) { var i; for(i=0;i<r.approvals.length;i++) { if(!r.approvals[i].at) { return r.approvals[i].id; } } return ''; };
 D.label = {pending:'承認待ち',approved:'承認済み',issued:'交付済み',returned:'返納済み',cancelled:'取消'};
 D.cleanUser = function(u) { var x=D.copy(u); delete x.password; return x; };
 D.view = function(db) { var x=D.copy(db); x.users=x.users.map(D.cleanUser); return x; };
 function requireIt(ok,msg) { if(!ok) { throw new Error(msg); } }
 function uid(prefix) { return prefix+Date.now().toString(36)+Math.random().toString(36).slice(2,9); }
 D.apply = function(db, actorId, action, input, spName) {
  var actor=D.user(db,actorId), now=new Date().toISOString(), r=null, before=null, target, i, route, old, event, result;
  requireIt(actor && actor.active,'ログインし直してください');
  if(action==='user') {
   requireIt(actor.admin,'利用者設定は管理者のみ操作できます');
   requireIt(/^[A-Za-z0-9_-]{1,40}$/.test(input.id),'利用者IDは英数字・ハイフン・下線で入力してください');
   old=D.user(db,input.id); before=old?D.cleanUser(old):null;
   requireIt(input.name && input.unit && input.roles && input.roles.length,'氏名・部隊・区分が必要です');
   input.roles.forEach(function(v){ requireIt(['申請者','承認者','当直'].indexOf(v)>=0,'区分が不正です'); });
   requireIt(old || input.password,'新規登録にはパスワードが必要です');
   route=input.route||[];
   requireIt(route.filter(function(v,j){return route.indexOf(v)!==j;}).length===0,'承認者が重複しています');
   route.forEach(function(id){requireIt(id!==input.id && D.role(D.user(db,id),'承認者'),'承認経路に有効な承認者を指定してください');});
   if(input.passNo) { db.users.forEach(function(u){requireIt(u.id===input.id || !u.active || u.passNo!==input.passNo,'外出証番号は利用中の番号と重複しています');}); }
   target={id:input.id,name:String(input.name),unit:String(input.unit),rank:String(input.rank||''),passNo:String(input.passNo||''),email:String(input.email||''),account:String(input.account||''),roles:input.roles,admin:!!input.admin,active:input.active!==false,route:route,password:input.password?D.enc(input.password):old.password};
   requireIt(!(actor.id===target.id && (!target.active || !target.admin)),'操作中の管理者自身は無効化・管理権限解除できません');
   if(old) { db.users[db.users.indexOf(old)]=target; } else { db.users.push(target); }
   result=D.cleanUser(target);
  } else {
   if(input.id) { for(i=0;i<db.requests.length;i++) { if(db.requests[i].id===input.id) {r=db.requests[i];break;} } requireIt(r,'申請が見つかりません'); before=D.copy(r); requireIt(input.version===r.version,'他の人が更新しました。再読み込みして操作してください'); }
   if(action==='submit' || action==='edit') {
    requireIt(action==='edit' || D.role(actor,'申請者'),'申請者としてログインしてください');
    requireIt(action!=='edit' || (r && ['pending','approved'].indexOf(r.status)>=0),'交付後・取消後の申請は編集できません');
    target=D.user(db,input.applicantId);
    requireIt(D.role(target,'申請者'),'有効な申請者を選択してください');
    requireIt(target.passNo,'申請者の外出証番号が未登録です');
    requireIt(['普通外出','週末外出'].indexOf(input.kind)>=0,'外出区分を選択してください');
    requireIt(input.destination && D.count(input.destination)<=20 && !/[\r\n]/.test(input.destination),'外出先は改行なしの1～20文字です');
    requireIt(input.purpose,'用件を入力してください');
    requireIt(D.date(input.endDate,input.endTime)>D.date(input.startDate,input.startTime),'終了は開始より後にしてください');
    requireIt(typeof input.drink==='boolean' && typeof input.drive==='boolean','飲酒・車両運転の有無を選択してください');
    route=(target.route||[]).map(function(id){var u=D.user(db,id);requireIt(D.role(u,'承認者'),'承認経路に無効な利用者がいます'); return {id:id,name:u.name,rank:u.rank,at:null};});
    requireIt(route.length,'申請者の承認経路が未設定です');
    db.requests.forEach(function(q){if(q.id!==input.id && q.applicantId===target.id && q.status!=='cancelled') {requireIt(D.date(input.endDate,input.endTime)<=D.date(q.startDate,q.startTime)||D.date(input.startDate,input.startTime)>=D.date(q.endDate,q.endTime),'同じ申請者の外出期間が重複しています');}});
    if(!r) {r={id:uid('R'),version:0,createdAt:now,history:[],notifications:[]};db.requests.push(r);}
    if(before) {r.history.push({at:now,actor:actor.name,approvals:D.copy(r.approvals),status:r.status}); r.notifications.forEach(function(n){if(n.state==='pending'||n.state==='failed'){n.state='obsolete';}});}
    ['startDate','startTime','endDate','endTime','kind','purpose','drink','drive','note'].forEach(function(k){r[k]=input[k]===undefined?'':input[k];});
    r.applicantId=target.id;r.name=target.name;r.unit=target.unit;r.rank=target.rank;r.passNo=target.passNo;
    r.destination=D.enc(input.destination);r.plan=D.enc(input.plan||'');r.approvals=route;r.status='pending';r.submittedAt=now;r.submittedBy=actor.name;
    notify(route[0].id,'承認依頼');
   } else if(action==='approve') {
    requireIt(r && r.status==='pending' && D.role(actor,'承認者') && D.next(r)===actor.id,'現在の承認者本人だけが承認できます');
    r.approvals.forEach(function(a){if(a.id===actor.id && !a.at){a.at=now;a.name=actor.name;a.account=spName||'';}});
    target=D.next(r);if(!target){r.status='approved';notify(r.applicantId,'承認完了');}else{notify(target,'承認依頼');}
   } else if(action==='issue' || action==='return') {
    requireIt(D.role(actor,'当直'),'当直としてログインしてください');
    requireIt(r && r.status===(action==='issue'?'approved':'issued'),'交付・返納できる状態ではありません');
    requireIt(input.drinkChecked===true && input.driveChecked===true,'飲酒と車両運転の確認チェックが必要です');
    if(action==='issue') { requireIt(!db.requests.some(function(q){return q.id!==r.id && q.passNo===r.passNo && q.status==='issued';}),'同じ外出証が交付中です'); }
    event={at:now,by:actor.name,account:spName||'',drinkChecked:true,driveChecked:true};
    r[action==='issue'?'issue':'return']=event;r.status=action==='issue'?'issued':'returned';
   } else if(action==='cancel') { requireIt(r && ['pending','approved'].indexOf(r.status)>=0,'交付前の申請のみ取消できます');r.status='cancelled';r.notifications.forEach(function(n){if(n.state==='pending'||n.state==='failed'){n.state='obsolete';}});
   } else {throw new Error('不明な操作です');}
   r.version++;r.updatedAt=now;result=r;
  }
  db.audit.push({id:uid('L'),at:now,actorId:actor.id,actor:actor.name,account:spName||'',action:action,target:result.id,before:before,after:D.copy(result)});
  return result;
  function notify(id,subject) { var u=D.user(db,id); r.notifications.push({id:uid('N'),toId:id,to:u.email||'',subject:subject,at:now,state:'pending'}); }
 };
 if(typeof module!=='undefined' && module.exports) {module.exports=D;}else{root.GS=D;}
}(this));
