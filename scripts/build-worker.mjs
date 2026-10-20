import {readFile, mkdir, writeFile, copyFile} from 'node:fs/promises';
const assets={};
for(const [route,file,type] of [['/','index.html','text/html'],['/status','status.html','text/html'],['/style.css','style.css','text/css'],['/app.js','app.js','text/javascript'],['/status.js','status.js','text/javascript']]) assets[route]=[type,await readFile(new URL('../public/'+file,import.meta.url),'utf8')];
const handler=await readFile(new URL('../worker/handler.js',import.meta.url),'utf8');
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js',handler+'\nexport default createWorker('+JSON.stringify(assets)+');\n');
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Worker built: dist/server/index.js');
