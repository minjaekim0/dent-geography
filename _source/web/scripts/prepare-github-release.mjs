// Stage only public assets and explicitly selected source; never copy env files or the parent workspace.
import {cpSync,existsSync,mkdirSync,readFileSync,readdirSync,statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const target=resolve(process.argv[2]||'');
if(!process.argv[2]||target===project)throw Error('Pass a separate GitHub checkout');
const remote=execFileSync('git',['remote','get-url','origin'],{cwd:target,encoding:'utf8'}).trim();
if(remote!=='https://github.com/minjaekim0/dent-geography.git')throw Error('Unexpected deployment repository');
execFileSync(process.execPath,[resolve(project,'scripts/build-kakao.mjs'),'--check'],{stdio:'inherit'});
if(existsSync(resolve(target,'.nojekyll')))throw Error('Archive exclusion requires the existing Jekyll Pages build');
const config=resolve(target,'_config.yml');
if(existsSync(config)&&readFileSync(config,'utf8')!==readFileSync(resolve(project,'github-pages-config.yml'),'utf8'))throw Error('Review existing Pages configuration before replacing');
const archive=resolve(target,'_source/web/legacy');mkdirSync(archive,{recursive:true});
const old=resolve(archive,'github-before-kakao.html');
if(!existsSync(old))cpSync(resolve(target,'index.html'),old,{errorOnExist:true,force:false});
for(const name of readdirSync(resolve(project,'dist'))){
  const path=resolve(project,'dist',name);
  if(statSync(path).isFile()&&!/\.(html|js|mjs|css)$/.test(name))throw Error(`Unexpected public asset ${name}`);
  if(statSync(path).isDirectory()&&name!=='data')throw Error(`Unexpected public directory ${name}`);
  cpSync(path,resolve(target,name),{recursive:true});
}
for(const name of ['legacy','scripts','tests','KAKAO.md','POPULATION.md','github-pages-config.yml'])cpSync(resolve(project,name),resolve(target,'_source/web',name),{recursive:true});
cpSync(resolve(project,'github-pages-config.yml'),config);
console.log('Prepared Kakao-only Pages assets with non-published source archive. Existing collector and its data are preserved.');
