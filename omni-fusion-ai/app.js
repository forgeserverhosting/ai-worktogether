const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const STORAGE_KEY = 'omnifusion-studio-v7';
const PASSWORD_KEY = 'omnifusion-app-password';

const els = {
  networkPill: $('#networkPill'), integrityPill: $('#integrityPill'), sidebarModelCount: $('#sidebarModelCount'),
  projectMenuBtn: $('#projectMenuBtn'), projectsPanel: $('#projectsPanel'), closeProjectsBtn: $('#closeProjectsBtn'), mobileOverlay: $('#mobileOverlay'),
  projectList: $('#projectList'), newProjectBtn: $('#newProjectBtn'), clearProjectsBtn: $('#clearProjectsBtn'),
  projectTitle: $('#projectTitle'), projectSubtitle: $('#projectSubtitle'), projectStatusDot: $('#projectStatusDot'),
  emptyStage: $('#emptyStage'), previewStage: $('#previewStage'), previewFrame: $('#previewFrame'), previewLabel: $('#previewLabel'), openPreviewBtn: $('#openPreviewBtn'),
  fileTree: $('#fileTree'), fileDetail: $('#fileDetail'), fileCountBadge: $('#fileCountBadge'),
  codeFileSelect: $('#codeFileSelect'), codeStatus: $('#codeStatus'), codeEditor: $('#codeEditor'), copyCodeBtn: $('#copyCodeBtn'), saveCodeBtn: $('#saveCodeBtn'),
  changesView: $('#changesView'), changeCountBadge: $('#changeCountBadge'), validationView: $('#validationView'),
  buildForm: $('#buildForm'), promptInput: $('#promptInput'), promptCount: $('#promptCount'), promptModeLabel: $('#promptModeLabel'), runBtn: $('#runBtn'),
  runProgress: $('#runProgress'), runProgressBar: $('#runProgressBar'), runProgressText: $('#runProgressText'), errorBanner: $('#errorBanner'),
  outputFormatBtn: $('#outputFormatBtn'), selectedModelsBtn: $('#selectedModelsBtn'), downloadZipBtn: $('#downloadZipBtn'), validateBtn: $('#validateBtn'), applyTeamBtn: $('#applyTeamBtn'),
  teamPanel: $('.team-panel'), teamStatus: $('#teamStatus'), teamSummary: $('#teamSummary'), teamFeed: $('#teamFeed'), agentChatForm: $('#agentChatForm'), agentSelect: $('#agentSelect'), agentPrompt: $('#agentPrompt'),
  settingsBtn: $('#settingsBtn'), settingsModal: $('#settingsModal'), outputFormatSelect: $('#outputFormatSelect'), reviewRoundsSelect: $('#reviewRoundsSelect'), minModelsSelect: $('#minModelsSelect'), integrityModeSelect: $('#integrityModeSelect'), saveProjectsToggle: $('#saveProjectsToggle'), autoValidateToggle: $('#autoValidateToggle'), appPasswordInput: $('#appPasswordInput'), savePasswordBtn: $('#savePasswordBtn'), clearLocalDataBtn: $('#clearLocalDataBtn'),
  modelsBtn: $('#modelsBtn'), modelsModal: $('#modelsModal'), modelSearch: $('#modelSearch'), freeOnlyToggle: $('#freeOnlyToggle'), clearModelsBtn: $('#clearModelsBtn'), networkStats: $('#networkStats'), modelGrid: $('#modelGrid'), selectedModelFooter: $('#selectedModelFooter'),
  integrationsBtn: $('#integrationsBtn'), integrationsModal: $('#integrationsModal'), integrationSearch: $('#integrationSearch'), integrationCategory: $('#integrationCategory'), integrationGrid: $('#integrationGrid'),
  themeBtn: $('#themeBtn')
};

const state = {
  status: null,
  selectedModels: new Set(),
  projects: [],
  activeId: null,
  running: false,
  activeWorkspaceTab: 'preview',
  activeFile: null,
  settings: {
    outputFormat: 'static', reviewRounds: 1, minModels: 3, integrityMode: 'warn', saveProjects: true, autoValidate: true
  }
};

const roleDefinitions = [
  {
    role: 'Product Lead',
    instruction: 'Convert the request into a practical project brief. Preserve every factual constraint, identify missing facts that must remain placeholders, define sections, user goals, and acceptance criteria.',
    deliverable: 'A concise build brief, section map, factual guardrails, and acceptance checklist.'
  },
  {
    role: 'Content Strategist',
    instruction: 'Read the Product Lead handoff. Write usable page content, CTA language, information hierarchy, and SEO copy while respecting all factual guardrails. Do not invent business claims.',
    deliverable: 'Concrete copy and content structure the designer and developer can use.'
  },
  {
    role: 'UI/UX Designer',
    instruction: 'Read the lead and content work. Define a polished visual system, responsive layout, component behavior, accessibility decisions, and mobile experience. Make specific decisions rather than generic advice.',
    deliverable: 'A detailed design system and responsive implementation handoff.'
  },
  {
    role: 'Frontend Architect',
    instruction: 'Read every earlier teammate. Turn the plan, copy, and design into an exact file architecture and implementation checklist. Resolve contradictions before files are generated.',
    deliverable: 'A file plan, component map, interaction plan, and developer acceptance checklist.'
  }
];

function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function bytesLabel(chars = 0) {
  const bytes = new Blob([String(chars)]).size;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function appPassword() { return sessionStorage.getItem(PASSWORD_KEY) || ''; }
function apiHeaders(json = true) {
  const headers = {};
  if (json) headers['Content-Type'] = 'application/json';
  if (appPassword()) headers['x-app-password'] = appPassword();
  return headers;
}

async function readJsonOrText(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { return { error: text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 700) || `Request failed (${response.status}).` }; }
}

async function postJson(url, payload, timeoutMs = 70000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: 'POST', headers: apiHeaders(true), body: JSON.stringify(payload), signal: controller.signal });
    const data = await readJsonOrText(response);
    if (!response.ok) {
      const error = new Error(data.error || `Request failed (${response.status}).`);
      error.attempts = Array.isArray(data.attempts) ? data.attempts : [];
      throw error;
    }
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('This AI step took too long. Completed work was preserved.');
    throw error;
  } finally { clearTimeout(timer); }
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    state.selectedModels = new Set(Array.isArray(saved.selectedModels) ? saved.selectedModels : []);
    state.settings = { ...state.settings, ...(saved.settings || {}) };
    state.projects = Array.isArray(saved.projects) ? saved.projects.slice(0, 10) : [];
    state.activeId = saved.activeId || state.projects[0]?.id || null;
    if (saved.theme === 'light') document.documentElement.classList.add('light');
  } catch {}
  syncSettingsUi();
}

function compactProjectForStorage(project) {
  if (!project) return null;
  return {
    ...project,
    files: (project.files || []).map((file) => ({ path: file.path, content: String(file.content || '').slice(0, 150000) }))
  };
}

function saveState() {
  const payload = {
    selectedModels: [...state.selectedModels], settings: state.settings, activeId: state.activeId,
    projects: state.settings.saveProjects ? state.projects.slice(0, 10).map((project) => ({ ...project, artifact: compactProjectForStorage(project.artifact), previousArtifact: compactProjectForStorage(project.previousArtifact) })) : [],
    theme: document.documentElement.classList.contains('light') ? 'light' : 'dark'
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); }
  catch {
    try {
      const light = { ...payload, projects: state.projects.slice(0, 6).map((project) => ({ ...project, previousArtifact: null, changes: [], teamMessages: (project.teamMessages || []).slice(-16) })) };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(light));
    } catch {}
  }
}

function syncSettingsUi() {
  els.outputFormatSelect.value = state.settings.outputFormat;
  els.reviewRoundsSelect.value = String(state.settings.reviewRounds);
  els.minModelsSelect.value = String(state.settings.minModels);
  els.integrityModeSelect.value = state.settings.integrityMode;
  els.saveProjectsToggle.checked = state.settings.saveProjects;
  els.autoValidateToggle.checked = state.settings.autoValidate;
  els.outputFormatBtn.textContent = formatLabel(state.settings.outputFormat);
  els.promptModeLabel.textContent = `Development Studio · 5+ agents · ${state.settings.reviewRounds} review round${state.settings.reviewRounds === 1 ? '' : 's'}`;
}

function formatLabel(value) {
  return ({ static: 'Static multi-file', 'single-html': 'Single index.html', nextjs: 'Next.js project', auto: 'Auto format' })[value] || 'Static multi-file';
}

function activeProject() { return state.projects.find((project) => project.id === state.activeId) || null; }

function createProject(prompt = '') {
  const project = {
    id: uid('project'), title: prompt ? prompt.slice(0, 48) : 'Untitled project', prompt, status: 'draft',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), artifact: null, previousArtifact: null,
    teamMessages: [], attempts: [], completedModels: [], providers: [], review: null, validation: null, changes: [], pendingTeamNotes: [], integrity: null
  };
  state.projects.unshift(project);
  state.projects = state.projects.slice(0, 10);
  state.activeId = project.id;
  state.activeFile = null;
  saveState();
  renderAll();
  return project;
}

function ensureProject(prompt) {
  let project = activeProject();
  if (!project || (project.status !== 'draft' && project.prompt !== prompt && project.artifact)) project = createProject(prompt);
  project.prompt = prompt;
  project.title = project.artifact?.projectName || prompt.slice(0, 48) || 'Untitled project';
  return project;
}

function renderProjectList() {
  if (!state.projects.length) {
    els.projectList.innerHTML = '<div class="empty-panel">No projects yet.</div>';
    return;
  }
  els.projectList.innerHTML = state.projects.map((project) => `
    <button class="project-item ${project.id === state.activeId ? 'active' : ''} ${escapeHtml(project.status)}" data-project-id="${escapeHtml(project.id)}">
      <i></i><span><strong>${escapeHtml(project.title || 'Untitled')}</strong><small>${escapeHtml(project.status || 'draft')} · ${new Date(project.updatedAt || project.createdAt).toLocaleDateString()}</small></span>
    </button>`).join('');
  $$('[data-project-id]', els.projectList).forEach((button) => button.addEventListener('click', () => {
    state.activeId = button.dataset.projectId;
    state.activeFile = activeProject()?.artifact?.entryFile || activeProject()?.artifact?.files?.[0]?.path || null;
    saveState(); renderAll(); closeProjects();
  }));
}

function updateProjectHeader(project) {
  els.projectTitle.textContent = project?.artifact?.projectName || project?.title || 'Untitled project';
  const statusText = project?.status === 'complete' ? 'Project files ready' : project?.status === 'building' ? 'AI team is building' : project?.status === 'failed' ? 'Run stopped; completed work preserved' : 'Describe what the team should build.';
  els.projectSubtitle.textContent = project?.artifact?.summary || statusText;
  els.projectStatusDot.className = `status-dot ${project?.status || ''}`;
  els.downloadZipBtn.disabled = !canRelease(project);
  els.validateBtn.disabled = !project?.artifact?.files?.length || state.running;
  els.applyTeamBtn.disabled = !project?.artifact?.files?.length || !(project?.pendingTeamNotes || []).length || state.running;
}

function canRelease(project) {
  if (!project?.artifact?.files?.length || state.running) return false;
  if (state.settings.integrityMode === 'strict' && !(project.integrity?.verified)) return false;
  return true;
}

function setWorkspaceTab(tab) {
  state.activeWorkspaceTab = tab;
  $$('[data-workspace-tab]').forEach((button) => button.classList.toggle('active', button.dataset.workspaceTab === tab));
  $$('[data-workspace-view]').forEach((view) => view.classList.toggle('active', view.dataset.workspaceView === tab));
  if (tab === 'code') renderCodeEditor();
  if (tab === 'validation') renderValidation();
}

function inlinePreview(project) {
  if (!project?.files?.length) return '';
  const map = new Map(project.files.map((file) => [file.path.replace(/^\.\//, ''), file.content]));
  let html = map.get(project.entryFile) || map.get('index.html') || '';
  if (!html) return '';
  html = html.replace(/<link([^>]+)href=["']([^"']+\.css)["']([^>]*)>/gi, (full, before, href) => {
    const content = map.get(href.replace(/^\.\//, '').split('?')[0]);
    return content ? `<style data-omnifusion-source="${escapeHtml(href)}">${content}</style>` : full;
  });
  html = html.replace(/<script([^>]+)src=["']([^"']+\.m?js)["']([^>]*)><\/script>/gi, (full, before, src) => {
    const content = map.get(src.replace(/^\.\//, '').split('?')[0]);
    return content ? `<script data-omnifusion-source="${escapeHtml(src)}">${content}<\/script>` : full;
  });
  return html;
}

function renderPreview(project) {
  const html = inlinePreview(project?.artifact);
  els.emptyStage.classList.toggle('hidden', Boolean(html));
  els.previewStage.classList.toggle('hidden', !html);
  if (html) {
    els.previewFrame.srcdoc = html;
    els.previewLabel.textContent = `${project.artifact.projectName} · ${project.artifact.entryFile}`;
  } else els.previewFrame.srcdoc = '';
}

function fileIcon(path) {
  const ext = path.split('.').pop()?.toLowerCase();
  return ({ html: 'HTML', css: 'CSS', js: 'JS', mjs: 'JS', ts: 'TS', tsx: 'TSX', jsx: 'JSX', json: '{}', md: 'MD', svg: 'SVG' })[ext] || 'FILE';
}

function renderFiles(project) {
  const files = project?.artifact?.files || [];
  els.fileCountBadge.textContent = String(files.length);
  if (!files.length) {
    els.fileTree.innerHTML = '<div class="empty-panel">No files yet.</div>';
    els.fileDetail.innerHTML = '<div class="empty-panel">The Developer will place real files here.</div>';
    return;
  }
  if (!state.activeFile || !files.some((file) => file.path === state.activeFile)) state.activeFile = project.artifact.entryFile || files[0].path;
  els.fileTree.innerHTML = files.map((file) => `<button class="file-row ${file.path === state.activeFile ? 'active' : ''}" data-file-path="${escapeHtml(file.path)}"><b>${fileIcon(file.path)}</b><span>${escapeHtml(file.path)}</span></button>`).join('');
  $$('[data-file-path]', els.fileTree).forEach((button) => button.addEventListener('click', () => { state.activeFile = button.dataset.filePath; renderFiles(project); renderCodeEditor(); }));
  const file = files.find((item) => item.path === state.activeFile) || files[0];
  els.fileDetail.innerHTML = `<article class="file-card"><div class="file-card-head"><strong>${escapeHtml(file.path)}</strong><small>${file.content.split('\n').length} lines · ${bytesLabel(file.content)}</small></div><pre>${escapeHtml(file.content)}</pre></article>`;
}

function renderCodeEditor() {
  const project = activeProject();
  const files = project?.artifact?.files || [];
  els.codeFileSelect.innerHTML = files.map((file) => `<option value="${escapeHtml(file.path)}">${escapeHtml(file.path)}</option>`).join('');
  if (!files.length) {
    els.codeEditor.value = ''; els.codeEditor.disabled = true; els.copyCodeBtn.disabled = true; els.saveCodeBtn.disabled = true; els.codeStatus.textContent = 'No files generated'; return;
  }
  if (!state.activeFile || !files.some((file) => file.path === state.activeFile)) state.activeFile = project.artifact.entryFile || files[0].path;
  els.codeFileSelect.value = state.activeFile;
  const file = files.find((item) => item.path === state.activeFile);
  els.codeEditor.disabled = false; els.codeEditor.value = file?.content || ''; els.copyCodeBtn.disabled = false; els.saveCodeBtn.disabled = false;
  els.codeStatus.textContent = `${file?.content.split('\n').length || 0} lines · editable`;
}

function simpleDiff(before = '', after = '') {
  const a = before.split('\n'); const b = after.split('\n'); const out = [];
  const max = Math.min(Math.max(a.length, b.length), 350);
  for (let i = 0; i < max; i += 1) {
    if (a[i] === b[i]) { if (out.length < 20) out.push(`  ${a[i] || ''}`); continue; }
    if (a[i] !== undefined) out.push(`- ${a[i]}`);
    if (b[i] !== undefined) out.push(`+ ${b[i]}`);
  }
  if (Math.max(a.length, b.length) > max) out.push('… diff truncated …');
  return out.slice(-220).join('\n');
}

function computeChanges(beforeProject, afterProject) {
  const before = new Map((beforeProject?.files || []).map((file) => [file.path, file.content]));
  const after = new Map((afterProject?.files || []).map((file) => [file.path, file.content]));
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
  return paths.flatMap((path) => {
    const oldContent = before.get(path); const newContent = after.get(path);
    if (oldContent === newContent) return [];
    return [{ path, type: oldContent === undefined ? 'added' : newContent === undefined ? 'removed' : 'modified', beforeLines: oldContent?.split('\n').length || 0, afterLines: newContent?.split('\n').length || 0, diff: simpleDiff(oldContent || '', newContent || '') }];
  });
}

function renderChanges(project) {
  const changes = project?.changes || [];
  els.changeCountBadge.textContent = String(changes.length);
  if (!changes.length) { els.changesView.innerHTML = '<div class="empty-panel">Changes from QA repairs will appear here.</div>'; return; }
  els.changesView.innerHTML = changes.map((change) => `<article class="change-card"><header><strong>${escapeHtml(change.path)}</strong><small>${escapeHtml(change.type)} · ${change.beforeLines} → ${change.afterLines} lines</small></header><pre class="diff-block">${escapeHtml(change.diff).replace(/^\+.*$/gm, '<span class="diff-add">$&</span>').replace(/^-.*$/gm, '<span class="diff-del">$&</span>')}</pre></article>`).join('');
}

function renderValidation() {
  const report = activeProject()?.validation;
  if (!report) { els.validationView.innerHTML = '<div class="empty-panel">Run validation after files are generated.</div>'; return; }
  const checks = report.deterministic?.checks || [];
  els.validationView.innerHTML = `<article class="validation-card"><header><div><strong>Release validation</strong><small>${escapeHtml(report.ai?.summary || '')}</small></div><div class="validation-score">${Number(report.score || 0)}%</div></header>${checks.map((check) => `<div class="check-row ${check.passed ? 'pass' : 'fail'}"><i>${check.passed ? '✓' : '×'}</i><div><strong>${escapeHtml(check.name)}</strong><small>${escapeHtml(check.detail)}</small></div><small>${escapeHtml(check.severity)}</small></div>`).join('')}</article>${(report.ai?.concerns || []).length ? `<article class="validation-card"><header><strong>AI validator concerns</strong></header>${report.ai.concerns.map((concern) => `<div class="check-row fail"><i>!</i><div>${escapeHtml(concern)}</div><small>review</small></div>`).join('')}</article>` : ''}`;
}

function renderTeam(project) {
  const messages = project?.teamMessages || [];
  if (!messages.length) {
    els.teamFeed.innerHTML = '<div class="empty-panel">The Product Lead, Content Strategist, Designer, Developer, Reviewer, Fixer, and Validator will talk here.</div>';
    els.teamSummary.innerHTML = '<strong>No run yet</strong><small>Actual handoffs and model IDs will appear here.</small>';
    els.agentChatForm.classList.add('hidden');
    return;
  }
  els.teamFeed.innerHTML = messages.map((message, index) => `
    <article class="team-message ${message.failed ? 'failed' : ''} ${message.artifactEvent ? 'artifact-event' : ''}">
      <div class="team-message-head"><div><strong>${escapeHtml(message.from)} → ${escapeHtml(message.to || 'Team')}</strong><small>${escapeHtml(message.kind || 'handoff')} · ${new Date(message.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div><span class="model-chip" title="${escapeHtml(message.model || '')}">${escapeHtml(message.model || 'system')}</span></div>
      <div class="team-message-body">${escapeHtml(message.content || '')}</div>
      <div class="team-message-actions"><button data-copy-team="${index}">Copy</button><button data-use-note="${index}">Use as change request</button></div>
    </article>`).join('');
  $$('[data-copy-team]', els.teamFeed).forEach((button) => button.addEventListener('click', async () => { await navigator.clipboard.writeText(messages[Number(button.dataset.copyTeam)]?.content || ''); button.textContent = 'Copied'; }));
  $$('[data-use-note]', els.teamFeed).forEach((button) => button.addEventListener('click', () => {
    const message = messages[Number(button.dataset.useNote)]; if (!message) return;
    project.pendingTeamNotes = [...(project.pendingTeamNotes || []), `${message.from}: ${message.content}`].slice(-8); saveState(); updateProjectHeader(project); button.textContent = 'Added';
  }));
  requestAnimationFrame(() => { els.teamFeed.scrollTop = els.teamFeed.scrollHeight; });
  const models = project.completedModels || [];
  const verified = project.integrity?.verified;
  els.teamSummary.innerHTML = `<strong>${verified ? 'Verified collaboration' : 'Collaboration record'} · ${models.length} distinct model${models.length === 1 ? '' : 's'}</strong><small>${project.attempts?.length || 0} provider attempts · ${project.integrity?.message || 'Model identity is taken from completed provider responses.'}</small>`;
  const roles = [...new Set(messages.filter((message) => !message.artifactEvent).map((message) => message.from))];
  els.agentSelect.innerHTML = roles.map((role) => `<option>${escapeHtml(role)}</option>`).join('');
  els.agentChatForm.classList.toggle('hidden', !project.artifact);
}

function updateIntegrity(project) {
  const count = project?.completedModels?.length || 0;
  const min = state.settings.minModels;
  const verified = count >= min;
  project.integrity = { verified, count, minimum: min, message: verified ? `${count} unique model IDs completed real work.` : `Only ${count}/${min} required unique models completed.` };
  els.integrityPill.className = `integrity-pill ${verified ? 'verified' : project?.status === 'building' ? '' : 'warn'}`;
  els.integrityPill.textContent = project?.status === 'building' ? `${count} models active` : verified ? `✓ Verified · ${count} models` : `${count}/${min} models`;
}

function renderAll() {
  const project = activeProject();
  renderProjectList(); updateProjectHeader(project); renderPreview(project); renderFiles(project); renderChanges(project); renderValidation(); renderTeam(project); updateIntegrity(project);
  setWorkspaceTab(state.activeWorkspaceTab);
}

function setProgress(percent, text) {
  els.runProgress.classList.remove('hidden'); els.runProgressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`; els.runProgressText.textContent = text;
}
function showError(message = '') { els.errorBanner.textContent = message; els.errorBanner.classList.toggle('hidden', !message); }
function setTeamStatus(status, label) { els.teamStatus.className = `team-status ${status}`; els.teamStatus.innerHTML = `<i></i> ${escapeHtml(label)}`; }

function recordAttempts(project, attempts = []) {
  for (const attempt of attempts) {
    project.attempts.push(attempt);
    if (attempt.success && attempt.actualModel && !project.completedModels.includes(attempt.actualModel)) project.completedModels.push(attempt.actualModel);
    if (attempt.success && attempt.providerName && !project.providers.includes(attempt.providerName)) project.providers.push(attempt.providerName);
  }
  updateIntegrity(project);
}

function addTeamMessage(project, message) {
  project.teamMessages.push({ id: message.id || uid('team'), createdAt: message.createdAt || Date.now(), ...message });
  project.updatedAt = new Date().toISOString();
  saveState(); renderTeam(project); renderProjectList(); updateProjectHeader(project);
}

function workflowModelIds(desired = 9) {
  const selected = [...state.selectedModels];
  if (selected.length) return selected.slice(0, 12);
  const openRouter = state.status?.openRouter;
  const usable = (openRouter?.models || []).filter((model) => model.usable && (!els.freeOnlyToggle.checked || model.free));
  const chosen = []; const authors = new Set();
  for (const model of usable) { if (chosen.length >= desired) break; if (authors.has(model.author)) continue; chosen.push(`or:${model.id}`); authors.add(model.author); }
  for (const model of usable) { if (chosen.length >= desired) break; const id = `or:${model.id}`; if (!chosen.includes(id)) chosen.push(id); }
  return chosen.length ? chosen : ['or:openrouter/free'];
}

async function executeTeamAgent(project, role, to, kind, slot, modelIds, progress, text) {
  setProgress(progress, text); setTeamStatus('working', `${role.role} working`);
  try {
    const data = await postJson('/api/team-step', { action: 'message', prompt: project.prompt, modelIds, role, to, kind, round: 1, slot, agentId: `agent-${slot + 1}`, workspace: project.teamMessages });
    recordAttempts(project, data.message?.attempts || []);
    addTeamMessage(project, data.message);
    return data.message;
  } catch (error) {
    recordAttempts(project, error.attempts || []);
    const failed = { from: role.role, to, kind: `${kind}-failed`, content: `This teammate could not complete the handoff. The project can continue using completed work. ${error.message}`, model: 'step failed', failed: true };
    addTeamMessage(project, failed);
    return failed;
  }
}

function reviewToMessage(review, meta = {}) {
  const issues = (review.issues || []).map((issue, index) => `${index + 1}. [${issue.severity.toUpperCase()}] ${issue.file}: ${issue.problem}\nFix: ${issue.fix}`).join('\n\n');
  return { from: 'QA Reviewer', to: 'Fixer Developer', kind: 'file-review', content: `${review.summary}\n\n${issues || 'No specific defects were reported.'}`, model: meta.model, provider: meta.provider, latencyMs: meta.latencyMs, attempts: meta.attempts || [] };
}

function artifactMessage(from, to, kind, content, meta = {}) {
  return { from, to, kind, content, model: meta.model || 'artifact system', provider: meta.provider, latencyMs: meta.latencyMs, attempts: meta.attempts || [], artifactEvent: true };
}

async function buildWorkflow(project) {
  const modelIds = workflowModelIds(10);
  project.status = 'building'; project.artifact = null; project.previousArtifact = null; project.teamMessages = []; project.attempts = []; project.completedModels = []; project.providers = []; project.review = null; project.validation = null; project.changes = []; project.pendingTeamNotes = [];
  updateIntegrity(project); saveState(); renderAll();

  await executeTeamAgent(project, roleDefinitions[0], roleDefinitions[1].role, 'project-brief', 0, modelIds, 8, 'Product Lead is defining the build…');
  await executeTeamAgent(project, roleDefinitions[1], roleDefinitions[2].role, 'content-handoff', 1, modelIds, 18, 'Content Strategist is writing usable copy…');
  await executeTeamAgent(project, roleDefinitions[2], roleDefinitions[3].role, 'design-handoff', 2, modelIds, 28, 'UI/UX Designer is defining the interface…');
  await executeTeamAgent(project, roleDefinitions[3], 'Frontend Developer', 'architecture-handoff', 3, modelIds, 38, 'Frontend Architect is resolving the implementation…');

  setProgress(48, 'Frontend Developer is creating real project files…'); setTeamStatus('working', 'Developer building files');
  const build = await postJson('/api/project-step', { action: 'build', prompt: project.prompt, outputFormat: state.settings.outputFormat, modelIds, slot: 4, workspace: project.teamMessages, projectName: project.title }, 76000);
  recordAttempts(project, build.attempts || []);
  project.artifact = build.project;
  project.title = build.project.projectName || project.title;
  state.activeFile = build.project.entryFile || build.project.files?.[0]?.path;
  addTeamMessage(project, artifactMessage('Frontend Developer', 'QA Reviewer', 'files-created', `Created ${build.project.files.length} actual files (${build.project.files.map((file) => file.path).join(', ')}). The files are now available in Preview, Files, and Code.`, build));
  renderPreview(project); renderFiles(project); renderCodeEditor();

  for (let round = 1; round <= state.settings.reviewRounds; round += 1) {
    setProgress(54 + (round - 1) * 18, `QA Reviewer is inspecting the actual files · round ${round}…`); setTeamStatus('working', `QA review ${round}`);
    const reviewData = await postJson('/api/project-step', { action: 'review', prompt: project.prompt, modelIds, slot: 5 + ((round - 1) * 2), workspace: project.teamMessages, project: project.artifact }, 72000);
    recordAttempts(project, reviewData.attempts || []); project.review = reviewData.review;
    addTeamMessage(project, reviewToMessage(reviewData.review, reviewData));

    if (reviewData.review.approved && !(reviewData.review.issues || []).length) break;
    setProgress(64 + (round - 1) * 18, `Fixer Developer is applying QA corrections · round ${round}…`); setTeamStatus('working', `Repairing files ${round}`);
    const before = structuredClone(project.artifact);
    const repaired = await postJson('/api/project-step', { action: 'repair', prompt: project.prompt, modelIds, slot: 6 + ((round - 1) * 2), project: project.artifact, review: reviewData.review, customInstruction: `Repair round ${round}. Resolve every concrete QA issue while preserving correct work.` }, 76000);
    recordAttempts(project, repaired.attempts || []); project.previousArtifact = before; project.artifact = repaired.project; project.changes = computeChanges(before, repaired.project);
    addTeamMessage(project, artifactMessage('Fixer Developer', round < state.settings.reviewRounds ? 'QA Reviewer' : 'Release Validator', 'files-revised', `Updated ${project.changes.length} file${project.changes.length === 1 ? '' : 's'} after QA round ${round}: ${project.changes.map((change) => change.path).join(', ') || 'no file differences detected'}.`, repaired));
    renderPreview(project); renderFiles(project); renderChanges(project);
  }

  if (state.settings.autoValidate) await validateProject(project, modelIds, 91);
  setProgress(100, 'Project files are ready.');
  project.status = 'complete'; project.updatedAt = new Date().toISOString(); updateIntegrity(project);
  addTeamMessage(project, artifactMessage('Release Packager', 'User', 'release-ready', `${project.artifact.files.length} files are ready. Preview, edit, inspect validation, and download the ZIP.`, { model: 'deterministic ZIP packager' }));
  setTeamStatus('complete', 'Project ready');
  saveState(); renderAll();
}

async function validateProject(project, modelIds = workflowModelIds(10), progress = 75) {
  if (!project?.artifact) return;
  setProgress(progress, 'Release Validator is checking the actual project…'); setTeamStatus('working', 'Validating release');
  const data = await postJson('/api/project-step', { action: 'validate', prompt: project.prompt, modelIds, slot: 9, project: project.artifact }, 70000);
  recordAttempts(project, data.attempts || []); project.validation = data.report;
  addTeamMessage(project, { from: 'Release Validator', to: 'Release Packager', kind: 'validation', content: `${data.report.passed ? 'PASS' : 'REVIEW REQUIRED'} · ${data.report.score}% deterministic score. ${data.report.ai?.summary || ''}`, model: data.model, provider: data.provider, latencyMs: data.latencyMs, attempts: data.attempts || [] });
  renderValidation();
}

async function runBuild(event) {
  event.preventDefault(); if (state.running) return;
  const prompt = els.promptInput.value.trim(); if (!prompt) return;
  showError(''); state.running = true; els.runBtn.disabled = true; els.runBtn.querySelector('span').textContent = 'Building…'; els.runProgress.classList.remove('hidden');
  const project = ensureProject(prompt);
  try { await buildWorkflow(project); els.promptInput.value = ''; updatePromptCount(); }
  catch (error) {
    project.status = 'failed'; project.updatedAt = new Date().toISOString();
    addTeamMessage(project, { from: 'Studio Runtime', to: 'User', kind: 'run-stopped', content: `The run stopped before release. Completed team messages and files were preserved. ${error.message}`, model: 'runtime', failed: true });
    recordAttempts(project, error.attempts || []); setTeamStatus('failed', 'Run stopped'); showError(error.message); saveState(); renderAll();
  } finally { state.running = false; els.runBtn.disabled = false; els.runBtn.querySelector('span').textContent = 'Build project'; updateProjectHeader(project); }
}

async function applyTeamNotes() {
  const project = activeProject(); if (!project?.artifact || !(project.pendingTeamNotes || []).length || state.running) return;
  state.running = true; els.applyTeamBtn.disabled = true; showError('');
  try {
    const modelIds = workflowModelIds(10); const before = structuredClone(project.artifact); const instruction = project.pendingTeamNotes.join('\n\n');
    setProgress(35, 'Fixer Developer is applying the latest team notes…');
    const result = await postJson('/api/project-step', { action: 'apply', prompt: project.prompt, modelIds, slot: 7, project: project.artifact, review: { approved: false, summary: 'Apply latest team notes.', issues: [] }, customInstruction: instruction }, 76000);
    recordAttempts(project, result.attempts || []); project.previousArtifact = before; project.artifact = result.project; project.changes = computeChanges(before, result.project); project.pendingTeamNotes = [];
    addTeamMessage(project, artifactMessage('Fixer Developer', 'Release Validator', 'team-notes-applied', `Applied the latest team instructions and changed ${project.changes.length} files.`, result));
    await validateProject(project, modelIds, 75); setProgress(100, 'Team changes applied.'); saveState(); renderAll();
  } catch (error) { showError(error.message); recordAttempts(project, error.attempts || []); }
  finally { state.running = false; updateProjectHeader(project); }
}

async function manualValidate() {
  const project = activeProject(); if (!project?.artifact || state.running) return;
  state.running = true; showError('');
  try { await validateProject(project); setProgress(100, 'Validation complete.'); saveState(); renderAll(); setWorkspaceTab('validation'); }
  catch (error) { showError(error.message); recordAttempts(project, error.attempts || []); }
  finally { state.running = false; updateProjectHeader(project); }
}

async function askAgent(event) {
  event.preventDefault();
  const project = activeProject(); const question = els.agentPrompt.value.trim(); const roleName = els.agentSelect.value;
  if (!project || !question || state.running) return;
  state.running = true; els.agentPrompt.value = ''; showError('');
  const role = { role: roleName, instruction: `Respond to the user's follow-up as ${roleName}. Read the existing team transcript and current project context. Give a concrete change recommendation or handoff, not a generic answer.`, deliverable: `Address this follow-up: ${question}` };
  try {
    const modelIds = workflowModelIds(10); const slot = Math.max(0, [...new Set(project.teamMessages.map((message) => message.from))].indexOf(roleName));
    const data = await postJson('/api/team-step', { action: 'message', prompt: `${project.prompt}\n\nUSER FOLLOW-UP: ${question}`, modelIds, role, to: 'User and Fixer Developer', kind: 'follow-up', round: 99, slot, agentId: uid('followup'), workspace: project.teamMessages }, 70000);
    recordAttempts(project, data.message?.attempts || []); addTeamMessage(project, data.message); project.pendingTeamNotes = [...(project.pendingTeamNotes || []), `${roleName} follow-up: ${data.message.content}`].slice(-8); saveState(); updateProjectHeader(project);
  } catch (error) { showError(error.message); recordAttempts(project, error.attempts || []); }
  finally { state.running = false; }
}

async function downloadZip() {
  const project = activeProject(); if (!canRelease(project)) return;
  els.downloadZipBtn.disabled = true; els.downloadZipBtn.textContent = 'Packaging…';
  try {
    const response = await fetch('/api/package-project', { method: 'POST', headers: apiHeaders(true), body: JSON.stringify({ projectName: project.artifact.projectName, files: project.artifact.files }) });
    if (!response.ok) { const data = await readJsonOrText(response); throw new Error(data.error || `Packaging failed (${response.status}).`); }
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${project.artifact.projectName || 'omnifusion-project'}.zip`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { showError(error.message); }
  finally { els.downloadZipBtn.textContent = 'Download ZIP'; updateProjectHeader(project); }
}

async function loadStatus() {
  try {
    const response = await fetch('/api/status', { headers: apiHeaders(false) }); const data = await readJsonOrText(response);
    if (!response.ok) throw new Error(data.error || 'Could not load the model network.');
    state.status = data; document.title = `${data.appName || 'OmniFusion'} Studio`;
    const openRouter = data.openRouter || {}; const count = openRouter.usableModelCount || openRouter.freeModelCount || 0;
    els.networkPill.classList.toggle('ready', Boolean(openRouter.configured)); els.networkPill.querySelector('span').textContent = openRouter.configured ? `${count} usable models` : 'OpenRouter key missing';
    els.sidebarModelCount.textContent = openRouter.configured ? `${count} usable models` : 'No provider configured';
    renderModels(); renderIntegrations();
  } catch (error) { els.networkPill.querySelector('span').textContent = 'Network error'; showError(error.message); }
}

function renderModels() {
  const openRouter = state.status?.openRouter; const query = els.modelSearch.value.trim().toLowerCase(); const freeOnly = els.freeOnlyToggle.checked;
  const models = (openRouter?.models || []).filter((model) => (!freeOnly || model.free) && (!query || `${model.name} ${model.id} ${model.authorName}`.toLowerCase().includes(query)));
  els.networkStats.innerHTML = openRouter ? `<span>${openRouter.modelCount || 0} catalog models</span><span>${openRouter.freeModelCount || 0} free</span><span>${openRouter.families?.length || 0} families</span>` : '';
  els.modelGrid.innerHTML = models.slice(0, 300).map((model) => {
    const id = `or:${model.id}`; const selected = state.selectedModels.has(id);
    return `<label class="model-card ${selected ? 'selected' : ''}"><input type="checkbox" value="${escapeHtml(id)}" ${selected ? 'checked' : ''}/><div class="model-card-head"><strong>${escapeHtml(model.name)}</strong>${model.free ? '<span class="free-chip">FREE</span>' : ''}</div><small>${escapeHtml(model.id)}</small><div class="model-tags">${(model.strengths || []).slice(0, 4).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div></label>`;
  }).join('') || '<div class="empty-panel">No matching models.</div>';
  $$('input[type="checkbox"]', els.modelGrid).forEach((input) => input.addEventListener('change', () => {
    if (input.checked) { if (state.selectedModels.size >= 12) { input.checked = false; showError('Select up to 12 models.'); return; } state.selectedModels.add(input.value); }
    else state.selectedModels.delete(input.value);
    input.closest('.model-card').classList.toggle('selected', input.checked); updateModelSelectionUi(); saveState();
  }));
  updateModelSelectionUi();
}

function updateModelSelectionUi() {
  const count = state.selectedModels.size;
  els.selectedModelsBtn.textContent = count ? `${count} selected models` : 'Auto models';
  els.selectedModelFooter.textContent = count ? `${count} model${count === 1 ? '' : 's'} selected` : 'Auto-selecting diverse model families';
}

function renderIntegrations() {
  const integrations = state.status?.integrations || []; const categories = [...new Set(integrations.map((item) => item.category))].sort();
  els.integrationCategory.innerHTML = '<option value="all">All categories</option>' + categories.map((category) => `<option>${escapeHtml(category)}</option>`).join(''); filterIntegrations();
}
function filterIntegrations() {
  const query = els.integrationSearch.value.trim().toLowerCase(); const category = els.integrationCategory.value;
  const items = (state.status?.integrations || []).filter((item) => (category === 'all' || item.category === category) && (!query || `${item.name} ${item.category} ${item.mode} ${(item.capabilities || []).join(' ')}`.toLowerCase().includes(query)));
  els.integrationGrid.innerHTML = items.map((item) => `<article class="integration-card"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.category)} · ${escapeHtml(item.mode)}</small><div class="model-tags">${(item.capabilities || []).slice(0, 4).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div><small>${escapeHtml(item.note || '')}</small></article>`).join('') || '<div class="empty-panel">No matching integrations.</div>';
}

function updatePromptCount() { els.promptCount.textContent = `${els.promptInput.value.length.toLocaleString()} / 12,000`; }
function openProjects() { els.projectsPanel.classList.add('open'); els.mobileOverlay.classList.add('open'); }
function closeProjects() { els.projectsPanel.classList.remove('open'); els.mobileOverlay.classList.remove('open'); }

els.buildForm.addEventListener('submit', runBuild);
els.promptInput.addEventListener('input', () => { updatePromptCount(); els.promptInput.style.height = 'auto'; els.promptInput.style.height = `${Math.min(180, els.promptInput.scrollHeight)}px`; });
els.promptInput.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); els.buildForm.requestSubmit(); } });
$$('[data-example]').forEach((button) => button.addEventListener('click', () => { els.promptInput.value = button.dataset.example; updatePromptCount(); els.promptInput.focus(); }));

$$('[data-workspace-tab]').forEach((button) => button.addEventListener('click', () => setWorkspaceTab(button.dataset.workspaceTab)));
$$('[data-device]').forEach((button) => button.addEventListener('click', () => { $$('[data-device]').forEach((item) => item.classList.toggle('active', item === button)); $('.preview-canvas').dataset.device = button.dataset.device; }));
els.openPreviewBtn.addEventListener('click', () => { const html = inlinePreview(activeProject()?.artifact); if (!html) return; const url = URL.createObjectURL(new Blob([html], { type: 'text/html' })); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000); });

els.codeFileSelect.addEventListener('change', () => { state.activeFile = els.codeFileSelect.value; renderCodeEditor(); renderFiles(activeProject()); });
els.copyCodeBtn.addEventListener('click', async () => { await navigator.clipboard.writeText(els.codeEditor.value); els.copyCodeBtn.textContent = 'Copied'; setTimeout(() => { els.copyCodeBtn.textContent = 'Copy'; }, 1000); });
els.saveCodeBtn.addEventListener('click', () => {
  const project = activeProject(); const file = project?.artifact?.files?.find((item) => item.path === state.activeFile); if (!file) return;
  const before = structuredClone(project.artifact); file.content = els.codeEditor.value; project.previousArtifact = before; project.changes = computeChanges(before, project.artifact); project.validation = null; project.updatedAt = new Date().toISOString();
  addTeamMessage(project, artifactMessage('User', 'AI Team', 'manual-file-edit', `Edited ${file.path} directly in the studio code editor.`, { model: 'human edit' })); saveState(); renderAll(); els.codeStatus.textContent = 'Saved locally';
});

els.downloadZipBtn.addEventListener('click', downloadZip); els.validateBtn.addEventListener('click', manualValidate); els.applyTeamBtn.addEventListener('click', applyTeamNotes); els.agentChatForm.addEventListener('submit', askAgent);
els.newProjectBtn.addEventListener('click', () => { createProject(); els.promptInput.focus(); });
els.clearProjectsBtn.addEventListener('click', () => { if (!confirm('Clear all locally saved projects?')) return; state.projects = []; state.activeId = null; saveState(); renderAll(); });
els.projectMenuBtn.addEventListener('click', openProjects); els.closeProjectsBtn.addEventListener('click', closeProjects); els.mobileOverlay.addEventListener('click', closeProjects);

els.settingsBtn.addEventListener('click', () => els.settingsModal.showModal()); els.modelsBtn.addEventListener('click', () => { renderModels(); els.modelsModal.showModal(); }); els.selectedModelsBtn.addEventListener('click', () => { renderModels(); els.modelsModal.showModal(); }); els.integrationsBtn.addEventListener('click', () => els.integrationsModal.showModal());
els.outputFormatBtn.addEventListener('click', () => els.settingsModal.showModal());
els.outputFormatSelect.addEventListener('change', () => { state.settings.outputFormat = els.outputFormatSelect.value; syncSettingsUi(); saveState(); });
els.reviewRoundsSelect.addEventListener('change', () => { state.settings.reviewRounds = Number(els.reviewRoundsSelect.value) === 2 ? 2 : 1; syncSettingsUi(); saveState(); });
els.minModelsSelect.addEventListener('change', () => { state.settings.minModels = Number(els.minModelsSelect.value); saveState(); updateIntegrity(activeProject()); updateProjectHeader(activeProject()); });
els.integrityModeSelect.addEventListener('change', () => { state.settings.integrityMode = els.integrityModeSelect.value; saveState(); updateProjectHeader(activeProject()); });
els.saveProjectsToggle.addEventListener('change', () => { state.settings.saveProjects = els.saveProjectsToggle.checked; saveState(); });
els.autoValidateToggle.addEventListener('change', () => { state.settings.autoValidate = els.autoValidateToggle.checked; saveState(); });
els.savePasswordBtn.addEventListener('click', () => { sessionStorage.setItem(PASSWORD_KEY, els.appPasswordInput.value); loadStatus(); });
els.clearLocalDataBtn.addEventListener('click', () => { if (!confirm('Clear projects, model choices, and settings from this browser?')) return; localStorage.removeItem(STORAGE_KEY); location.reload(); });
els.modelSearch.addEventListener('input', renderModels); els.freeOnlyToggle.addEventListener('change', renderModels); els.clearModelsBtn.addEventListener('click', () => { state.selectedModels.clear(); saveState(); renderModels(); });
els.integrationSearch.addEventListener('input', filterIntegrations); els.integrationCategory.addEventListener('change', filterIntegrations);
els.themeBtn.addEventListener('click', () => { document.documentElement.classList.toggle('light'); els.themeBtn.textContent = document.documentElement.classList.contains('light') ? '☀' : '☾'; saveState(); });

loadState(); updateModelSelectionUi(); updatePromptCount(); renderAll(); loadStatus();
