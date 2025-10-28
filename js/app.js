const API_URL = 'api.php';
  const defaultPeople = ['Thiagão','Iuri','Bruninho','Brunão','Rafão','Tobias','Jones','Rogério'];
  const defaultClients = ['Interno','Apter','Eduzz','CPL','F5 Films'];
  let state = { version:0, people:[...defaultPeople], clients:[...defaultClients], tasks:[], nextWeekNotes:'' };
  let prefs = loadPrefs();

  // ===== Utils =====
  function loadPrefs(){
    try{ 
      return JSON.parse(localStorage.getItem('listoba_prefs')) || {compact:true, showSummary:true, summaryMode:'simple'}; 
    } catch(e){ 
      return {compact:true, showSummary:true, summaryMode:'simple'}; 
    }
  }
  function savePrefs(){ localStorage.setItem('listoba_prefs', JSON.stringify(prefs)); applyPrefs(); }
  function applyPrefs(){
    document.body.classList.toggle('compact', !!prefs.compact);
    document.getElementById('summary').style.display = prefs.showSummary ? '' : 'none';
    document.getElementById('summaryMode').value = prefs.summaryMode || 'simple';
    document.querySelector('#btnToggleCompact i').className = prefs.compact ? 'bi bi-arrows-collapse' : 'bi bi-arrows-expand';
  }
  const fmt = { date: (d)=> d ? new Date(d+'T00:00:00').toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}) : '—' };
  function isOverdue(t){ if((t.status==='done') || !t.dueDate) return false; const today = new Date(); today.setHours(0,0,0,0); const due = new Date(t.dueDate); due.setHours(0,0,0,0); return due < today; }
  function uid(){ return Math.random().toString(36).slice(2,10); }
  function todayStr(){ const d = new Date(); d.setHours(0,0,0,0); return d.toISOString().slice(0,10); }
  function addDays(dateStr, n){ const d = new Date(dateStr); d.setDate(d.getDate()+n); d.setHours(0,0,0,0); return d.toISOString().slice(0,10); }
  function clampStatus(s){ return (s==='standby'||s==='done')?s:'todo'; }

  // ===== API =====
  async function apiRead(){
    const res = await fetch(API_URL+'?action=read', {cache:'no-store'});
    if(!res.ok) throw new Error('HTTP '+res.status);
    return await res.json();
  }
  async function apiSave(extraHeaders={}){
    const payload = state;
    const res = await fetch(API_URL+'?action=save', {
      method:'POST',
      headers:{'Content-Type':'application/json','X-Client-Version': String(state.version||0), ...extraHeaders},
      body: JSON.stringify(payload)
    });
    if(res.status===409){
      const srv = await res.json().catch(()=>({}));
      alert('Conflito de versão: a base mudou em outro navegador. Atualizei a tela com a versão do servidor.');
      Object.assign(state, srv); renderAll(); renderSummary();
      return;
    }
    if(!res.ok){ const t = await res.text().catch(()=> ''); throw new Error('Falha ao salvar: '+res.status+' '+t); }
    try{ const srv = await res.json(); if(srv && typeof srv.version!=='undefined'){ state.version = srv.version; } }catch(_){}
    renderAll(); renderSummary();
  }

  // ===== Polling (V15) =====
  let pollTimer = null;
  function startPolling(){
    stopPolling();
    pollTimer = setInterval(async ()=>{
      try{
        const srv = await apiRead();
        if(typeof srv.version!=='undefined' && srv.version !== state.version){
          state = srv;
          renderAll(); renderSummary();
        }
      }catch(err){ console.warn('poll fail', err.message); }
    }, 4000);
  }
  function stopPolling(){ if(pollTimer){ clearInterval(pollTimer); pollTimer=null; } }

  // ===== Summary Whats =====
  function buildSummaryText(){
  const detailed = (prefs.summaryMode === 'detailed');
  const today = todayStr();
  const tomorrow = addDays(today, 1);

  // domingo como fim da semana atual
  const dToday = new Date(today + 'T00:00:00');
  const weekday = dToday.getDay(); // 0=Dom
  const daysToSunday = (7 - weekday) % 7;
  const endThisWeek = addDays(today, daysToSunday);

  // No "curto" NÃO inclui stand-by; no "detalhado" inclui e tagueia
  const open = state.tasks.filter(t=> {
    const s = clampStatus(t.status);
    if(s==='done') return false;
    return detailed ? true : (s!=='standby');
  });

  // ===== formatação pro WhatsApp =====
  function line(t){
    const type = t.type || '';
    const cli = t.client ? `[*${t.client}*` : '';
    const due = t.dueDate ? ` • ${fmt.date(t.dueDate)}]` : (cli ? `]` : '');
    const ass = t.assignee ? `_${t.assignee}_` : '';
    const co = (t.coAssignees||[]).length ? ` (${(t.coAssignees||[]).map(c=>`_${c}_`).join(', ')})` : '';
    const tag = clampStatus(t.status)==='standby' ? '[STAND-BY]' : '[A FAZER]';
    const titleBold = `*${t.title.trim()}*`;

    // Formato curto (sem standby, sem tag)
    if(!detailed){
      return `• ${type?type+' ':''}${titleBold} • ${ass}${co} ${cli}${due}`;
    }

    // Detalhado com tag, tipo e descrições
    const notes = t.notes && t.notes.trim()? `\n_(${t.notes.trim()})_` : '';
    const subs = (t.subtasks||[]).map(s=>`   - ${s.done?'[x]':'[ ]'} ${s.text}`).join('\n');
    const subsTxt = subs? `\n${subs}`: '';
    return `• ${tag} ${type?type+' ':''}${titleBold} • ${ass}${co} ${cli}${due}${notes}${subsTxt}`;
  }

  const byDueAsc = (a,b)=>{
    const da = a.dueDate || '9999-12-31';
    const db = b.dueDate || '9999-12-31';
    return da.localeCompare(db);
  };

  const blocoHojeAmanha = open
    .filter(t=> t.dueDate===today || t.dueDate===tomorrow)
    .sort(byDueAsc)
    .map(line).join('\n\n');

  const blocoEssaSemana = open
    .filter(t=> t.dueDate && t.dueDate>tomorrow && t.dueDate<=endThisWeek)
    .sort(byDueAsc)
    .map(line).join('\n\n');

  const blocoProximasSemanas = open
    .filter(t=> t.dueDate && t.dueDate>endThisWeek)
    .sort(byDueAsc)
    .map(line).join('\n\n');

  const notes = state.nextWeekNotes && state.nextWeekNotes.trim()
    ? `\n\n*OBSERVAÇÕES*\n${state.nextWeekNotes.trim()}`
    : '';

  const sections = [
    blocoHojeAmanha ? `*HOJE / AMANHÃ*\n${blocoHojeAmanha}` : '',
    blocoEssaSemana ? `*ESSA SEMANA*\n${blocoEssaSemana}` : '',
    blocoProximasSemanas ? `*PRÓXIMAS SEMANAS*\n${blocoProximasSemanas}` : '',
  ].filter(Boolean);

  return (sections.join('\n\n') || '*Sem itens pendentes*') + notes;
}
  function renderSummary(){
    const text = buildSummaryText();
    document.getElementById('summaryBody').innerHTML = `<div class="group"><pre>${escapeHtml(text)}</pre></div>`;
    document.getElementById('nextWeekNotes').value = state.nextWeekNotes || '';
  }

  // ===== Render =====
  function renderAll(){ renderAssigneeSelects(); renderClientSelects(); renderTypeSelect(); renderKanban(); renderReport(); }
  function renderAssigneeSelects(){
    document.getElementById('taskAssignee').innerHTML = state.people.map(p=>`<option value="${p}">${p}</option>`).join('');
    document.getElementById('taskCoAssignees').innerHTML = state.people.map(p=>`<option value="${p}">${p}</option>`).join('');
    document.getElementById('filterPerson').innerHTML = ['<option value="all">Todas pessoas</option>'].concat(state.people.map(p=>`<option value="${p}">${p}</option>`)).join('');
  }
  function renderClientSelects(){
    document.getElementById('taskClient').innerHTML = state.clients.map(c=>`<option value="${c}">${c}</option>`).join('');
    document.getElementById('filterClient').innerHTML = ['<option value="all">Todos clientes</option>'].concat(state.clients.map(c=>`<option value="${c}">${c}</option>`)).join('');
  }
  function renderTypeSelect(){
    const types = ['🎨 Criação','🔁 Refação','💰 Orçamento','✏️ Alteração','🎤 Apresentação','🧩 Outros'];
    document.getElementById('filterType').innerHTML = ['<option value="all">Todos tipos</option>'].concat(types.map(t=>`<option value="${t}">${t}</option>`)).join('');
  }

  // ===== Drag helper =====
  function setupDrag(el){
    el.addEventListener('dragstart', ev=>{ ev.dataTransfer.setData('text/plain', el.dataset.id); el.classList.add('dragging'); });
    el.addEventListener('dragend', ()=> el.classList.remove('dragging'));
  }

  // ===== Kanban =====
  function renderKanban(){
    const container = document.getElementById('columns');
    container.innerHTML = '';
    state.people.forEach(person=>{
      const col = document.createElement('div'); col.className = 'col-person'; col.dataset.person = person;
      col.innerHTML = `
        <div class="col-head">
          <h6 class="person-name" title="Duplo clique para renomear">${escapeHtml(person)}</h6>
          <div class="d-flex gap-1">
            <button class="btn btn-sm btn-outline-light btn-thin" title="Excluir coluna" data-action="remove-person" data-person="${escapeAttr(person)}"><i class="bi bi-x-lg"></i></button>
          </div>
        </div>
        <div class="section-wrap">
          <div class="small text-uppercase mb-1">A fazer</div>
          <div class="task-list dropzone" data-person="${person}" data-status="todo"></div>
        </div>
        <div class="section-wrap">
          <div class="small text-uppercase mb-1">Stand-by</div>
          <div class="task-list dropzone" data-person="${person}" data-status="standby"></div>
        </div>
        <div class="section-wrap done">
          <div class="small text-uppercase mb-1">Concluídas (máx 4)</div>
          <div class="task-list dropzone" data-person="${person}" data-status="done"></div>
        </div>`;
      container.appendChild(col);
    });

    // Inserir cartões (ordenados por dueDate asc)
    const dd = (d)=> d || '9999-12-31';
    const tasksSorted = [...state.tasks].sort((a,b)=> dd(a.dueDate).localeCompare(dd(b.dueDate)));
    tasksSorted.forEach(t=>{
      const targets = [t.assignee, ...(t.coAssignees||[])];
      targets.forEach((p, idx)=>{
        const list = document.querySelector(`.task-list[data-person="${cssEscape(p)}"][data-status="${clampStatus(t.status)}"]`);
        if(!list) return;
        const isReplica = idx>0;
        const isDoneList = (clampStatus(t.status)==='done');
        const card = renderCard(t, isReplica, isDoneList);
        list.appendChild(card);
      });
    });

    // Ordenar concluídas por completedAt e limitar a 4
    trimDoneLists();

    // Drag principal (apenas root-card)
    document.querySelectorAll('.task-card.draggable').forEach(setupDrag);
    document.querySelectorAll('.dropzone').forEach(zone=>{
      zone.addEventListener('dragover', ev=>{ ev.preventDefault(); zone.classList.add('dropzone-on'); });
      zone.addEventListener('dragleave', ()=> zone.classList.remove('dropzone-on'));
      zone.addEventListener('drop', ev=>{
        ev.preventDefault(); zone.classList.remove('dropzone-on');
        const id = ev.dataTransfer.getData('text/plain');
        const t = state.tasks.find(x=>x.id===id); if(!t) return;
        t.assignee = zone.dataset.person;
        const newStatus = zone.dataset.status;
        if(newStatus==='done' && clampStatus(t.status)!=='done'){ t.status='done'; t.completedAt = todayStr(); }
        else if(newStatus!=='done'){ t.status = newStatus; if(t.completedAt) delete t.completedAt; }
        apiSave().catch(err=> alert(err.message));
      });
    });

    container.addEventListener('click', (e)=>{
      const card = e.target.closest('.task-card');
      if(card){ openView(card.dataset.id); return; }
      const rm = e.target.closest('[data-action="remove-person"]');
      if(rm){ removePerson(rm.dataset.person); return; }
    });

    container.querySelectorAll('.person-name').forEach(el=>{
      el.addEventListener('dblclick', ()=>{
        const old = el.textContent; const name = prompt('Novo nome:', old);
        if(!name || !name.trim() || name===old) return;
        const idx = state.people.indexOf(old);
        if(idx>=0){ state.people[idx]=name.trim(); state.tasks.forEach(t=>{ if(t.assignee===old) t.assignee=name.trim(); t.coAssignees = (t.coAssignees||[]).map(c=> c===old? name.trim() : c); }); apiSave().catch(err=> alert(err.message)); }
      });
    });
  }

  function trimDoneLists(){
    document.querySelectorAll('.task-list[data-status="done"]').forEach(list=>{
      const cards = [...list.querySelectorAll('.task-card')];
      cards.sort((a,b)=> (b.getAttribute('data-completed')||'') < (a.getAttribute('data-completed')||'') ? -1 : 1).forEach(c=> list.appendChild(c));
      cards.forEach((c,i)=> c.style.display = i<4 ? '' : 'none');
    });
  }

  function renderCard(t, isReplica=false, isDoneList=false){
    const card = document.createElement('div'); 
    card.className = 'task-card'+(isReplica?' replica':'')+(isReplica?'':' root-card');
    if(!isReplica){ card.classList.add('draggable'); card.draggable = true; }
    card.dataset.id = t.id;
    if(t.completedAt) card.setAttribute('data-completed', t.completedAt);
    const title = t.title.length>28 ? t.title.slice(0,28)+'…' : t.title;

    if(isDoneList){
      card.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
          <div class="task-title ${clampStatus(t.status)==='done'?'text-decoration-line-through opacity-75':''}">${escapeHtml(title)}</div>
          ${isReplica? '<span class="badge-rep">co</span>' : ''}
        </div>
        <div class="task-meta mt-1">
          <span class="chip">Concluída${t.completedAt? ': '+fmt.date(t.completedAt):''}</span>
        </div>`;
      return card;
    }

    const chipClient = t.client ? `<span class='chip chip-client'>${escapeHtml(t.client)}</span>` : '';
    const dateClass = (isOverdue(t) && clampStatus(t.status)!=='done') ? 'text-danger' : 'text-secondary';
    const statusChip = clampStatus(t.status)==='standby' ? `<span class="chip">Stand-by</span>` : '';
    card.innerHTML = `
      <div class="d-flex justify-content-between align-items-center">
        <div class="task-title ${clampStatus(t.status)==='done'?'text-decoration-line-through opacity-75':''}">${escapeHtml(title)}</div>
        ${isReplica? '<span class="badge-rep">co</span>' : ''}
      </div>
      <div class="task-meta mt-1">
        ${chipClient}
        ${statusChip}
        <span class="${dateClass}"><i class="bi bi-calendar-week me-1"></i>${fmt.date(t.dueDate)}</span>
      </div>`;
    return card;
  }

  // ===== View modal =====
  function openView(id){
    const t = state.tasks.find(x=>x.id===id); if(!t) return;
    const subsHtml = (t.subtasks||[]).map((s,i)=> `
      <label class="d-flex align-items-center gap-2">
        <input class="form-check-input subview" type="checkbox" data-i="${i}" data-id="${t.id}" ${s.done? 'checked':''}>
        <span>${escapeHtml(s.text)}</span>
      </label>`).join('') || '<span class="text-secondary">—</span>';
    const co = (t.coAssignees||[]).join(', ') || '—';
    const status = clampStatus(t.status)==='done'? `Concluída ${t.completedAt? 'em '+fmt.date(t.completedAt):''}` : (isOverdue(t)? 'Atrasada' : (clampStatus(t.status)==='standby'?'Stand-by':'A fazer'));
    const html = `
      <div class="vstack gap-2">
        <div><strong>Título:</strong> ${escapeHtml(t.title)}</div>
        <div><strong>Status:</strong> ${escapeHtml(status)}</div>
        <div><strong>Responsável:</strong> ${escapeHtml(t.assignee||'—')}</div>
        <div><strong>Co-responsáveis:</strong> ${escapeHtml(co)}</div>
        <div><strong>Cliente:</strong> ${escapeHtml(t.client||'—')}</div>
        <div><strong>Tipo:</strong> ${escapeHtml(t.type||'—')}</div>
        <div><strong>Prazo:</strong> ${fmt.date(t.dueDate)}</div>
        <div><strong>Notas:</strong><br>${escapeHtml(t.notes||'—')}</div>
        <div><strong>Subtarefas (marque aqui):</strong><br>${subsHtml}</div>
      </div>`;
    document.getElementById('viewBody').innerHTML = html;
    document.getElementById('btnToggleDoneView').onclick = ()=>{ toggleDone(id, true); };
    document.getElementById('btnEditFromView').onclick = ()=>{ hideModal('#viewModal'); openEdit(id); };
    showModal('#viewModal');
  }

  document.addEventListener('change', (e)=>{
    const cb = e.target.closest('input.subview');
    if(cb){ const id = cb.getAttribute('data-id'); const i = +cb.getAttribute('data-i'); const t = state.tasks.find(x=>x.id===id); if(!t) return; t.subtasks = t.subtasks||[]; if(t.subtasks[i]){ t.subtasks[i].done = cb.checked; apiSave().catch(err=> alert(err.message)); } }
  });

  // ===== Report =====
  function renderReport(){
    const tbody = document.querySelector('#tblListoba tbody');
    const q = document.getElementById('search').value.toLowerCase();
    const filter = document.getElementById('filterStatus').value;
    const fPerson = document.getElementById('filterPerson').value;
    const fClient = document.getElementById('filterClient').value;
    const fType = document.getElementById('filterType').value;
    const fFrom = document.getElementById('filterFrom').value || '0000-01-01';
    const fTo = document.getElementById('filterTo').value || '9999-12-31';
    const sortDir = document.getElementById('sortDate').value;

    let tasks = [...state.tasks];

    tasks = tasks.filter(t=>{
      const hay = [t.title, t.assignee||'', (t.client||''), (t.coAssignees||[]).join(','), (t.type||''), clampStatus(t.status)].join(' ').toLowerCase();
      const inQ = hay.includes(q);
      const isOpen = clampStatus(t.status)!=='done';
      const inStatus = (filter==='all') || (filter==='todo' && clampStatus(t.status)==='todo') || (filter==='standby' && clampStatus(t.status)==='standby') || (filter==='overdue' && isOpen && isOverdue(t)) || (filter==='done' && clampStatus(t.status)==='done');
      const inPerson = (fPerson==='all') || t.assignee===fPerson || (t.coAssignees||[]).includes(fPerson);
      const inClient = (fClient==='all') || (t.client===fClient);
      const inType = (fType==='all') || (t.type===fType);
      const dateKey = clampStatus(t.status)==='done' ? (t.completedAt || '0000-01-01') : (t.dueDate || '9999-12-31');
      const inRange = dateKey >= fFrom && dateKey <= fTo;
      return inQ && inStatus && inPerson && inClient && inType && inRange;
    });

    tasks.sort((a,b)=>{
      const da = clampStatus(a.status)==='done' ? (a.completedAt || '0000-01-01') : (a.dueDate || '9999-12-31');
      const db = clampStatus(b.status)==='done' ? (b.completedAt || '0000-01-01') : (b.dueDate || '9999-12-31');
      if(sortDir==='asc') return da < db ? -1 : da > db ? 1 : 0;
      return da > db ? -1 : da < db ? 1 : 0;
    });

    tbody.innerHTML = tasks.map(t=>{
      const chipClient = t.client ? `<span class="chip chip-client">${escapeHtml(t.client)}</span>` : '<span class="text-secondary">—</span>';
      const co = (t.coAssignees||[]).join(', ') || '—';
      const trClass = (isOverdue(t) && clampStatus(t.status)!=='done') ? 'overdue-row' : '';
      const status = clampStatus(t.status)==='done' ? `Concluída${t.completedAt? ' — '+fmt.date(t.completedAt):''}` : (isOverdue(t) ? 'Atrasada' : (clampStatus(t.status)==='standby'?'Stand-by':'A fazer'));
      return `<tr data-id="${t.id}" class="${trClass} report-row">
        <td>${escapeHtml(t.title)}</td>
        <td>${escapeHtml(t.assignee||'—')}</td>
        <td>${escapeHtml(co)}</td>
        <td>${chipClient}</td>
        <td>${escapeHtml(t.type||'—')}</td>
        <td><span class="chip">${fmt.date(t.dueDate)}</span></td>
        <td>${escapeHtml(status)}</td>
        <td>
          <button class="btn btn-sm btn-outline-light btn-thin btn-view" title="Ver"><i class="bi bi-eye"></i></button>
          <button class="btn btn-sm btn-outline-light btn-thin" onclick="openEdit('${t.id}')" title="Editar"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger btn-thin" onclick="delTask('${t.id}')" title="Excluir"><i class="bi bi-trash"></i></button>
        </td>
      </tr>`
    }).join('');
  }

  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('.btn-view');
    if(btn){ const tr = btn.closest('tr'); if(tr?.dataset.id) openView(tr.dataset.id); }
    const row = e.target.closest('tr.report-row td:not(:last-child)');
    if(row){ const tr = row.parentElement; if(tr?.dataset.id) openView(tr.dataset.id); }
  });

  // ===== CRUD =====
  function openNew(){
    document.getElementById('taskModalTitle').textContent = 'Nova tarefa';
    document.getElementById('taskId').value = '';
    document.getElementById('taskTitle').value = '';
    document.getElementById('taskAssignee').value = state.people[0] || '';
    [...document.getElementById('taskCoAssignees').options].forEach(o=> o.selected=false);
    document.getElementById('taskClient').value = state.clients[0] || '';
    document.getElementById('taskDue').valueAsDate = new Date();
    document.getElementById('taskType').value = '🎨 Criação';
    document.getElementById('taskStatus').value = 'todo';
    document.getElementById('taskNotes').value = '';
    document.getElementById('subtasks').innerHTML = '';
    subtasksAddRow('');
    showModal('#taskModal');
  }
  function openEdit(id){
    const t = state.tasks.find(x=>x.id===id); if(!t) return;
    document.getElementById('taskModalTitle').textContent = 'Editar tarefa';
    document.getElementById('taskId').value = t.id;
    document.getElementById('taskTitle').value = t.title;
    document.getElementById('taskAssignee').value = t.assignee;
    [...document.getElementById('taskCoAssignees').options].forEach(o=> o.selected = (t.coAssignees||[]).includes(o.value));
    document.getElementById('taskClient').value = t.client || state.clients[0] || '';
    document.getElementById('taskDue').value = t.dueDate || '';
    document.getElementById('taskType').value = t.type || '🎨 Criação';
    document.getElementById('taskStatus').value = clampStatus(t.status);
    document.getElementById('taskNotes').value = t.notes || '';
    const st = document.getElementById('subtasks'); st.innerHTML = '';
    (t.subtasks||[]).forEach(s=> subtasksAddRow(s.text, s.done));
    if((t.subtasks||[]).length===0) subtasksAddRow('');
    showModal('#taskModal');
  }
  function saveTask(){
    const id = document.getElementById('taskId').value || uid();
    const title = document.getElementById('taskTitle').value.trim(); if(!title) return;
    const assignee = document.getElementById('taskAssignee').value;
    const coAssignees = [...document.getElementById('taskCoAssignees').selectedOptions].map(o=> o.value).filter(v=> v && v!==assignee);
    const client = document.getElementById('taskClient').value;
    const due = document.getElementById('taskDue').value || '';
    const type = document.getElementById('taskType').value;
    const status = clampStatus(document.getElementById('taskStatus').value);
    const notes = document.getElementById('taskNotes').value.trim();
    const subtasks = [...document.querySelectorAll('.subtask-row')].map(row=>({ text: row.querySelector('.subtext').value.trim(), done: row.querySelector('.subdone').checked })).filter(s=> s.text);

    const existing = state.tasks.find(x=>x.id===id);
    if(existing){ Object.assign(existing, {title,assignee,coAssignees,client,dueDate:due,notes,subtasks,type,status}); if(status==='done') existing.completedAt = todayStr(); else delete existing.completedAt; }
    else{ state.tasks.push({id,title,assignee,coAssignees,client,dueDate:due,notes,subtasks,type,status,createdAt:new Date().toISOString(), ...(status==='done'? {completedAt:todayStr()}: {})}); }
    apiSave().then(()=> hideModal('#taskModal')).catch(err=> alert(err.message));
  }
  function delTask(id){ if(!confirm('Excluir esta tarefa?')) return; state.tasks = state.tasks.filter(t=> t.id!==id); apiSave().catch(err=> alert(err.message)); }
  function toggleDone(id, closeAfter=false){
    const t = state.tasks.find(x=>x.id===id); if(!t) return; 
    t.status = clampStatus(t.status)==='done' ? 'todo' : 'done'; 
    if(clampStatus(t.status)==='done'){ t.completedAt = todayStr(); } else { delete t.completedAt; }
    apiSave().then(()=>{ if(closeAfter) hideModal('#viewModal'); }).catch(err=> alert(err.message));
  }
  function subtasksAddRow(text='', done=false){
    const wrap = document.getElementById('subtasks');
    const row = document.createElement('div'); row.className = 'd-flex align-items-center gap-2 subtask-row';
    row.innerHTML = `
      <input class="form-check-input subdone" type="checkbox" ${done? 'checked':''}>
      <input class="form-control form-control-sm thin subtext" placeholder="Subtarefa" value="${escapeAttr(text)}">
      <button class="btn btn-sm btn-outline-danger btn-thin" type="button" title="Remover" onclick="this.parentElement.remove()"><i class="bi bi-x-lg"></i></button>`;
    wrap.appendChild(row);
  }

  // ===== Pessoas/Clientes =====
  function addPerson(){
    const name = prompt('Nome da pessoa:');
    if(!name || !name.trim()) return; const n = name.trim();
    if(state.people.includes(n)) return alert('Já existe.');
    state.people.push(n); apiSave().catch(err=> alert(err.message));
  }
  function removePerson(person){
    if(!confirm(`Remover a coluna de ${person}? Você poderá reatribuir as tarefas.`)) return;
    const others = state.people.filter(p=> p!==person);
    const reassign = prompt('Reatribuir tarefas para quem? (digite exatamente o nome, deixe vazio para não alterar)\nOpções: '+others.join(', '));
    if(reassign && !others.includes(reassign)) { alert('Nome inválido. Operação cancelada.'); return; }
    state.tasks.forEach(t=>{ if(t.assignee===person && reassign) t.assignee=reassign; t.coAssignees=(t.coAssignees||[]).filter(c=> c!==person); });
    state.people = others; apiSave().catch(err=> alert(err.message));
  }
  function openClients(){
    const ul = document.getElementById('clientsList');
    ul.innerHTML = state.clients.map(c=>`<li class="list-group-item d-flex justify-content-between align-items-center thin">${escapeHtml(c)} <button class="btn btn-sm btn-outline-danger btn-thin" onclick="removeClient('${escapeAttr(c)}')"><i class="bi bi-x"></i></button></li>`).join('');
    showModal('#clientsModal');
  }
  function addClient(){
    const name = document.getElementById('newClientName').value.trim();
    if(!name) return;
    if(state.clients.includes(name)) { alert('Cliente já existe.'); return; }
    state.clients.push(name);
    document.getElementById('newClientName').value='';
    apiSave().catch(err=> alert(err.message));
    openClients();
  }
  function removeClient(name){
    state.clients = state.clients.filter(c=> c!==name);
    state.tasks.forEach(t=>{ if(t.client===name) t.client=''; });
    apiSave().catch(err=> alert(err.message));
    openClients();
  }

  // ===== Modal helpers & misc =====
  function showModal(sel){ const el = document.querySelector(sel); const m = new bootstrap.Modal(el); m.show(); }
  function hideModal(sel){ const el = document.querySelector(sel); const m = bootstrap.Modal.getInstance(el); m?.hide(); }
  function escapeHtml(s=''){ return s.replace(/[&<>]/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch])); }
  function escapeAttr(s=''){ return s.replace(/\\"/g,'&quot;'); }
  function cssEscape(s=''){ return CSS && CSS.escape ? CSS.escape(s) : s.replace(/[^\w-]/g,'\\\\$&'); }

  // ===== Toolbar =====
  document.getElementById('btnNewTask').addEventListener('click', openNew);
  document.getElementById('btnAddSub').addEventListener('click', ()=> subtasksAddRow(''));
  document.getElementById('btnSaveTask').addEventListener('click', saveTask);
  document.getElementById('btnAddPerson').addEventListener('click', addPerson);
  document.getElementById('btnExport').addEventListener('click', ()=>{
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `listoba_${new Date().toISOString().slice(0,10)}.json`; a.click();
    URL.revokeObjectURL(url);
  });
  document.getElementById('importFile').addEventListener('change', ev=>{ if(ev.target.files[0]){ const r=new FileReader(); r.onload = e=>{ try { state = JSON.parse(e.target.result); apiSave().catch(err=> alert(err.message)); } catch(err){ alert('Arquivo inválido.'); } }; r.readAsText(ev.target.files[0]); } ev.target.value=''; });
  document.getElementById('btnClients').addEventListener('click', openClients);
  document.getElementById('btnAddClient').addEventListener('click', addClient);
  document.getElementById('btnCopy').addEventListener('click', ()=>{
    const text = document.querySelector('#summaryBody pre').innerText;
    navigator.clipboard.writeText(text).then(()=>{
      const btn = document.getElementById('btnCopy'); const old = btn.innerHTML; btn.innerHTML = '<i class="bi bi-clipboard-check-fill me-1"></i>Copiado!';
      setTimeout(()=> btn.innerHTML = old, 1200);
    });
  });
  document.getElementById('search').addEventListener('input', renderReport);
  ['filterStatus','filterPerson','filterClient','filterType','filterFrom','filterTo','sortDate'].forEach(id=> document.getElementById(id).addEventListener('change', renderReport));
  document.getElementById('btnToggleCompact').addEventListener('click', ()=>{ prefs.compact = !prefs.compact; savePrefs(); });
  document.getElementById('btnToggleSummary').addEventListener('click', ()=>{ prefs.showSummary = !prefs.showSummary; savePrefs(); });
  document.getElementById('summaryMode').addEventListener('change', (e)=>{ prefs.summaryMode = e.target.value; savePrefs(); renderSummary(); });
  document.getElementById('btnSaveNotes').addEventListener('click', ()=>{
    state.nextWeekNotes = (document.getElementById('nextWeekNotes').value || '').trim();
    apiSave().then(()=>{
      const btn = document.getElementById('btnSaveNotes');
      const old = btn.innerHTML; 
      btn.innerHTML = '<i class="bi bi-check2 me-1"></i>Salvo';
      setTimeout(()=> btn.innerHTML = old, 1200);
    }).catch(err=> alert(err.message));
  });
  document.getElementById('nextWeekNotes').addEventListener('blur', ()=>{
    const val = (document.getElementById('nextWeekNotes').value || '').trim();
    if(val !== (state.nextWeekNotes || '')){
      state.nextWeekNotes = val;
      apiSave().catch(err=> console.warn('Falha ao salvar observações (blur):', err.message));
    }
  });

  // ===== Boot =====
  (async ()=>{
    applyPrefs();
    try{
      const remote = await apiRead();
      if(remote){ state = remote; }
      state.tasks = (state.tasks||[]).map(t=>{
        if(!t.status){ t.status = t.done ? 'done' : 'todo'; }
        return t;
      });
    }catch(err){
      console.warn('Falha ao carregar API', err);
      alert('Falha ao carregar dados. Verifique a API.');
    }
    renderAll();
    renderSummary();
    startPolling();
  })();

  window.addEventListener('error', (e)=>{
    console.error('LISTOBA error:', e.message);
  });