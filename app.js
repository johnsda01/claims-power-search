const $ = id => document.getElementById(id);
let token='', files=[], selected=new Set(), topics=new Set(), topicCatalog=[], common=[], water=[], results=[], busy=false, current=null;
const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notice(message=''){ $('notice').hidden=!message; $('notice').textContent=message; }
async function api(path, data){const response=await fetch(path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-App-Token':token},body:JSON.stringify(data)});const value=await response.json();if(!response.ok)throw new Error(value.error||'Request failed.');return value;}
let settingsSave=Promise.resolve();
function savePreference(key,value){settingsSave=settingsSave.catch(()=>{}).then(()=>api('/api/settings',{[key]:value})).catch(error=>notice('Could not save preferences: '+error.message));}
function resetResults(){results=[];$('resultsTitle').textContent='Your results will appear here';$('resultMeta').textContent='';$('searchWarning').textContent='';$('results').innerHTML='<div class="empty"><div class="empty-icon">⌕</div><h3>Search your selected documents</h3><p>Type a phrase or check a topic to find source language.</p></div>';}
function updateSelection(){const n=files.filter(f=>selected.has(f.id)).length;$('selectedCount').textContent=`${n} selected`;$('selectAll').checked=n>0&&n===files.length;$('selectAll').indeterminate=n>0&&n<files.length;$('process').disabled=busy||!n;$('search').disabled=busy||!n;}
function renderFiles(data,preserve=false){const old=selected;files=data.files;selected=preserve?new Set(files.filter(f=>old.has(f.id)).map(f=>f.id)):new Set(files.map(f=>f.id));$('folder').value=data.folder;$('output').textContent=data.output;$('fileCount').textContent=`${files.length} supported files`;$('fileList').replaceChildren();for(const f of files){if(f.status==='Review OCR')f.status='OCR used';const row=document.createElement('label');row.className='file-row';row.innerHTML=`<input type="checkbox" ${selected.has(f.id)?'checked':''} aria-label="Select ${esc(f.name)}"><span class="file-type">${esc(f.name.split('.').pop().toUpperCase())}</span><span class="file-info"><div class="file-name" title="${esc(f.name)}">${esc(f.name)}</div><div class="file-detail">${f.size<1048576?Math.ceil(f.size/1024)+' KB':(f.size/1048576).toFixed(1)+' MB'}${f.pages?' · '+f.pages+' '+(f.name.toLowerCase().endsWith('.pdf')?'pages':'text section'):''}</div></span><span title="${f.status==='OCR used'?'Scanned pages were converted to searchable text. This is not an error or a required review step. Check wording against the original before copying.':esc(f.status)}" class="badge ${f.status==='Ready'?'ready':f.status==='OCR used'?'ocr':f.status==='Some pages need OCR'?'review':''}">${esc(f.status)}</span>`;row.querySelector('input').addEventListener('change',e=>{e.target.checked?selected.add(f.id):selected.delete(f.id);updateSelection();resetResults();});$('fileList').append(row);}if(!files.length)$('fileList').innerHTML='<div class="empty">No PDF, Word (.docx), or text files in this folder.</div>';updateSelection();}
function renderTopics(){for(const [target,ids] of [['commonTopics',common],['waterTopics',water]]){$(target).replaceChildren();for(const id of ids){const item=topicCatalog.find(t=>t[0]===id);const label=document.createElement('label');label.className='topic';label.title='Looks for: '+item[2].join(', ');const input=document.createElement('input');input.type='checkbox';input.checked=topics.has(id);input.addEventListener('change',()=>{input.checked?topics.add(id):topics.delete(id);renderTopics();});label.append(input,document.createTextNode(item[1]));$(target).append(label);}}}
function setBusy(value){busy=value;for(const id of ['loadFolder','browse','folder','ocr','selectAll'])$(id).disabled=value;document.querySelectorAll('.file-row input').forEach(el=>el.disabled=value);$('stop').hidden=!value;$('progress').hidden=!value;updateSelection();}
async function statusPoll(){try{const state=await api('/api/status');setBusy(state.running);$('status').textContent=state.message;$('progress').max=Math.max(state.total,1);$('progress').value=state.done;const issues=[...state.errors,...state.warnings.map(note=>note.replace('OCR or page review needed.','OCR used. Check wording you copy against the original.'))];$('issues').innerHTML=issues.length?`<details ${state.errors.length?'open':''}><summary>${state.errors.length} error(s) · ${state.warnings.length} processing note(s)</summary>${issues.map(e=>'<p>'+esc(e)+'</p>').join('')}</details>`:'';if(state.running)setTimeout(statusPoll,800);else{const data=await api('/api/init');renderFiles(data,true);$('status').textContent=`${state.message} ${state.done} of ${state.total} file(s) checked.`;}}catch(e){notice(e.message);setBusy(false);}}
function normalizePreview(text){
  let value='';const starts=[],ends=[];
  for(let i=0;i<text.length;){
    const join=text.slice(i).match(/^[-\u00ad]\s*\n\s*(?=[\p{L}\p{N}_])/u);
    if(join&&i>0&&/[\p{L}\p{N}_]/u.test(text[i-1])){i+=join[0].length;continue;}
    const raw=String.fromCodePoint(text.codePointAt(i)),end=i+raw.length;
    for(const c of raw.normalize('NFKC').toLowerCase()){
      if(/\s/u.test(c)){
        if(value.endsWith(' ')){ends[ends.length-1]=end;continue;}
        value+=' ';starts.push(i);ends.push(end);
      }else{value+=c;for(let j=0;j<c.length;j++){starts.push(i);ends.push(end);}}
    }
    i=end;
  }
  return {value,starts,ends};
}
function previewMatches(text,terms){
  const mapped=normalizePreview(text),ranges=[];
  for(const raw of new Set(terms||[])){
    const term=normalizePreview(raw||'').value.trim();if(!term)continue;
    let pos=0;
    while((pos=mapped.value.indexOf(term,pos))!==-1){ranges.push([mapped.starts[pos],mapped.ends[pos+term.length-1]]);pos+=term.length;}
  }
  ranges.sort((a,b)=>a[0]-b[0]||b[1]-a[1]);
  const merged=[];
  for(const range of ranges){const last=merged[merged.length-1];if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);else merged.push(range.slice());}
  return merged;
}
function highlight(text,terms){
  let output='',end=0;
  for(const [start,stop] of previewMatches(text,terms)){output+=esc(text.slice(end,start))+'<mark>'+esc(text.slice(start,stop))+'</mark>';end=stop;}
  return output+esc(text.slice(end));
}
function excerpt(result){
  const text=result.text,match=previewMatches(text,result.terms)[0],pos=match?match[0]:0;
  let start=Math.max(0,pos-75),end=Math.min(text.length,start+480);
  if(start>0){while(start<pos&&/\S/.test(text[start-1]))start++;}
  if(end<text.length){while(end>pos+1&&/\S/.test(text[end]))end--;}
  return (start?'… ':'')+text.slice(start,end).trim()+(end<text.length?' …':'');
}
function policyClauses(text){
  const nodes=[],stack=[];let offset=0;
  for(const line of text.split('\n')){
    const value=line.trim(),marker=value.match(/^(?:([A-Z])\.|(\d+)\.|([a-z])\.|\((\d+)\)|\(([a-z])\))\s+/);
    const heading=(value===value.toUpperCase()&&/^(?:SECTION\s+[IVX\d]+\b|(?:GENERAL\s+)?EXCLUSIONS\b|PERILS INSURED AGAINST\b|(?:PROPERTY |LIABILITY )?COVERAGES$|CONDITIONS$|DEFINITIONS$|AGREEMENT$)/.test(value))||/^The following (?:Exclusions|coverages|conditions) (?:are|is) added/i.test(value)||/^(?:Paragraph|Item|Under)\s.+(?:replaced|following|Coverage|Section)/.test(value);
    if(marker||heading){
      const depth=heading?(/^SECTION\s/.test(value)?-2:-1):marker[1]?0:marker[2]?1:marker[3]?2:marker[4]?3:4;
      while(stack.length&&stack[stack.length-1].depth>=depth)stack.pop();
      nodes.push({start:offset,depth,parent:stack.length?stack[stack.length-1]:null,label:value});
      stack.push(nodes[nodes.length-1]);
    }
    offset+=line.length+1;
  }
  nodes.forEach((node,i)=>{node.end=i+1<nodes.length?nodes[i+1].start:text.length;});
  return nodes;
}
function focusedExcerpt(result,chosen=null){
  const previous=(result.contextPages||[]).filter(page=>page.page<result.page);
  const spans=[];let documentText='';
  for(const page of [...previous,{page:result.page,text:result.text}]){if(documentText)documentText+='\n\n';spans.push({page:page.page,start:documentText.length,end:documentText.length+page.text.length});documentText+=page.text;}
  const offset=spans[spans.length-1].start;
  const nodes=policyClauses(documentText),matches=previewMatches(result.text,result.terms).map(([start,end])=>[start+offset,end+offset]);
  let options=nodes.filter(node=>node.start>=offset&&matches.some(([start,end])=>start<node.end&&end>node.start));
  options.sort((a,b)=>b.depth-a.depth||a.start-b.start);
  if(!options.length)return {text:excerpt(result),options:[],selected:null,pageSegments:{[result.page]:excerpt(result).split('\n')},pages:[result.page]};
  const selected=options.find(node=>node.start===chosen)||options[0],chain=[];
  for(let node=selected;node;node=node.parent)chain.unshift(node);
  let last=0,lastPage=null;const chunks=[],pageSegments={};
  for(const node of chain){
    const span=spans.find(span=>node.start>=span.start&&node.start<=span.end);
    const page=span?span.page:result.page;
    const raw=documentText.slice(node.start,Math.min(node.end,span?span.end:node.end)),lines=raw.trimEnd().split('\n');
    let count=lines.length;
    const boundary=lines.findIndex(line=>/[;:](?:\s+(?:or|and))?\s*$/i.test(line.trim()));
    if(boundary>=0)count=boundary+1;
    let part=lines.slice(0,count).join('\n').trim();
    if(node.depth<0)part=node.label;
    else if(node!==selected&&count===lines.length&&part.length>350){part=lines.slice(0,Math.min(3,lines.length)).join('\n').trim()+'\n…';}
    if(part.length>650)part=part.slice(0,650).replace(/\s+\S*$/,'')+'\n…';
    if(page!==lastPage&&page!==result.page)chunks.push(`[Context from PDF page ${page}]`);
    if(page!==lastPage&&page===result.page&&lastPage!==null&&lastPage!==result.page)chunks.push(`[PDF page ${page}]`);
    if(node.start>last&&chunks.length&&chunks[chunks.length-1]!=='…')chunks.push('…');
    chunks.push(part);last=node.start+lines.slice(0,count).join('\n').length;
    (pageSegments[page]||=[]).push(...part.split('\n'),'…');lastPage=page;
  }
  if(last<documentText.trimEnd().length)chunks.push('…');
  return {text:chunks.join('\n'),options,selected:selected.start,pageSegments,pages:Object.keys(pageSegments).map(Number)};
}
function copyText(result,text){return `${result.source} | ${result.pdf?'PDF page '+result.page:'Document text'}\n\n${text}`;}
async function copySnippet(result,text,button){
  const label=button.textContent;
  try{await navigator.clipboard.writeText(copyText(result,text));button.textContent='Copied';setTimeout(()=>button.textContent=label,1500);}
  catch(error){notice('Copy unavailable. Open Compare & copy, then select and copy the excerpt text.');}
}
let previewMode='excerpt',focusedChoice=null,originalPreviewPage=null;
let highlightRequest=0;
async function updateOriginalHighlight(focus){
  const request=++highlightRequest;
  $('pageHighlights').replaceChildren();
  if(!current.pdf||!$('highlightOriginal').checked){$('originalHighlightStatus').textContent='Highlights off';return;}
  $('originalHighlightStatus').textContent='Finding text on the original page…';
  const segments=previewMode==='full'?current.terms:(focus.pageSegments?.[originalPreviewPage]||[]).map(s=>s.trim()).filter(Boolean);
  try{
    const data=await api('/api/highlights',{id:current.id,page:originalPreviewPage,segments,terms:current.terms,focused:previewMode!=='full'});
    if(request!==highlightRequest)return;
    for(const box of data.boxes){const rect=document.createElement('span');rect.className='page-highlight';rect.style.left=box.x*100+'%';rect.style.top=box.y*100+'%';rect.style.width=box.w*100+'%';rect.style.height=box.h*100+'%';$('pageHighlights').append(rect);}
    $('originalHighlightStatus').textContent=data.boxes.length?(data.matched<data.requested?'Some matching words located; check the original.':'Matching words highlighted within the selected text'):originalPreviewPage!==current.page?'Parent context page. The matching clause is on page '+current.page+'.':'Could not locate the matching words reliably on the original.';
  }catch(error){if(request===highlightRequest)$('originalHighlightStatus').textContent='Highlights unavailable for this page. The original is still shown.';}
}
function renderComparison(){
  const focus=focusedExcerpt(current,focusedChoice),full=previewMode==='full';
  focusedChoice=focus.selected;
  $('pageText').innerHTML=highlight(full?current.text:focus.text,current.terms);
  $('excerptTab').setAttribute('aria-pressed',String(!full));$('fullTextTab').setAttribute('aria-pressed',String(full));
  $('excerptNote').textContent=full?'Complete extracted page text. Compare exact wording with the original.':'Selected source lines. … marks omitted wording; other limits and exceptions may appear elsewhere on the page.';
  $('clausePicker').replaceChildren();
  for(const node of focus.options){const option=document.createElement('option');option.value=String(node.start);option.textContent=node.label.slice(0,110);option.selected=node.start===focus.selected;$('clausePicker').append(option);}
  $('clauseChoice').hidden=full||focus.options.length<2;
  $('copyPage').textContent=full?'Copy full page text':'Copy excerpt';
  const pages=full?[current.page]:[...new Set([...focus.pages,current.page])].sort((a,b)=>a-b);
  if(!pages.includes(originalPreviewPage))originalPreviewPage=current.page;
  $('originalPageSelect').replaceChildren();
  for(const page of pages){const option=document.createElement('option');option.value=String(page);option.textContent='PDF page '+page+(page===current.page?' · matching clause':' · parent context');option.selected=page===originalPreviewPage;$('originalPageSelect').append(option);}
  $('originalPageChoice').hidden=!current.pdf||pages.length<2;
  if(current.pdf){$('pdfImage').src='/page/'+current.id+'?page='+originalPreviewPage;$('originalLink').href=current.sourceUrl+'#page='+originalPreviewPage;}
  updateOriginalHighlight(focus);
}
function openResult(result){current=result;previewMode='excerpt';focusedChoice=null;originalPreviewPage=result.page;$('previewTitle').textContent=result.source;$('previewMeta').textContent=(result.pdf?'PDF page '+result.page:'Document text; original page numbers unavailable')+' · '+result.method;$('originalLink').href=result.sourceUrl+(result.pdf?'#page='+result.page:'');$('textLink').href=result.textUrl;$('originalPage').hidden=!result.pdf;renderComparison();$('preview').showModal();}
function renderResults(data){results=data.results;for(const result of results)result.contextPages=data.context?.[result.id]||[];$('resultsTitle').textContent=data.total?`${data.total} matching page${data.total===1?'':'s'}`:'No matching language found';$('resultMeta').textContent=`${selected.size} selected file(s)${data.total>300?' · Showing first 300':''}`;$('searchWarning').textContent=data.skipped.length?'These files need processing before they can be searched: '+data.skipped.join('; '):'';$('results').replaceChildren();for(const r of results){const focus=focusedExcerpt(r);const card=document.createElement('article');card.className='result';card.innerHTML=`<div class="result-top"><div><h3>${esc(r.source)}</h3><div class="result-meta">${r.pdf?'PDF page '+r.page:'Document text (no page mapping)'} · ${esc(r.method)}</div></div><button class="secondary view-result">Compare & copy</button></div><div class="excerpt-label">Focused excerpt · … marks omitted wording</div><blockquote class="focused-quote">${highlight(focus.text,r.terms)}</blockquote><div class="result-bottom"><div class="tags">${esc(r.topics.join(' · '))}</div><div class="snippet-actions"><button class="secondary copy-snippet">Copy excerpt</button><a href="${r.sourceUrl}${r.pdf?'#page='+r.page:''}" target="_blank" rel="noopener">Open original ↗</a></div></div>`;card.querySelector('.view-result').addEventListener('click',()=>openResult(r));card.querySelector('.copy-snippet').addEventListener('click',event=>copySnippet(r,focus.text,event.currentTarget));$('results').append(card);}if(!results.length)$('results').innerHTML='<div class="empty"><h3>Try another term or a broader topic</h3><p>Check that the selected files are processed. Unchecked topics do not restrict the search.<br>Some provisions use terms such as “power failure” instead of “food loss.”</p></div>';}
async function loadFolder(path,browse=false){notice();const data=await api(browse?'/api/browse':'/api/folder',browse?{}:{folder:path});renderFiles(data);resetResults();$('status').textContent='Folder loaded. Ready text copies can be searched now.';$('issues').textContent='';}
$('browse').addEventListener('click',async()=>{try{$('browse').disabled=true;await loadFolder('',true);}catch(e){notice(e.message);}finally{$('browse').disabled=busy;}});
$('loadFolder').addEventListener('click',()=>loadFolder($('folder').value).catch(e=>notice(e.message)));
$('folder').addEventListener('keydown',e=>{if(e.key==='Enter')loadFolder(e.target.value).catch(e=>notice(e.message));});
$('selectAll').addEventListener('change',e=>{selected=e.target.checked?new Set(files.map(f=>f.id)):new Set();for(const input of document.querySelectorAll('.file-row input'))input.checked=e.target.checked;updateSelection();resetResults();});
$('process').addEventListener('click',async()=>{notice();try{await api('/api/process',{ids:[...selected],ocr:$('ocr').checked});resetResults();setBusy(true);statusPoll();}catch(e){notice(e.message);}});
$('stop').addEventListener('click',async()=>{try{await api('/api/stop',{});$('status').textContent='Stopping after the current file…';}catch(e){notice(e.message);}});
$('searchForm').addEventListener('submit',async e=>{e.preventDefault();notice();$('search').disabled=true;try{const data=await api('/api/search',{ids:[...selected],query:$('query').value,topics:[...topics],mode:$('mode').value});renderResults(data);$('resultsSection').scrollIntoView({behavior:'smooth',block:'start'});}catch(e){notice(e.message);}finally{updateSelection();}});
$('clearTopics').addEventListener('click',()=>{topics.clear();renderTopics();});
$('commonAll').addEventListener('click',()=>{common.forEach(id=>topics.add(id));renderTopics();});
$('waterAll').addEventListener('click',()=>{water.forEach(id=>topics.add(id));renderTopics();});
$('closePreview').addEventListener('click',()=>$('preview').close());
$('preview').addEventListener('close',()=>{highlightRequest++;$('pdfImage').removeAttribute('src');$('pageHighlights').replaceChildren();});
$('copyPage').addEventListener('click',event=>copySnippet(current,previewMode==='full'?current.text:focusedExcerpt(current,focusedChoice).text,event.currentTarget));
$('excerptTab').addEventListener('click',()=>{previewMode='excerpt';renderComparison();});
$('fullTextTab').addEventListener('click',()=>{previewMode='full';renderComparison();});
$('clausePicker').addEventListener('change',event=>{focusedChoice=Number(event.target.value);renderComparison();});
$('highlightOriginal').addEventListener('change',()=>{savePreference('highlightOriginal',$('highlightOriginal').checked);if(current)updateOriginalHighlight(focusedExcerpt(current,focusedChoice));});
$('ocr').addEventListener('change',()=>savePreference('ocr',$('ocr').checked));
$('mode').addEventListener('change',()=>savePreference('searchMode',$('mode').value));
$('originalPageSelect').addEventListener('change',event=>{originalPreviewPage=Number(event.target.value);$('pdfImage').src='/page/'+current.id+'?page='+originalPreviewPage;$('originalLink').href=current.sourceUrl+'#page='+originalPreviewPage;updateOriginalHighlight(focusedExcerpt(current,focusedChoice));});
(async()=>{try{const data=await api('/api/init');token=data.token;topicCatalog=data.topics;common=data.common;water=data.water;$('appVersion').textContent='v'+data.version;$('appVersion').title='Preferences saved locally in '+data.settingsPath;$('ocr').checked=data.settings.ocr;$('highlightOriginal').checked=data.settings.highlightOriginal;$('mode').value=data.settings.searchMode;renderFiles(data);renderTopics();if(data.settingsWarning)notice(data.settingsWarning);const job=await api('/api/status');if(job.running)statusPoll();}catch(e){notice(e.message);}})();
