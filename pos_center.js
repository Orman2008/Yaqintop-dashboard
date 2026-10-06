'use strict';
(() => {
 const main=document.querySelector('main'),nav=document.querySelector('.control-nav');
 const panel=document.createElement('section');panel.className='panel control-panel';panel.dataset.page='pos';panel.hidden=true;
 panel.innerHTML='<h2>POS Integrations</h2><button id="posReload" class="action">Обновить</button><p id="posError" role="alert"></p><div id="posConnections"></div><div id="posDetails"></div>';
 main.append(panel);const link=document.createElement('button');link.type='button';link.dataset.pageButton='pos';link.textContent='POS Integrations';nav.append(link);
 const $=id=>document.getElementById(id),esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const run=fn=>async()=>{try{$('posError').textContent='';await fn();}catch(e){$('posError').textContent=e.message;}};
 function table(rows,columns){return '<div style="overflow:auto;max-width:100%"><table><thead><tr>'+columns.map(([label])=>'<th>'+esc(label)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+columns.map(([,key])=>'<td>'+esc(row[key])+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
 async function refresh(){const data=await api('/admin/pos/connections');$('posDetails').replaceChildren();$('posConnections').innerHTML=data.connections.length?table(data.connections,[['ID','id'],['Provider','provider'],['Магазин','shop_name'],['Филиал','branch_id'],['Status','status'],['Sync','last_sync_at'],['Processed','records_processed'],['Matched','matched'],['Unmatched','unmatched'],['Conflicts','conflicts'],['Rejected','records_rejected']]):'<p>POS подключения пока не созданы.</p>';
  data.connections.forEach(c=>{const button=document.createElement('button');button.className='action';button.style.margin='12px 12px 12px 0';button.textContent=c.provider+' · '+c.shop_name+' · Проблемы и mappings';button.onclick=run(async()=>{
   const [m,e,h]=await Promise.all(['mappings','errors','history'].map(kind=>api('/admin/pos/connections/'+Number(c.id)+'/'+kind)));
   $('posDetails').innerHTML='<h3>Product mappings</h3>'+table(m.items,[['External product','external_product_id'],['Variant','external_variant_id'],['Location','external_location_id'],['Status','status'],['Confidence','confidence'],['Global product','master_product_id']])+'<h3>Ошибки</h3>'+table(e.items,[['Run','run_id'],['Record','record_index'],['Code','code']])+'<h3>Sync history</h3>'+table(h.items,[['Run','id'],['Mode','mode'],['Status','status'],['Processed','records_processed'],['Rejected','records_rejected']]);
  });$('posConnections').append(button);});
 }
 window.YaqintopPos={refresh};link.onclick=run(()=>window.MapMarketControl.navigate('pos'));$('posReload').onclick=run(refresh);
 const clear=()=>{ $('posConnections').replaceChildren();$('posDetails').replaceChildren();$('posError').textContent='';};window.addEventListener('admin-logout',clear);for(const id of ['apiUrl','adminKey'])$(id).addEventListener('input',clear);
})();
