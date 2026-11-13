'use strict';
const {test}=require('node:test'),fs=require('fs'),path=require('path'),vm=require('vm');
test('ブラウザ用JavaScriptはすべてES5構文',t=>{const source=process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'];if(!source){t.skip('Node内蔵構文解析器がないため手動確認が必要');return;}let box={};vm.runInNewContext(source,box);for(const f of fs.readdirSync(path.join(__dirname,'../public')).filter(f=>f.endsWith('.js'))){box.acorn.parse(fs.readFileSync(path.join(__dirname,'../public',f),'utf8'),{ecmaVersion:5});}});
