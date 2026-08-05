const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const STORAGE_KEY = 'omnifusion-v5-state';
const PASSWORD_KEY = 'omnifusion-app-password';

const els = {
  sidebar: $('#sidebar'), sidebarClose: $('#sidebarClose'), sidebarOverlay: $('#sidebarOverlay'), menuButton: $('#menuButton'),
  newChat: $('#newChat'), conversationList: $('#conversationList'),
  modePicker: $('#modePicker'), modeMenu: $('#modeMenu'), modeLabel: $('#modeLabel'), modeDetail: $('#modeDetail'),
  networkPill: $('#networkPill'), traceToggle: $('#traceToggle'), traceCount: $('#traceCount'), themeToggle: $('#themeToggle'),
  chatScroll: $('#chatScroll'), welcome: $('#welcome'), messages: $('#messages'),
  form: $('#promptForm'), prompt: $('#promptInput'), run: $('#runButton'), charCount: $('#charCount'),
  modelButton: $('#modelButton'), selectedModelText: $('#selectedModelText'),
  passwordRow: $('#passwordRow'), password: $('#appPassword'), savePassword: $('#savePassword'), error: $('#errorBox'),
  tracePanel: $('#tracePanel'), traceClose: $('#traceClose'), verificationCard: $('#verificationCard'), runSummary: $('#runSummary'), timeline: $('#timeline'),
  teamRoomTab: $('#teamRoomTab'), executionTab: $('#executionTab'), teamRoomPane: $('#teamRoomPane'), executionPane: $('#executionPane'), teamRoomStatus: $('#teamRoomStatus'), teamChat: $('#teamChat'),
  modelsModal: $('#modelsModal'), integrationsModal: $('#integrationsModal'), settingsModal: $('#settingsModal'),
  openModels: $('#openModels'), openIntegrations: $('#openIntegrations'), openSettings: $('#openSettings'),
  modelSearch: $('#modelSearch'), freeOnly: $('#freeOnly'), clearModels: $('#clearModels'), modelGrid: $('#modelGrid'), networkStats: $('#networkStats'),
  integrationSearch: $('#integrationSearch'), integrationFilter: $('#integrationFilter'), integrationGrid: $('#integrationGrid'),
  modelCountText: $('#modelCountText'), integrationCountText: $('#integrationCountText'),
  autoOpenTrace: $('#autoOpenTrace'), collaborationRounds: $('#collaborationRounds'), saveChats: $('#saveChats'), clearAllChats: $('#clearAllChats')
};

const modeMeta = {
  quick: { label: 'Quick', detail: 'One direct model' },
  team: { label: 'Team', detail: 'Agents share work and revise' },
  deep: { label: 'Deep Team', detail: 'More agents and review rounds' }
};

const state = {
  mode: 'team',
  status: null,
  selectedModels: new Set(),
  conversations: [],
  activeId: null,
  autoOpenTrace: true,
  collaborationRounds: 1,
  saveChats: true,
  running: false,
  traceEvents: [],
  teamMessages: [],
  currentRequestId: null,
  runStartedAt: 0,
  finalPayload: null
};

function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderMarkdown(source) {
  let text = escapeHtml(source || '');
  const blocks = [];
  text = text.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const token = `@@CODE_${blocks.length}@@`;
    blocks.push(`<pre><code data-lang="${escapeHtml(lang)}">${code.trim()}</code></pre>`);
    return token;
  });
  text = text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  const lines = text.split('\n');
  const out = [];
  let list = null;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of lines) {
    const unordered = line.match(/^\s*[-*] (.+)$/);
    const ordered = line.match(/^\s*\d+\. (.+)$/);
    if (unordered) {
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${unordered[1]}</li>`);
    } else if (ordered) {
      if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
      out.push(`<li>${ordered[1]}</li>`);
    } else {
      closeList();
      if (!line.trim()) out.push('');
      else if (/^<h[1-3]>/.test(line) || line.startsWith('@@CODE_')) out.push(line);
      else out.push(`<p>${line}</p>`);
    }
  }
  closeList();
  let html = out.join('\n');
  blocks.forEach((block, index) => { html = html.replace(`@@CODE_${index}@@`, block); });
  return html;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (saved.mode === 'council' || saved.mode === 'race') state.mode = 'team';
    else if (['quick', 'team', 'deep'].includes(saved.mode)) state.mode = saved.mode;
    state.selectedModels = new Set(Array.isArray(saved.selectedModels) ? saved.selectedModels : []);
    state.conversations = Array.isArray(saved.conversations) ? saved.conversations.slice(0, 40) : [];
    state.activeId = saved.activeId || state.conversations[0]?.id || null;
    state.autoOpenTrace = saved.autoOpenTrace !== false;
    state.collaborationRounds = Number(saved.collaborationRounds) === 2 ? 2 : 1;
    state.saveChats = saved.saveChats !== false;
    if (saved.theme === 'light') document.documentElement.classList.add('light');
  } catch {}
  els.autoOpenTrace.checked = state.autoOpenTrace;
  els.collaborationRounds.value = String(state.collaborationRounds);
  els.saveChats.checked = state.saveChats;
}

function saveState() {
  const payload = {
    mode: state.mode,
    selectedModels: [...state.selectedModels],
    conversations: state.saveChats ? state.conversations.slice(0, 40) : [],
    activeId: state.activeId,
    autoOpenTrace: state.autoOpenTrace,
    collaborationRounds: state.collaborationRounds,
    saveChats: state.saveChats,
    theme: document.documentElement.classList.contains('light') ? 'light' : 'dark'
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function currentConversation() {
  return state.conversations.find((item) => item.id === state.activeId) || null;
}

function ensureConversation(firstPrompt = '') {
  let conversation = currentConversation();
  if (conversation) return conversation;
  conversation = {
    id: uid('chat'),
    title: firstPrompt ? firstPrompt.slice(0, 42) : 'New chat',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: []
  };
  state.conversations.unshift(conversation);
  state.activeId = conversation.id;
  saveState();
  renderConversationList();
  return conversation;
}

function createNewChat() {
  state.activeId = null;
  state.finalPayload = null;
  state.traceEvents = [];
  state.teamMessages = [];
  renderConversationList();
  renderMessages();
  resetTrace();
  resetTeamRoom();
  closeSidebar();
  els.prompt.focus();
}

function renderConversationList() {
  if (!state.conversations.length) {
    els.conversationList.innerHTML = '<div class="empty-mini">No conversations yet</div>';
    return;
  }
  els.conversationList.innerHTML = state.conversations.map((conversation) => `
    <button class="conversation-item ${conversation.id === state.activeId ? 'active' : ''}" type="button" data-chat-id="${escapeHtml(conversation.id)}">
      <span>✦</span><div><strong>${escapeHtml(conversation.title || 'New chat')}</strong><small>${new Date(conversation.updatedAt || conversation.createdAt).toLocaleDateString()}</small></div>
    </button>`).join('');
  $$('[data-chat-id]', els.conversationList).forEach((button) => button.addEventListener('click', () => {
    state.activeId = button.dataset.chatId;
    saveState();
    renderConversationList();
    renderMessages();
    closeSidebar();
  }));
}

function messageHtml(message, index) {
  if (message.role === 'user') {
    return `<article class="message user"><div class="message-body"><div class="user-bubble">${escapeHtml(message.content)}</div></div><div class="message-avatar">YOU</div></article>`;
  }
  if (message.pending) {
    return `<article class="message assistant" data-message-index="${index}"><div class="message-avatar">AI</div><div class="message-body"><div class="assistant-card"><div class="assistant-head"><div class="assistant-head-left"><span class="status-spinner"></span><div><strong>AI team running</strong><small>${escapeHtml(message.status || 'Starting the orchestration…')}</small></div></div></div><div class="pending-content"><div class="pending-lines"><i></i><i></i><i></i></div></div></div></div></article>`;
  }
  const meta = message.meta || {};
  const distinct = Number(meta.distinctModels || 0);
  const verified = Boolean(meta.verifiedMultiModel);
  const badge = verified
    ? `<span class="verified-badge">✓ ${distinct} verified models</span>`
    : `<span class="verified-badge single-badge">${distinct || 1} model${distinct === 1 ? '' : 's'}</span>`;
  const models = Array.isArray(meta.models) ? meta.models.join(' · ') : '';
  return `<article class="message assistant" data-message-index="${index}">
    <div class="message-avatar">AI</div>
    <div class="message-body"><div class="assistant-card">
      <div class="assistant-head"><div class="assistant-head-left"><div><strong>OmniFusion answer</strong><small>${escapeHtml(models || meta.goal || 'Completed')}</small></div></div>${badge}</div>
      <div class="assistant-content">${renderMarkdown(message.content)}</div>
      <div class="assistant-actions"><button type="button" data-copy-message="${index}">Copy</button><button type="button" data-download-message="${index}">Download</button><button type="button" data-open-proof="${index}">View team room</button></div>
    </div></div>
  </article>`;
}

function renderMessages() {
  const conversation = currentConversation();
  const messages = conversation?.messages || [];
  els.welcome.classList.toggle('hidden', messages.length > 0);
  els.messages.innerHTML = messages.map(messageHtml).join('');
  $$('[data-copy-message]', els.messages).forEach((button) => button.addEventListener('click', async () => {
    const message = messages[Number(button.dataset.copyMessage)];
    if (!message) return;
    await navigator.clipboard.writeText(message.content || '');
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = 'Copy'; }, 1100);
  }));
  $$('[data-download-message]', els.messages).forEach((button) => button.addEventListener('click', () => {
    const message = messages[Number(button.dataset.downloadMessage)];
    if (!message) return;
    const blob = new Blob([message.content || ''], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `omnifusion-${new Date().toISOString().slice(0, 10)}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }));
  $$('[data-open-proof]', els.messages).forEach((button) => button.addEventListener('click', () => {
    const message = messages[Number(button.dataset.openProof)];
    if (message?.meta) {
      state.teamMessages = Array.isArray(message.meta.teamMessages) ? message.meta.teamMessages : [];
      renderTeamRoom(state.teamMessages, message.meta);
      renderProof({ ...message.meta, agents: message.meta.agents || [], teamMessages: state.teamMessages });
    }
    switchRoomTab('team');
    openTrace();
  }));
  requestAnimationFrame(() => { els.chatScroll.scrollTop = els.chatScroll.scrollHeight; });
}

function setPendingStatus(text) {
  const conversation = currentConversation();
  const pending = [...(conversation?.messages || [])].reverse().find((message) => message.pending);
  if (!pending) return;
  pending.status = text;
  const small = $('.message[data-message-index]:last-child .assistant-head small', els.messages);
  if (small) small.textContent = text;
}

function setMode(mode) {
  if (!modeMeta[mode]) return;
  state.mode = mode;
  els.modeLabel.textContent = modeMeta[mode].label;
  els.modeDetail.textContent = modeMeta[mode].detail;
  $$('[data-mode]', els.modeMenu).forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
  els.modeMenu.classList.remove('open');
  saveState();
}

function appPassword() { return sessionStorage.getItem(PASSWORD_KEY) || ''; }
function apiHeaders(json = true, stream = false) {
  const headers = {};
  if (json) headers['Content-Type'] = 'application/json';
  if (stream) headers.Accept = 'text/event-stream';
  if (appPassword()) headers['x-app-password'] = appPassword();
  return headers;
}

async function readJsonOrText(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch {
    return { error: text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500) || `Request failed (${response.status}).` };
  }
}

function showError(message = '') {
  els.error.textContent = message;
  els.error.classList.toggle('show', Boolean(message));
}

function openSidebar() { els.sidebar.classList.add('open'); els.sidebarOverlay.classList.add('open'); }
function closeSidebar() { els.sidebar.classList.remove('open'); els.sidebarOverlay.classList.remove('open'); }
function openTrace() { els.tracePanel.classList.add('open'); }
function closeTrace() { els.tracePanel.classList.remove('open'); }
function openModal(modal) { modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); }
function closeModals() { $$('.modal.open').forEach((modal) => { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); }); }

function switchRoomTab(tab) {
  const team = tab !== 'execution';
  els.teamRoomTab.classList.toggle('active', team);
  els.executionTab.classList.toggle('active', !team);
  els.teamRoomPane.classList.toggle('active', team);
  els.executionPane.classList.toggle('active', !team);
}

function resetTeamRoom() {
  state.teamMessages = [];
  els.teamRoomStatus.className = 'team-room-status';
  els.teamRoomStatus.innerHTML = '<i></i><span>No collaboration yet.</span>';
  els.teamChat.innerHTML = '<div class="team-empty">The actual agent handoffs, reviews, and revisions will appear here.</div>';
}

function teamMessageCard(message) {
  const kind = String(message.kind || 'message').replaceAll('-', ' ');
  const model = message.model || message.requestedModel || 'selecting model';
  const latency = message.latencyMs ? `${(message.latencyMs / 1000).toFixed(1)}s` : '';
  return `<article class="team-message ${escapeHtml(message.kind || 'message')}">
    <div class="team-message-head"><div><strong>${escapeHtml(message.from || 'AI teammate')}</strong><span>→ ${escapeHtml(message.to || 'Team')}</span></div><em>${escapeHtml(kind)}</em></div>
    <div class="team-message-body">${renderMarkdown(message.content || 'Working…')}</div>
    <div class="team-message-meta"><span>${escapeHtml(model)}</span><span>${escapeHtml(message.provider || '')}${latency ? ` · ${latency}` : ''}</span></div>
  </article>`;
}

function renderTeamRoom(messages = state.teamMessages, meta = {}) {
  const items = Array.isArray(messages) ? messages : [];
  state.teamMessages = items;
  els.teamChat.innerHTML = items.length ? items.map(teamMessageCard).join('') : '<div class="team-empty">No team messages were saved for this run.</div>';
  const collaboration = Boolean(meta.collaborationVerified || items.some((item) => item.kind === 'revision'));
  els.teamRoomStatus.className = `team-room-status ${collaboration ? 'verified' : items.length ? 'working' : ''}`;
  els.teamRoomStatus.innerHTML = collaboration
    ? `<i></i><span>Verified collaboration: ${items.length} visible handoffs, reviews, and revisions.</span>`
    : items.length
      ? `<i></i><span>${items.length} team message${items.length === 1 ? '' : 's'} recorded.</span>`
      : '<i></i><span>No collaboration yet.</span>';
  requestAnimationFrame(() => { els.tracePanel.scrollTop = els.tracePanel.scrollHeight; });
}

function addTeamMessage(message) {
  if (!message?.id || state.teamMessages.some((item) => item.id === message.id)) return;
  state.teamMessages.push(message);
  if ($('.team-empty', els.teamChat)) els.teamChat.innerHTML = '';
  els.teamChat.insertAdjacentHTML('beforeend', teamMessageCard(message));
  els.teamRoomStatus.className = 'team-room-status working';
  els.teamRoomStatus.innerHTML = `<i></i><span>${escapeHtml(message.from || 'A teammate')} handed work to ${escapeHtml(message.to || 'the team')}.</span>`;
  els.traceCount.textContent = String(state.traceEvents.length + state.teamMessages.length);
  requestAnimationFrame(() => { els.tracePanel.scrollTop = els.tracePanel.scrollHeight; });
}

function resetTrace() {
  state.traceEvents = [];
  state.currentRequestId = null;
  state.runStartedAt = 0;
  els.traceCount.textContent = '0';
  els.timeline.innerHTML = '';
  els.runSummary.innerHTML = '';
  els.verificationCard.className = 'verification-card';
  els.verificationCard.innerHTML = '<div class="verification-icon">◎</div><div><strong>No run yet</strong><p>Completed API calls will appear here.</p></div>';
}

function eventLabel(type, data) {
  const labels = {
    run_start: 'Run started', route_complete: 'Models selected', planner_start: 'Team planner started', planner_complete: 'Team roles assigned',
    collaboration_start: 'Shared workspace created', round_start: `Round ${data.round ?? ''} started`, round_complete: `Round ${data.round ?? ''} completed`,
    team_message_start: `${data.from || 'Teammate'} is writing`, team_message: `${data.from || 'Teammate'} sent a handoff`,
    agent_start: `${data.role || 'Specialist'} started`, agent_complete: `${data.role || 'Specialist'} completed`,
    finalizer_start: 'Final integrator started', finalizer_complete: 'Final deliverable completed', provider_attempt: 'Provider call started',
    provider_failure: 'Provider fallback triggered', heartbeat: 'Still working', error: 'Run failed', run_complete: 'Run completed'
  };
  return labels[type] || type.replaceAll('_', ' ');
}

function eventDetail(type, data) {
  if (type === 'route_complete') return `${data.candidateCount || 0} candidates · ${data.intent || 'general'} intent`;
  if (type === 'team_message_start') return `${data.from || 'AI'} → ${data.to || 'Team'} · ${data.requestedModel || 'selecting model'}`;
  if (type === 'team_message') return `${data.from || 'AI'} → ${data.to || 'Team'} · ${data.model || 'unknown model'} · ${((data.latencyMs || 0) / 1000).toFixed(1)}s`;
  if (type === 'round_start' || type === 'round_complete') return data.label || `${data.completed || 0} contributions`;
  if (type === 'agent_start') return data.requestedModel || 'Selecting a model…';
  if (type === 'agent_complete' || type === 'planner_complete' || type === 'finalizer_complete') return `${data.provider || 'OpenRouter'} · ${data.model || 'unknown model'} · ${((data.latencyMs || 0) / 1000).toFixed(1)}s`;
  if (type === 'provider_attempt') return `${data.providerName || data.provider || 'Provider'} · ${data.requestedModel || ''}`;
  if (type === 'provider_failure') return `${data.requestedModel || data.providerName || 'Provider'} · ${data.error || 'failed'}`;
  if (type === 'run_start') return `${data.mode || state.mode} mode · request ${String(data.requestId || '').slice(0, 8)}`;
  if (type === 'run_complete') return `${data.callsCompleted || 0} completed calls · ${data.distinctModels || 0} distinct models`;
  if (type === 'error') return data.message || 'Server error';
  return data.detail || '';
}

function addTraceEvent(type, data = {}) {
  if (type === 'heartbeat') return;
  const status = ['provider_failure', 'error'].includes(type) ? 'failure' : ['run_start', 'planner_start', 'agent_start', 'team_message_start', 'finalizer_start', 'provider_attempt', 'round_start'].includes(type) ? 'running' : 'success';
  const entry = { id: data.eventId || uid('event'), type, data, status, time: new Date(data.ts || Date.now()) };
  state.traceEvents.push(entry);
  els.traceCount.textContent = String(state.traceEvents.length + state.teamMessages.length);
  const icon = status === 'failure' ? '!' : status === 'running' ? '…' : '✓';
  const card = document.createElement('div');
  card.className = `trace-event ${status}`;
  card.dataset.eventId = entry.id;
  card.innerHTML = `<div class="trace-event-icon">${icon}</div><div><strong>${escapeHtml(eventLabel(type, data))}</strong><small>${escapeHtml(eventDetail(type, data))}</small></div><time>${entry.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>`;
  els.timeline.append(card);
  els.tracePanel.scrollTop = els.tracePanel.scrollHeight;
}

function renderProof(payload = {}) {
  const distinct = Number(payload.distinctModels || 0);
  const calls = Number(payload.callsCompleted || 0);
  const failures = Number(payload.failedAttempts || 0);
  const duration = Number(payload.durationMs || 0);
  const collaboration = Boolean(payload.collaborationVerified);
  const verified = Boolean(payload.verifiedMultiModel);
  els.verificationCard.className = `verification-card ${verified ? 'verified' : collaboration ? 'working' : 'warning'}`;
  els.verificationCard.innerHTML = verified
    ? `<div class="verification-icon">✓</div><div><strong>Verified collaborative run</strong><p>${distinct} distinct model IDs exchanged work through a shared transcript.</p></div>`
    : collaboration
      ? `<div class="verification-icon">↔</div><div><strong>Collaboration verified</strong><p>Agents reviewed and revised shared work, but provider fallbacks reduced model diversity.</p></div>`
      : `<div class="verification-icon">!</div><div><strong>${state.mode === 'quick' ? 'Single-model run' : 'Collaboration incomplete'}</strong><p>Open the event log below to inspect what completed.</p></div>`;
  els.runSummary.innerHTML = `
    <div class="summary-stat"><strong>${calls}</strong><span>API calls</span></div>
    <div class="summary-stat"><strong>${distinct}</strong><span>models</span></div>
    <div class="summary-stat"><strong>${(duration / 1000).toFixed(1)}s</strong><span>duration</span></div>`;

  if (failures) {
    const note = document.createElement('div');
    note.className = 'trace-foot';
    note.textContent = `${failures} provider attempt${failures === 1 ? '' : 's'} failed and triggered fallback routing.`;
    els.timeline.append(note);
  }
}

function updateNetworkStatus() {
  const openRouter = state.status?.openRouter;
  if (!openRouter?.configured) {
    els.networkPill.classList.remove('ready');
    els.networkPill.querySelector('span').textContent = 'No OpenRouter key';
    els.modelCountText.textContent = 'OpenRouter not configured';
    return;
  }
  els.networkPill.classList.add('ready');
  const count = openRouter.usableModelCount || openRouter.freeModelCount || 1;
  els.networkPill.querySelector('span').textContent = `${count} usable models`;
  els.modelCountText.textContent = `${count} usable through one key`;
  els.integrationCountText.textContent = `${state.status.integrations?.length || 0} tools and workflows`;
  els.passwordRow.classList.toggle('show', Boolean(state.status.passwordRequired));
  if (appPassword()) els.password.value = appPassword();
}

async function loadStatus() {
  try {
    const response = await fetch('/api/status', { headers: apiHeaders(false) });
    const data = await readJsonOrText(response);
    if (!response.ok) throw new Error(data.error || `Could not load the AI network (${response.status}).`);
    state.status = data;
    document.title = data.appName || 'OmniFusion AI';
    updateNetworkStatus();
    renderModels();
    renderIntegrations();
  } catch (error) {
    els.networkPill.querySelector('span').textContent = 'Network error';
    els.modelGrid.innerHTML = `<div class="loading-card">${escapeHtml(error.message)}</div>`;
  }
}

function selectedModelIds() { return [...state.selectedModels]; }
function updateSelectedModelsUi() {
  const count = state.selectedModels.size;
  els.selectedModelText.textContent = count ? `${count} selected model${count === 1 ? '' : 's'}` : 'Auto models';
  saveState();
}

function renderModels() {
  const openRouter = state.status?.openRouter;
  const query = els.modelSearch.value.trim().toLowerCase();
  const freeOnly = els.freeOnly.checked;
  const models = (openRouter?.models || []).filter((model) => (!freeOnly || model.free) && (!query || `${model.name} ${model.id} ${model.authorName}`.toLowerCase().includes(query)));
  els.networkStats.innerHTML = openRouter ? `<span>${openRouter.modelCount || 0} catalog models</span><span>${openRouter.freeModelCount || 0} free</span><span>${openRouter.families?.length || 0} model families</span>${openRouter.error ? `<span>Catalog warning</span>` : ''}` : '';
  if (!models.length) {
    els.modelGrid.innerHTML = '<div class="loading-card">No models match this filter. Automatic routing can still use openrouter/free.</div>';
    return;
  }
  els.modelGrid.innerHTML = models.slice(0, 250).map((model) => {
    const id = `or:${model.id}`;
    const selected = state.selectedModels.has(id);
    return `<label class="model-card ${selected ? 'selected' : ''}"><input type="checkbox" value="${escapeHtml(id)}" ${selected ? 'checked' : ''}/><div class="model-card-head"><strong>${escapeHtml(model.name)}</strong>${model.free ? '<span class="free-chip">FREE</span>' : ''}</div><small>${escapeHtml(model.id)}</small><div class="model-tags">${(model.strengths || []).slice(0, 4).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div></label>`;
  }).join('');
  $$('input[type="checkbox"]', els.modelGrid).forEach((input) => input.addEventListener('change', () => {
    if (input.checked) {
      if (state.selectedModels.size >= 12) {
        input.checked = false;
        showError('Select up to 12 models. Automatic mode is usually more reliable.');
        return;
      }
      state.selectedModels.add(input.value);
    } else state.selectedModels.delete(input.value);
    input.closest('.model-card').classList.toggle('selected', input.checked);
    updateSelectedModelsUi();
  }));
}

function renderIntegrations() {
  const integrations = state.status?.integrations || [];
  const categories = [...new Set(integrations.map((item) => item.category))].sort();
  els.integrationFilter.innerHTML = '<option value="all">All categories</option>' + categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
  filterIntegrations();
}

function filterIntegrations() {
  const query = els.integrationSearch.value.trim().toLowerCase();
  const category = els.integrationFilter.value;
  const integrations = (state.status?.integrations || []).filter((item) => (category === 'all' || item.category === category) && (!query || `${item.name} ${item.category} ${item.mode} ${(item.capabilities || []).join(' ')}`.toLowerCase().includes(query)));
  els.integrationGrid.innerHTML = integrations.map((item) => `<article class="integration-card"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.category)} · ${escapeHtml(item.mode)}</small><div class="model-tags">${(item.capabilities || []).slice(0, 4).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div><small>${escapeHtml(item.note || '')}</small></article>`).join('') || '<div class="loading-card">No integrations match.</div>';
}

function parseSseBlock(block) {
  let event = 'message';
  const dataLines = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return null;
  const raw = dataLines.join('\n');
  try { return { event, data: JSON.parse(raw) }; }
  catch { return { event, data: { message: raw } }; }
}

async function consumeEventStream(response, onEvent) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('This browser could not read the live response stream.');
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || '';
    for (const block of blocks) {
      const parsed = parseSseBlock(block);
      if (parsed) onEvent(parsed.event, parsed.data);
    }
    if (done) break;
  }
  if (buffer.trim()) {
    const parsed = parseSseBlock(buffer);
    if (parsed) onEvent(parsed.event, parsed.data);
  }
}

function handleStreamEvent(type, data) {
  if (data.requestId) state.currentRequestId = data.requestId;
  if (type === 'run_start') {
    state.runStartedAt = Date.now();
    addTraceEvent(type, data);
    setPendingStatus('Routing the request…');
  } else if (type === 'route_complete') {
    addTraceEvent(type, data);
    setPendingStatus(`Selected ${data.candidateCount || 'the'} candidate models…`);
  } else if (type === 'planner_start') {
    addTraceEvent(type, data);
    setPendingStatus('The team planner is assigning connected roles…');
  } else if (type === 'planner_complete') {
    addTraceEvent(type, data);
    setPendingStatus('The shared workspace is ready…');
  } else if (type === 'collaboration_start') {
    addTraceEvent(type, data);
    els.teamRoomStatus.className = 'team-room-status working';
    els.teamRoomStatus.innerHTML = `<i></i><span>${escapeHtml((data.roles || []).join(' · '))}</span>`;
    setPendingStatus('The team lead is starting the project…');
  } else if (type === 'round_start' || type === 'round_complete') {
    addTraceEvent(type, data);
    if (type === 'round_start') setPendingStatus(data.label || 'The team is collaborating…');
  } else if (type === 'team_message_start') {
    addTraceEvent(type, data);
    setPendingStatus(`${data.from || 'A teammate'} is replying to ${data.to || 'the team'}…`);
  } else if (type === 'team_message') {
    addTraceEvent(type, data);
    addTeamMessage(data);
    setPendingStatus(`${data.from || 'A teammate'} handed work to ${data.to || 'the team'}…`);
  } else if (type === 'agent_start' || type === 'agent_complete') {
    addTraceEvent(type, data);
  } else if (type === 'finalizer_start') {
    addTraceEvent(type, data);
    setPendingStatus('The final integrator is using the full team transcript…');
  } else if (type === 'finalizer_complete') {
    addTraceEvent(type, data);
    setPendingStatus('Preparing the final deliverable…');
  } else if (type === 'provider_attempt' || type === 'provider_failure') {
    addTraceEvent(type, data);
  } else if (type === 'run_complete') {
    addTraceEvent(type, data);
    state.finalPayload = data;
    renderTeamRoom(data.teamMessages || state.teamMessages, data);
  } else if (type === 'error') {
    addTraceEvent(type, data);
    throw new Error(data.message || 'The server could not complete the run.');
  }
}

function finishRun(payload) {
  const conversation = currentConversation();
  if (!conversation) return;
  const index = conversation.messages.findIndex((message) => message.pending);
  const models = Array.isArray(payload.completedModels) ? payload.completedModels : [];
  const message = {
    role: 'assistant',
    content: payload.answer || 'No answer was returned.',
    meta: {
      goal: payload.goal,
      models,
      distinctModels: payload.distinctModels,
      verifiedMultiModel: payload.verifiedMultiModel,
      callsCompleted: payload.callsCompleted,
      durationMs: payload.durationMs,
      agents: payload.agents || [],
      teamMessages: payload.teamMessages || [],
      collaborationVerified: payload.collaborationVerified,
      collaborationRounds: payload.collaborationRounds,
      failedAttempts: payload.failedAttempts,
      trace: payload.trace || []
    }
  };
  if (index >= 0) conversation.messages[index] = message;
  else conversation.messages.push(message);
  conversation.updatedAt = new Date().toISOString();
  if (conversation.title === 'New chat') {
    const firstUser = conversation.messages.find((item) => item.role === 'user');
    conversation.title = firstUser?.content?.slice(0, 42) || 'New chat';
  }
  saveState();
  renderConversationList();
  renderMessages();
  renderTeamRoom(payload.teamMessages || [], payload);
  renderProof(payload);
}

async function runPrompt(event) {
  event.preventDefault();
  if (state.running) return;
  const prompt = els.prompt.value.trim();
  if (!prompt) return;
  showError('');
  const conversation = ensureConversation(prompt);
  conversation.messages.push({ role: 'user', content: prompt });
  conversation.messages.push({ role: 'assistant', content: '', pending: true, status: 'Starting the orchestration…' });
  conversation.updatedAt = new Date().toISOString();
  els.prompt.value = '';
  autoResizePrompt();
  updateCharCount();
  state.running = true;
  state.finalPayload = null;
  els.run.disabled = true;
  resetTrace();
  resetTeamRoom();
  switchRoomTab('team');
  if (state.autoOpenTrace) openTrace();
  renderConversationList();
  renderMessages();
  saveState();

  try {
    const response = await fetch('/api/orchestrate', {
      method: 'POST',
      headers: apiHeaders(true, true),
      body: JSON.stringify({ prompt, mode: state.mode, providers: selectedModelIds(), collaborationRounds: state.mode === 'deep' ? Math.max(2, state.collaborationRounds) : state.collaborationRounds })
    });
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      let streamError = null;
      await consumeEventStream(response, (type, data) => {
        try { handleStreamEvent(type, data); }
        catch (error) { streamError = error; }
      });
      if (streamError) throw streamError;
      if (!state.finalPayload) throw new Error('The live stream ended before the server delivered a final result. Check the Vercel function logs.');
      finishRun(state.finalPayload);
    } else {
      const data = await readJsonOrText(response);
      if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
      finishRun(data);
    }
  } catch (error) {
    const message = error?.message || 'The AI team could not complete the request.';
    const pendingIndex = conversation.messages.findIndex((item) => item.pending);
    if (pendingIndex >= 0) conversation.messages[pendingIndex] = { role: 'assistant', content: `**Run error:** ${message}`, meta: { distinctModels: 0, models: [] } };
    conversation.updatedAt = new Date().toISOString();
    saveState();
    renderMessages();
    showError(message);
    if (/password/i.test(message)) els.passwordRow.classList.add('show');
  } finally {
    state.running = false;
    els.run.disabled = false;
  }
}

function updateCharCount() { els.charCount.textContent = `${els.prompt.value.length.toLocaleString()} / 12,000`; }
function autoResizePrompt() {
  els.prompt.style.height = 'auto';
  els.prompt.style.height = `${Math.min(els.prompt.scrollHeight, 180)}px`;
}

els.form.addEventListener('submit', runPrompt);
els.prompt.addEventListener('input', () => { updateCharCount(); autoResizePrompt(); });
els.prompt.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    els.form.requestSubmit();
  }
});
$$('[data-prompt]').forEach((button) => button.addEventListener('click', () => { els.prompt.value = button.dataset.prompt; updateCharCount(); autoResizePrompt(); els.prompt.focus(); }));

els.newChat.addEventListener('click', createNewChat);
els.menuButton.addEventListener('click', openSidebar);
els.sidebarClose.addEventListener('click', closeSidebar);
els.sidebarOverlay.addEventListener('click', closeSidebar);
els.traceToggle.addEventListener('click', () => { switchRoomTab('team'); els.tracePanel.classList.toggle('open'); });
els.traceClose.addEventListener('click', closeTrace);
els.teamRoomTab.addEventListener('click', () => switchRoomTab('team'));
els.executionTab.addEventListener('click', () => switchRoomTab('execution'));
els.modePicker.addEventListener('click', (event) => { event.stopPropagation(); els.modeMenu.classList.toggle('open'); });
$$('[data-mode]', els.modeMenu).forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
document.addEventListener('click', (event) => { if (!els.modeMenu.contains(event.target) && !els.modePicker.contains(event.target)) els.modeMenu.classList.remove('open'); });

els.openModels.addEventListener('click', () => { renderModels(); openModal(els.modelsModal); closeSidebar(); });
els.modelButton.addEventListener('click', () => { renderModels(); openModal(els.modelsModal); });
els.openIntegrations.addEventListener('click', () => { filterIntegrations(); openModal(els.integrationsModal); closeSidebar(); });
els.openSettings.addEventListener('click', () => { openModal(els.settingsModal); closeSidebar(); });
$$('[data-close-modal]').forEach((button) => button.addEventListener('click', closeModals));
$$('.modal').forEach((modal) => modal.addEventListener('click', (event) => { if (event.target === modal) closeModals(); }));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeModals(); els.modeMenu.classList.remove('open'); closeSidebar(); } });

els.modelSearch.addEventListener('input', renderModels);
els.freeOnly.addEventListener('change', renderModels);
els.clearModels.addEventListener('click', () => { state.selectedModels.clear(); updateSelectedModelsUi(); renderModels(); });
els.integrationSearch.addEventListener('input', filterIntegrations);
els.integrationFilter.addEventListener('change', filterIntegrations);

els.savePassword.addEventListener('click', () => { sessionStorage.setItem(PASSWORD_KEY, els.password.value); showError(''); loadStatus(); });
els.themeToggle.addEventListener('click', () => { document.documentElement.classList.toggle('light'); els.themeToggle.textContent = document.documentElement.classList.contains('light') ? '☀' : '☾'; saveState(); });
els.autoOpenTrace.addEventListener('change', () => { state.autoOpenTrace = els.autoOpenTrace.checked; saveState(); });
els.collaborationRounds.addEventListener('change', () => { state.collaborationRounds = Number(els.collaborationRounds.value) === 2 ? 2 : 1; saveState(); });
els.saveChats.addEventListener('change', () => { state.saveChats = els.saveChats.checked; saveState(); });
els.clearAllChats.addEventListener('click', () => { if (!confirm('Clear all locally saved chats?')) return; state.conversations = []; state.activeId = null; saveState(); renderConversationList(); renderMessages(); closeModals(); });

loadState();
resetTeamRoom();
switchRoomTab('team');
setMode(state.mode);
updateSelectedModelsUi();
renderConversationList();
renderMessages();
updateCharCount();
loadStatus();
