const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  mode: 'council',
  selectedProviders: new Set(),
  status: null,
  result: null,
  currentPrompt: '',
  elapsedTimer: null,
  progressTimer: null,
  startedAt: 0,
  history: loadHistory()
};

const els = {
  form: $('#promptForm'),
  prompt: $('#promptInput'),
  charCount: $('#charCount'),
  run: $('#runButton'),
  error: $('#errorBox'),
  passwordRow: $('#passwordRow'),
  password: $('#appPassword'),
  execution: $('#executionPanel'),
  executionTitle: $('#executionTitle'),
  executionDetail: $('#executionDetail'),
  executionTimer: $('#executionTimer'),
  progressBar: $('#progressBar'),
  resultSection: $('#resultSection'),
  answerOutput: $('#answerOutput'),
  resultGoal: $('#resultGoal'),
  resultDuration: $('#resultDuration'),
  resultMeta: $('#resultMeta'),
  agentGrid: $('#agentGrid'),
  agentCountBadge: $('#agentCountBadge'),
  citationArea: $('#citationArea'),
  integrationDrawer: $('#integrationDrawer'),
  providerDrawer: $('#providerDrawer'),
  historyDrawer: $('#historyDrawer'),
  overlay: $('#overlay'),
  integrationGrid: $('#integrationGrid'),
  integrationSearch: $('#integrationSearch'),
  integrationFilter: $('#integrationFilter'),
  providerSelectList: $('#providerSelectList'),
  providerPickerText: $('#providerPickerText'),
  providerMiniList: $('#providerMiniList'),
  connectedCount: $('#connectedCount'),
  libraryCount: $('#libraryCount'),
  historyList: $('#historyList'),
  mediaResult: $('#mediaResult'),
  mediaBody: $('#mediaBody'),
  mediaTitle: $('#mediaTitle'),
  imageModal: $('#imageModal'),
  imagePrompt: $('#imagePrompt'),
  generateImage: $('#generateImage')
};

function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem('omnifusion_history') || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch { return []; }
}

function saveHistory() {
  try { localStorage.setItem('omnifusion_history', JSON.stringify(state.history.slice(0, 20))); } catch {}
}

function appPassword() {
  return sessionStorage.getItem('omnifusion_password') || '';
}

function apiHeaders(json = true) {
  const headers = {};
  if (json) headers['Content-Type'] = 'application/json';
  const password = appPassword();
  if (password) headers['x-app-password'] = password;
  return headers;
}

function initials(name) {
  return String(name || 'AI').split(/[\s/]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function inlineMarkdown(text) {
  return text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function renderMarkdown(source) {
  const codeBlocks = [];
  const withTokens = String(source || '').replace(/```([^\n]*)\n?([\s\S]*?)```/g, (_, language, code) => {
    const token = `OMNIFUSIONCODE${codeBlocks.length}TOKEN`;
    codeBlocks.push(`<pre><code data-language="${escapeHtml(language.trim())}">${escapeHtml(code.trim())}</code></pre>`);
    return `\n${token}\n`;
  });

  const lines = escapeHtml(withTokens).split(/\r?\n/);
  const out = [];
  let paragraph = [];
  let listType = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    out.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (!listType) return;
    out.push(`</${listType}>`);
    listType = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    const codeMatch = /^OMNIFUSIONCODE(\d+)TOKEN$/.exec(trimmed);
    if (codeMatch) {
      flushParagraph(); closeList(); out.push(codeBlocks[Number(codeMatch[1])] || ''); continue;
    }
    if (!trimmed) { flushParagraph(); closeList(); continue; }
    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph(); closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    const ordered = /^\d+[.)]\s+(.+)$/.exec(trimmed);
    if (bullet || ordered) {
      flushParagraph();
      const nextType = ordered ? 'ol' : 'ul';
      if (listType !== nextType) { closeList(); listType = nextType; out.push(`<${listType}>`); }
      out.push(`<li>${inlineMarkdown((bullet || ordered)[1])}</li>`);
      continue;
    }
    const quote = /^&gt;\s?(.+)$/.exec(trimmed);
    if (quote) { flushParagraph(); closeList(); out.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`); continue; }
    paragraph.push(trimmed);
  }
  flushParagraph(); closeList();
  return out.join('');
}

function showError(message = '') {
  els.error.textContent = message;
  els.error.classList.toggle('show', Boolean(message));
}

function openDrawer(drawer) {
  closeDrawers();
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  els.overlay.classList.add('show');
}

function closeDrawers() {
  $$('.drawer.open').forEach((drawer) => {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  });
  els.overlay.classList.remove('show');
}

function updateProviderPicker() {
  const count = state.selectedProviders.size;
  els.providerPickerText.textContent = count ? `${count} AI${count === 1 ? '' : 's'} selected` : 'Auto-select AIs';
}

function isIntegrationConnected(item) {
  if (!state.status) return false;
  const text = state.status.textProviders.find((provider) => provider.id === item.id)?.configured;
  if (text) return true;
  if (item.id === 'replicate') return Boolean(state.status.media?.image);
  if (item.id === 'elevenlabs') return Boolean(state.status.media?.speech);
  if (item.id === 'custom-webhook' || item.id === 'comfyui') return Boolean(state.status.media?.webhook);
  if (['meta', 'qwen', 'stablediffusion', 'flux'].includes(item.id)) {
    return state.status.textProviders.some((provider) => provider.configured && ['openrouter', 'huggingface', 'groq', 'cloudflare', 'ollama'].includes(provider.id));
  }
  return false;
}

function integrationModeClass(mode) {
  const value = String(mode).toLowerCase();
  if (value === 'api') return 'api';
  if (value === 'gateway') return 'gateway';
  if (value === 'webhook') return 'webhook';
  return 'external';
}

function renderIntegrations() {
  if (!state.status) return;
  const query = els.integrationSearch.value.trim().toLowerCase();
  const filter = els.integrationFilter.value;
  const items = state.status.integrations.filter((item) => {
    const haystack = `${item.name} ${item.category} ${item.capabilities.join(' ')}`.toLowerCase();
    return (!query || haystack.includes(query)) && (filter === 'all' || item.category === filter);
  });

  els.integrationGrid.innerHTML = items.map((item) => {
    const connected = isIntegrationConnected(item);
    return `<article class="integration-card">
      <div class="integration-top">
        <span class="provider-avatar">${escapeHtml(initials(item.name))}</span>
        <div class="integration-name"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.category)} · ${escapeHtml(item.mode)}</small></div>
        <span class="integration-state ${connected ? 'connected' : ''}">${connected ? 'Connected' : integrationModeClass(item.mode)}</span>
      </div>
      <p>${escapeHtml(item.note)}</p>
      <div class="capabilities">${item.capabilities.slice(0, 4).map((capability) => `<span>${escapeHtml(capability)}</span>`).join('')}</div>
    </article>`;
  }).join('') || '<div class="empty-state">No integrations match this search.</div>';
}

function renderProviderControls() {
  if (!state.status) return;
  const providers = state.status.textProviders;
  const connected = providers.filter((provider) => provider.configured);
  els.connectedCount.textContent = connected.length;
  els.libraryCount.textContent = state.status.integrations.length;
  els.providerMiniList.innerHTML = connected.length
    ? connected.slice(0, 5).map((provider) => `<div class="provider-mini"><span class="provider-avatar">${escapeHtml(initials(provider.name))}</span><span>${escapeHtml(provider.name)}</span><i></i></div>`).join('')
    : '<div class="empty-state">No provider key added yet.</div>';

  els.providerSelectList.innerHTML = providers.map((provider) => {
    const checked = state.selectedProviders.has(provider.id);
    return `<label class="provider-select ${provider.configured ? '' : 'disabled'}">
      <input type="checkbox" value="${escapeHtml(provider.id)}" ${checked ? 'checked' : ''} ${provider.configured ? '' : 'disabled'} />
      <span class="provider-avatar">${escapeHtml(initials(provider.name))}</span>
      <div><strong>${escapeHtml(provider.name)}</strong><small>${provider.configured ? escapeHtml(provider.model || 'Configured') : 'Add its key in Vercel'}</small></div>
    </label>`;
  }).join('');

  $$('input[type="checkbox"]', els.providerSelectList).forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) state.selectedProviders.add(input.value);
      else state.selectedProviders.delete(input.value);
      updateProviderPicker();
    });
  });
}

function renderHistory() {
  els.historyList.innerHTML = state.history.length ? state.history.map((item, index) => `<article class="history-item" data-history-index="${index}"><strong>${escapeHtml(item.prompt)}</strong><small>${escapeHtml(new Date(item.date).toLocaleString())} · ${escapeHtml((item.providers || []).join(', ') || 'AI')}</small></article>`).join('') : '<div class="empty-state">Your completed prompts will appear here.</div>';
  $$('[data-history-index]', els.historyList).forEach((item) => item.addEventListener('click', () => {
    const selected = state.history[Number(item.dataset.historyIndex)];
    if (!selected) return;
    els.prompt.value = selected.prompt;
    updateCharCount();
    closeDrawers();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
}

async function loadStatus() {
  try {
    const response = await fetch('/api/status', { headers: apiHeaders(false) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load provider status.');
    state.status = data;
    document.title = data.appName || 'OmniFusion AI';
    els.passwordRow.classList.toggle('show', Boolean(data.passwordRequired));
    if (appPassword()) els.password.value = appPassword();

    const categories = [...new Set(data.integrations.map((item) => item.category))].sort();
    els.integrationFilter.innerHTML = '<option value="all">All categories</option>' + categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
    renderProviderControls();
    renderIntegrations();
  } catch (error) {
    els.providerMiniList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function updateCharCount() {
  els.charCount.textContent = `${els.prompt.value.length.toLocaleString()} / 12,000`;
}

function setExecutionStep(index) {
  const steps = $$('.execution-steps > div');
  steps.forEach((step, stepIndex) => {
    step.classList.toggle('active', stepIndex === index);
    step.classList.toggle('done', stepIndex < index);
    if (stepIndex < index) step.querySelector('i').textContent = '✓';
    else step.querySelector('i').textContent = String(stepIndex + 1);
  });
  const labels = [
    ['Understanding the request', 'Detecting intent and constraints…'],
    ['Assembling the team', 'Routing to complementary AI providers…'],
    ['Specialists are working', 'Independent answers are running in parallel…'],
    ['Judging the council', 'Resolving contradictions and improving quality…'],
    ['Preparing the result', 'Formatting the strongest final response…']
  ];
  els.executionTitle.textContent = labels[index][0];
  els.executionDetail.textContent = labels[index][1];
  els.progressBar.style.width = `${[9, 27, 58, 82, 100][index]}%`;
}

function beginExecution() {
  stopExecution();
  els.execution.classList.add('show');
  els.resultSection.classList.remove('show');
  els.mediaResult.classList.remove('show');
  state.startedAt = performance.now();
  setExecutionStep(0);
  els.executionTimer.textContent = '0.0s';
  state.elapsedTimer = setInterval(() => {
    els.executionTimer.textContent = `${((performance.now() - state.startedAt) / 1000).toFixed(1)}s`;
  }, 100);
  let step = 0;
  state.progressTimer = setInterval(() => {
    step = Math.min(3, step + 1);
    setExecutionStep(step);
  }, 3200);
}

function stopExecution(success = false) {
  if (state.elapsedTimer) clearInterval(state.elapsedTimer);
  if (state.progressTimer) clearInterval(state.progressTimer);
  state.elapsedTimer = null;
  state.progressTimer = null;
  if (success) setExecutionStep(4);
}

function renderResult(data) {
  state.result = data;
  els.resultGoal.textContent = data.goal || 'Final answer';
  els.resultDuration.textContent = `${(Number(data.durationMs || 0) / 1000).toFixed(1)}s`;
  els.answerOutput.innerHTML = renderMarkdown(data.answer || '');
  els.agentCountBadge.textContent = data.agents?.length || 0;
  els.resultMeta.innerHTML = [
    `<span class="meta-pill"><i></i>${escapeHtml(data.intent || 'general')}</span>`,
    ...(data.providersUsed || []).map((provider) => `<span class="meta-pill">${escapeHtml(provider)}</span>`),
    data.partialFailures ? `<span class="meta-pill">${data.partialFailures} fallback${data.partialFailures === 1 ? '' : 's'} used</span>` : ''
  ].filter(Boolean).join('');

  const citations = Array.isArray(data.citations) ? data.citations.filter((item) => typeof item === 'string' && /^https?:\/\//i.test(item)).slice(0, 12) : [];
  els.citationArea.classList.toggle('show', citations.length > 0);
  els.citationArea.innerHTML = citations.length ? `<strong>Provider citations</strong>${citations.map((url, index) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Source ${index + 1}</a>`).join('')}` : '';

  els.agentGrid.innerHTML = (data.agents || []).map((agent) => `<article class="agent-card">
    <div class="agent-card-head"><span class="provider-avatar">${escapeHtml(initials(agent.provider || agent.role))}</span><div><h3>${escapeHtml(agent.role)}</h3><small>${escapeHtml(agent.provider || '')} · ${escapeHtml(agent.model || '')} · ${((agent.latencyMs || 0) / 1000).toFixed(1)}s</small></div></div>
    <div class="agent-content">${escapeHtml(agent.content)}</div>
  </article>`).join('') || '<div class="empty-state">Quick mode used one direct response.</div>';

  els.resultSection.classList.add('show');
  $$('.result-tabs button').forEach((button) => button.classList.toggle('active', button.dataset.resultTab === 'answer'));
  $('#answerPanel').classList.add('active');
  $('#agentsPanel').classList.remove('active');

  state.history.unshift({
    prompt: state.currentPrompt.slice(0, 500),
    answer: String(data.answer || '').slice(0, 30000),
    goal: data.goal,
    providers: data.providersUsed || [],
    date: new Date().toISOString()
  });
  state.history = state.history.slice(0, 20);
  saveHistory();
  renderHistory();
}

async function runPrompt(event) {
  event.preventDefault();
  const prompt = els.prompt.value.trim();
  if (!prompt) return;
  showError('');
  state.currentPrompt = prompt;
  els.run.disabled = true;
  beginExecution();

  try {
    const response = await fetch('/api/orchestrate', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ prompt, mode: state.mode, providers: [...state.selectedProviders] })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    stopExecution(true);
    await new Promise((resolve) => setTimeout(resolve, 350));
    els.execution.classList.remove('show');
    renderResult(data);
    setTimeout(() => els.resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  } catch (error) {
    stopExecution();
    els.execution.classList.remove('show');
    showError(error.message || 'The AI team could not complete the request.');
    if (/password/i.test(error.message || '')) els.passwordRow.classList.add('show');
  } finally {
    els.run.disabled = false;
  }
}

function downloadResult() {
  if (!state.result) return;
  const body = `# ${state.result.goal || 'OmniFusion result'}\n\n${state.result.answer}\n\n---\nProviders: ${(state.result.providersUsed || []).join(', ')}\n`;
  const blob = new Blob([body], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `omnifusion-${new Date().toISOString().slice(0, 10)}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function copyResult() {
  if (!state.result) return;
  await navigator.clipboard.writeText(state.result.answer || '');
  const button = $('#copyResult');
  const old = button.textContent;
  button.textContent = '✓';
  setTimeout(() => { button.textContent = old; }, 1200);
}

async function createSpeech() {
  if (!state.result) return;
  els.mediaResult.classList.add('show');
  els.mediaTitle.textContent = 'Voiceover';
  els.mediaBody.innerHTML = '<div class="media-loading">Generating voice…</div>';
  els.mediaResult.scrollIntoView({ behavior: 'smooth', block: 'center' });
  try {
    const response = await fetch('/api/speech', {
      method: 'POST', headers: apiHeaders(), body: JSON.stringify({ text: String(state.result.answer || '').slice(0, 4800) })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Voice generation failed.');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    els.mediaBody.innerHTML = `<audio controls autoplay src="${url}"></audio>`;
  } catch (error) {
    els.mediaBody.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function openImageStudio() {
  els.imagePrompt.value = state.currentPrompt || els.prompt.value.trim() || 'Create a polished cinematic image';
  els.imageModal.classList.add('open');
}

async function createImage() {
  const prompt = els.imagePrompt.value.trim();
  if (!prompt) return;
  els.generateImage.disabled = true;
  els.imageModal.classList.remove('open');
  els.mediaResult.classList.add('show');
  els.mediaTitle.textContent = 'Generated image';
  els.mediaBody.innerHTML = '<div class="media-loading">Generating image…</div>';
  els.mediaResult.scrollIntoView({ behavior: 'smooth', block: 'center' });
  try {
    const response = await fetch('/api/image', { method: 'POST', headers: apiHeaders(), body: JSON.stringify({ prompt }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Image generation failed.');
    if (data.url || data.dataUrl) {
      const src = data.url || data.dataUrl;
      els.mediaBody.innerHTML = `<img src="${escapeHtml(src)}" alt="AI-generated result" /><div class="result-meta"><span class="meta-pill"><i></i>${escapeHtml(data.provider || 'Image AI')}</span></div>`;
    } else if (data.pending) {
      els.mediaBody.innerHTML = '<div class="empty-state">The provider accepted the generation, but it is still processing. Check the provider dashboard.</div>';
    } else throw new Error('The provider returned no image.');
  } catch (error) {
    els.mediaBody.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  } finally {
    els.generateImage.disabled = false;
  }
}

els.form.addEventListener('submit', runPrompt);
els.prompt.addEventListener('input', updateCharCount);
els.prompt.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') els.form.requestSubmit();
});
$$('[data-prompt]').forEach((button) => button.addEventListener('click', () => { els.prompt.value = button.dataset.prompt; updateCharCount(); els.prompt.focus(); }));
$$('[data-mode]').forEach((button) => button.addEventListener('click', () => {
  state.mode = button.dataset.mode;
  $$('[data-mode]').forEach((item) => item.classList.toggle('active', item === button));
}));

$('#openIntegrations').addEventListener('click', () => openDrawer(els.integrationDrawer));
$('#railIntegrations').addEventListener('click', () => openDrawer(els.integrationDrawer));
$('#manageProviders').addEventListener('click', () => openDrawer(els.providerDrawer));
$('#providerPicker').addEventListener('click', () => openDrawer(els.providerDrawer));
$('#openHistory').addEventListener('click', () => { renderHistory(); openDrawer(els.historyDrawer); });
els.overlay.addEventListener('click', closeDrawers);
$$('[data-close-drawer]').forEach((button) => button.addEventListener('click', closeDrawers));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeDrawers(); els.imageModal.classList.remove('open'); } });

els.integrationSearch.addEventListener('input', renderIntegrations);
els.integrationFilter.addEventListener('change', renderIntegrations);
$('#selectAllProviders').addEventListener('click', () => {
  state.status?.textProviders.filter((provider) => provider.configured).forEach((provider) => state.selectedProviders.add(provider.id));
  renderProviderControls(); updateProviderPicker();
});
$('#clearProviders').addEventListener('click', () => { state.selectedProviders.clear(); renderProviderControls(); updateProviderPicker(); });
$('#clearHistory').addEventListener('click', () => { state.history = []; saveHistory(); renderHistory(); });

$('#savePassword').addEventListener('click', () => {
  const value = els.password.value.trim();
  if (value) sessionStorage.setItem('omnifusion_password', value);
  else sessionStorage.removeItem('omnifusion_password');
  showError('');
  loadStatus();
});

$$('[data-result-tab]').forEach((button) => button.addEventListener('click', () => {
  $$('[data-result-tab]').forEach((item) => item.classList.toggle('active', item === button));
  $('#answerPanel').classList.toggle('active', button.dataset.resultTab === 'answer');
  $('#agentsPanel').classList.toggle('active', button.dataset.resultTab === 'agents');
}));

$('#copyResult').addEventListener('click', copyResult);
$('#downloadResult').addEventListener('click', downloadResult);
$('#speakResult').addEventListener('click', createSpeech);
$('#imageResult').addEventListener('click', openImageStudio);
$('#closeMedia').addEventListener('click', () => els.mediaResult.classList.remove('show'));
$('#closeImageModal').addEventListener('click', () => els.imageModal.classList.remove('open'));
els.imageModal.addEventListener('click', (event) => { if (event.target === els.imageModal) els.imageModal.classList.remove('open'); });
els.generateImage.addEventListener('click', createImage);

$('#themeToggle').addEventListener('click', () => {
  document.documentElement.classList.toggle('light');
  const light = document.documentElement.classList.contains('light');
  localStorage.setItem('omnifusion_theme', light ? 'light' : 'dark');
  $('#themeToggle').textContent = light ? '☀' : '☾';
});

if (localStorage.getItem('omnifusion_theme') === 'light') {
  document.documentElement.classList.add('light');
  $('#themeToggle').textContent = '☀';
}

updateCharCount();
renderHistory();
loadStatus();
