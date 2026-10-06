'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const files=['index.html','app.js','control_center.js','operations_center.js','compliance_center.js','pos_center.js','styles.css','control_center.css','runtime-config.js','theme-init.js','theme.css'];
const output=path.join(__dirname,'dist');fs.mkdirSync(output,{recursive:true});
const manifest={};
for(const name of files){const data=fs.readFileSync(path.join(__dirname,name));if(name.endsWith('.js'))new vm.Script(data.toString(),{filename:name});fs.writeFileSync(path.join(output,name),data);manifest[name]=crypto.createHash('sha256').update(data).digest('hex');}
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));console.log('Production build: '+files.length+' verified static assets in '+output);
