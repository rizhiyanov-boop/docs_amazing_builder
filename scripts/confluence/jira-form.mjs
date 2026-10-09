/** Display a project URL while retaining the original link for server verification. */
export function jiraProjectLink(value) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return value;
    const key = url.pathname.match(/^\/(?:projects|browse)\/([A-Z][A-Z0-9_]*)(?:-[1-9]\d*)?(?:\/.*)?$/)?.[1]
      ?? url.searchParams.get('projectKey')
      ?? url.searchParams.get('selectedIssue')?.match(/^([A-Z][A-Z0-9_]*)-[1-9]\d*$/)?.[1];
    return key && /^[A-Z][A-Z0-9_]{0,63}$/.test(key) ? `${url.origin}/projects/${key}` : value;
  } catch { return value; }
}

export function jiraForm(nonce, status) {
  const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return `<hr><h1>Подключение Jira</h1><p>Вставьте ссылку на проект, доску или любую задачу. Проект определяется через Jira и сохраняется с отдельным PAT на этом компьютере.</p>
<form id="jira-form"><label for="jira-link">Ссылка Jira</label><input id="jira-link" type="url" value="${escape(status.project?.url ?? '')}" placeholder="https://jira.example/browse/IN-123" required maxlength="2048" autocomplete="off">
<label for="jira-pat">Личный токен Jira (PAT)</label><input id="jira-pat" type="password" maxlength="4096" autocomplete="off" ${status.remembered ? 'placeholder="Оставьте пустым для сохранённого PAT"' : 'required'}>
<label><input id="jira-remember" type="checkbox" ${status.available ? 'checked' : 'disabled'}>Запомнить Jira и проект на этом компьютере</label><p class="note">PAT используется только для указанного Jira. Создание задач требует защищённого сохранения локального журнала операций в Windows.</p>
<button type="submit" id="jira-connect">Подключить Jira</button><button type="button" id="jira-forget">Забыть подключение Jira</button><p class="note">«Забыть подключение» удаляет также локальные привязки к задачам и журнал. Сначала проверьте операции с неизвестным результатом.</p></form><p id="jira-status" role="status">${escape(status.project ? `${status.connected ? 'Подключено' : 'Проект сохранён'}: ${status.project.name} · ${status.project.key}` : status.message || 'Jira ещё не подключена.')}</p>
<script nonce="${nonce}">const jiraForm=document.getElementById('jira-form'),jiraLink=document.getElementById('jira-link'),jiraPat=document.getElementById('jira-pat'),jiraRemember=document.getElementById('jira-remember'),jiraStatus=document.getElementById('jira-status'),jiraConnect=document.getElementById('jira-connect'),jiraForget=document.getElementById('jira-forget');
const jiraProjectLink=${jiraProjectLink.toString()};let jiraOriginalLink;
jiraLink.addEventListener('input',()=>{jiraOriginalLink=undefined;});
jiraLink.addEventListener('blur',()=>{if(jiraOriginalLink===undefined)jiraOriginalLink=jiraLink.value.trim();jiraLink.value=jiraProjectLink(jiraOriginalLink);});
async function jiraRequest(path,body){jiraConnect.disabled=jiraForget.disabled=true;jiraStatus.textContent='Проверяем Jira…';try{const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-DocBuilder-Local-Nonce':nonce},body:JSON.stringify(body),credentials:'omit',cache:'no-store'});const result=await response.json();if(response.ok){jiraOriginalLink=undefined;jiraPat.required=!result.remembered;jiraLink.value=result.project?result.project.url:'';jiraStatus.textContent=result.connected?'Подключено: '+result.project.name+' · '+result.project.key:'Подключение Jira удалено.';}else jiraStatus.textContent=result.message||'Не удалось подключить Jira.';}catch{jiraStatus.textContent='Локальный сервис недоступен.';}finally{jiraConnect.disabled=jiraForget.disabled=false;}}
jiraForm.addEventListener('submit',event=>{event.preventDefault();const token=jiraPat.value;jiraPat.value='';const link=jiraOriginalLink??jiraLink.value.trim();jiraRequest('/local/jira/session',{link,token,remember:jiraRemember.checked});});jiraForget.addEventListener('click',()=>{jiraPat.value='';jiraOriginalLink=undefined;jiraRequest('/local/jira/forget',{});});</script>`;
}
