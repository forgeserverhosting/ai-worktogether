const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const STORAGE_KEY = 'omnifusion-studio-v9';
const PASSWORD_KEY = 'omnifusion-app-password';

const els = {
  networkPill: $('#networkPill'), integrityPill: $('#integrityPill'), sidebarModelCount: $('#sidebarModelCount'),
  projectMenuBtn: $('#projectMenuBtn'), projectsPanel: $('#projectsPanel'), closeProjectsBtn: $('#closeProjectsBtn'), mobileOverlay: $('#mobileOverlay'),
  projectList: $('#projectList'), newProjectBtn: $('#newProjectBtn'), websiteArchitectBtn: $('#websiteArchitectBtn'), emptyArchitectBtn: $('#emptyArchitectBtn'), emptyGeneralBtn: $('#emptyGeneralBtn'), clearProjectsBtn: $('#clearProjectsBtn'),
  projectTitle: $('#projectTitle'), projectSubtitle: $('#projectSubtitle'), projectStatusDot: $('#projectStatusDot'),
  emptyStage: $('#emptyStage'), briefingChat: $('#briefingChat'), previewStage: $('#previewStage'), emptyPreview: $('#emptyPreview'), previewFrame: $('#previewFrame'), previewLabel: $('#previewLabel'), openPreviewBtn: $('#openPreviewBtn'),
  fileTree: $('#fileTree'), fileDetail: $('#fileDetail'), fileCountBadge: $('#fileCountBadge'),
  codeFileSelect: $('#codeFileSelect'), codeStatus: $('#codeStatus'), codeEditor: $('#codeEditor'), copyCodeBtn: $('#copyCodeBtn'), saveCodeBtn: $('#saveCodeBtn'),
  changesView: $('#changesView'), changeCountBadge: $('#changeCountBadge'), validationView: $('#validationView'),
  buildForm: $('#buildForm'), promptInput: $('#promptInput'), promptCount: $('#promptCount'), promptModeLabel: $('#promptModeLabel'), runBtn: $('#runBtn'),
  runProgress: $('#runProgress'), runProgressBar: $('#runProgressBar'), runProgressText: $('#runProgressText'), errorBanner: $('#errorBanner'),
  architectChip: $('#architectChip'), outputFormatBtn: $('#outputFormatBtn'), selectedModelsBtn: $('#selectedModelsBtn'), downloadZipBtn: $('#downloadZipBtn'), validateBtn: $('#validateBtn'), applyTeamBtn: $('#applyTeamBtn'),
  teamPanel: $('#teamPanel'), teamToggleBtn: $('#teamToggleBtn'), closeTeamBtn: $('#closeTeamBtn'), teamOverlay: $('#teamOverlay'), quickManualToggle: $('#quickManualToggle'), teamStatus: $('#teamStatus'), teamSummary: $('#teamSummary'), teamFeed: $('#teamFeed'), agentChatForm: $('#agentChatForm'), agentSelect: $('#agentSelect'), agentPrompt: $('#agentPrompt'), manualCollabBar: $('#manualCollabBar'), manualStepLabel: $('#manualStepLabel'), manualDirectionInput: $('#manualDirectionInput'), nextAgentBtn: $('#nextAgentBtn'), autoContinueBtn: $('#autoContinueBtn'), openTranscriptBtn: $('#openTranscriptBtn'), transcriptModal: $('#transcriptModal'), closeTranscriptBtn: $('#closeTranscriptBtn'), transcriptStats: $('#transcriptStats'), transcriptList: $('#transcriptList'), copyTranscriptBtn: $('#copyTranscriptBtn'),
  settingsBtn: $('#settingsBtn'), settingsModal: $('#settingsModal'), outputFormatSelect: $('#outputFormatSelect'), reviewRoundsSelect: $('#reviewRoundsSelect'), minModelsSelect: $('#minModelsSelect'), integrityModeSelect: $('#integrityModeSelect'), collaborationModeSelect: $('#collaborationModeSelect'), defaultCreativitySelect: $('#defaultCreativitySelect'), saveProjectsToggle: $('#saveProjectsToggle'), autoValidateToggle: $('#autoValidateToggle'), appPasswordInput: $('#appPasswordInput'), savePasswordBtn: $('#savePasswordBtn'), clearLocalDataBtn: $('#clearLocalDataBtn'),
  modelsBtn: $('#modelsBtn'), modelsModal: $('#modelsModal'), modelSearch: $('#modelSearch'), freeOnlyToggle: $('#freeOnlyToggle'), clearModelsBtn: $('#clearModelsBtn'), networkStats: $('#networkStats'), modelGrid: $('#modelGrid'), selectedModelFooter: $('#selectedModelFooter'),
  integrationsBtn: $('#integrationsBtn'), integrationsModal: $('#integrationsModal'), integrationSearch: $('#integrationSearch'), integrationCategory: $('#integrationCategory'), integrationGrid: $('#integrationGrid'),
  themeBtn: $('#themeBtn'), sidebarModelsBtn: $('#sidebarModelsBtn'), sidebarIntegrationsBtn: $('#sidebarIntegrationsBtn'), modelsShortcutBtn: $('#modelsShortcutBtn'), architectModal: $('#architectModal'), closeArchitectBtn: $('#closeArchitectBtn'), architectProgressBar: $('#architectProgressBar'), architectQuestionStage: $('#architectQuestionStage'), architectConceptStage: $('#architectConceptStage'), architectBriefStage: $('#architectBriefStage'), architectQuestionKicker: $('#architectQuestionKicker'), architectQuestionTitle: $('#architectQuestionTitle'), architectQuestionHelp: $('#architectQuestionHelp'), architectAnswerGrid: $('#architectAnswerGrid'), architectCustomAnswer: $('#architectCustomAnswer'), architectCustomBtn: $('#architectCustomBtn'), architectBackBtn: $('#architectBackBtn'), architectSkipBtn: $('#architectSkipBtn'), conceptGrid: $('#conceptGrid'), blendConceptsBtn: $('#blendConceptsBtn'), surpriseConceptBtn: $('#surpriseConceptBtn'), approveConceptBtn: $('#approveConceptBtn'), architectBusinessInfo: $('#architectBusinessInfo'), backToConceptsBtn: $('#backToConceptsBtn'), finishArchitectBtn: $('#finishArchitectBtn')
};

const state = {
  status: null,
  selectedModels: new Set(),
  projects: [],
  activeId: null,
  running: false,
  activeWorkspaceTab: 'chat',
  activeFile: null,
  settings: {
    outputFormat: 'static', reviewRounds: 1, minModels: 3, integrityMode: 'warn', collaborationMode: 'auto', defaultCreativity: 'creative', saveProjects: true, autoValidate: true
  },
  teamFilter: 'all',
  inputMode: 'website',
  manualResolver: null,
  manualAutoContinue: false,
  architect: { step: 0, answers: {}, concepts: [], selectedConceptIds: [], prefill: '' }
};

const roleDefinitions = [
  {
    role: 'Website Strategist',
    instruction: 'Translate the user request and Website Architect answers into a factual website strategy. Define audience, conversion goal, page structure, trust requirements, factual guardrails, and what must remain a placeholder.',
    deliverable: 'A website strategy, section map, factual guardrails, conversion path, and acceptance checklist.'
  },
  {
    role: 'Conversion Copywriter',
    instruction: 'Read the Website Strategist handoff. Write concrete page copy, headlines, CTA language, service descriptions, FAQ direction, and local SEO phrasing without inventing unsupported business claims.',
    deliverable: 'Usable website copy and an information hierarchy for the creative and UX teams.'
  },
  {
    role: 'Creative Director',
    instruction: 'Read the approved design DNA and prior handoffs. Define a memorable art direction with a distinct composition, typography, palette, image treatment, signature visual motif, and motion behavior. Reject generic AI website patterns.',
    deliverable: 'A specific creative system that is visually distinctive and implementable.'
  },
  {
    role: 'UX Architect',
    instruction: 'Read the strategy, copy, and creative direction. Design the responsive conversion flow, navigation, section order, interaction states, accessibility decisions, forms, and mobile behavior.',
    deliverable: 'A responsive UX specification and component behavior handoff.'
  },
  {
    role: 'Frontend Architect',
    instruction: 'Read every earlier teammate. Resolve contradictions and convert the complete website plan into an exact file architecture, implementation checklist, technical constraints, and developer acceptance criteria.',
    deliverable: 'A file plan, component map, animation plan, and implementation acceptance checklist.'
  }
];

const generalRoleDefinitions = [
  { role: 'Project Lead', instruction: 'Translate the request into a concrete project plan, constraints, deliverables, and acceptance criteria.', deliverable: 'A practical project brief and acceptance checklist.' },
  { role: 'Research and Content Specialist', instruction: 'Read the lead handoff and produce the facts, content, structure, or domain work needed by the project.', deliverable: 'Concrete usable content and supporting decisions.' },
  { role: 'Experience Designer', instruction: 'Read prior work and define how the user should experience and interact with the deliverable.', deliverable: 'A clear experience and presentation specification.' },
  { role: 'Technical Architect', instruction: 'Resolve contradictions and turn all prior work into an exact implementation plan and file structure.', deliverable: 'A file plan, technical checklist, and implementation criteria.' }
];

const websiteQuestions = [
  {
    id: 'siteType', title: 'What are we creating?', help: 'This changes the site structure, conversion path, and specialist instructions.',
    answers: [
      { value: 'Business website', icon: '🏢', label: 'Business website', description: 'A complete service or company presence designed to build trust and generate leads.' },
      { value: 'Landing page', icon: '🎯', label: 'Landing page', description: 'A focused one-page experience built around one offer or campaign.' },
      { value: 'Online store', icon: '🛍', label: 'Online store', description: 'A product-led storefront with discovery, trust, and purchase flows.' }
    ]
  },
  {
    id: 'goal', title: 'What should the website accomplish first?', help: 'The primary action controls the layout and content hierarchy.',
    answers: (a) => a.siteType === 'Online store' ? [
      { value: 'Drive purchases', icon: '⚡', label: 'Drive purchases', description: 'Move visitors from discovery to checkout quickly.' },
      { value: 'Showcase a catalog', icon: '▦', label: 'Showcase the catalog', description: 'Make product browsing and comparison the main experience.' },
      { value: 'Build premium brand value', icon: '✦', label: 'Build premium value', description: 'Use storytelling and presentation to justify quality and price.' }
    ] : [
      { value: 'Get phone calls', icon: '☎', label: 'Get phone calls', description: 'Prioritize click-to-call actions and immediate service confidence.' },
      { value: 'Collect estimate requests', icon: '✉', label: 'Collect estimates', description: 'Guide visitors toward a short, persuasive inquiry form.' },
      { value: 'Build trust and showcase work', icon: '★', label: 'Build trust', description: 'Lead with credibility, process, proof, and project presentation.' }
    ]
  },
  {
    id: 'personality', title: 'How should the brand feel?', help: 'Choose the emotional impression visitors should get in the first five seconds.',
    answers: [
      { value: 'Premium and established', icon: '◆', label: 'Premium & established', description: 'Confident typography, restraint, polished details, and strong hierarchy.' },
      { value: 'Friendly and local', icon: '☀', label: 'Friendly & local', description: 'Warm, approachable, community-focused, and easy to understand.' },
      { value: 'Bold and energetic', icon: '↗', label: 'Bold & energetic', description: 'High contrast, expressive type, movement, and memorable calls to action.' }
    ]
  },
  {
    id: 'visualDirection', title: 'Choose a visual direction', help: 'This becomes the starting point for the three concepts.',
    answers: [
      { value: 'Cinematic and immersive', icon: '◉', label: 'Cinematic', description: 'Large imagery, dramatic crops, layered depth, and story-led scrolling.' },
      { value: 'Clean editorial modernism', icon: '▤', label: 'Editorial modern', description: 'Strong grid, typography-led sections, whitespace, and precise visual rhythm.' },
      { value: 'Creative and interactive', icon: '✣', label: 'Creative interactive', description: 'Distinctive compositions, unexpected transitions, and signature interactions.' }
    ]
  },
  {
    id: 'layout', title: 'How unusual should the layout be?', help: 'The reviewer will use this to reject designs that are too generic or too risky.',
    answers: [
      { value: 'Familiar but polished', icon: '▦', label: 'Familiar', description: 'Conventional patterns elevated by excellent execution.' },
      { value: 'Distinctive and memorable', icon: '◇', label: 'Distinctive', description: 'Fresh composition without sacrificing clarity or conversion.' },
      { value: 'Experimental and surprising', icon: '⌁', label: 'Experimental', description: 'Unusual structure and interaction while remaining usable.' }
    ]
  },
  {
    id: 'motion', title: 'How much movement should it have?', help: 'Motion should support attention and storytelling, not slow the website down.',
    answers: [
      { value: 'Minimal and elegant motion', icon: '—', label: 'Minimal', description: 'Subtle fades, hover feedback, and restrained transitions.' },
      { value: 'Smooth scroll storytelling', icon: '≈', label: 'Smooth', description: 'Section reveals, counters, layered movement, and gentle depth.' },
      { value: 'Advanced interactive motion', icon: '∞', label: 'Advanced', description: 'Rich interactions, animated compositions, and memorable transitions.' }
    ]
  },
  {
    id: 'density', title: 'How much information should visitors see?', help: 'This sets the visual density and pacing.',
    answers: [
      { value: 'Minimal and focused', icon: '·', label: 'Minimal', description: 'Short copy, large visuals, and one clear action at a time.' },
      { value: 'Balanced and complete', icon: '≡', label: 'Balanced', description: 'Enough detail to answer questions without feeling crowded.' },
      { value: 'Rich and informative', icon: '▥', label: 'Information-rich', description: 'Detailed services, process, proof, FAQs, and supporting content.' }
    ]
  },
  {
    id: 'creativity', title: 'How far should the Creative Director push it?', help: 'This controls how aggressively the team avoids familiar website patterns.',
    answers: [
      { value: 'Safe', icon: '○', label: 'Safe', description: 'Reliable patterns, strong polish, and low visual risk.' },
      { value: 'Creative', icon: '✦', label: 'Creative', description: 'Distinctive and memorable while keeping conversion clear.' },
      { value: 'Experimental', icon: '✺', label: 'Experimental', description: 'Push composition, motion, and interaction into unusual territory.' }
    ]
  },
  {
    id: 'imagery', title: 'What should the visual content feel like?', help: 'The generated site will use placeholders when real assets are not supplied.',
    answers: [
      { value: 'Authentic real photography', icon: '▣', label: 'Real photography', description: 'Natural project, people, place, or product imagery with credible direction.' },
      { value: 'Editorial art direction', icon: '◫', label: 'Editorial', description: 'Stylized crops, typography overlays, and magazine-like composition.' },
      { value: 'Abstract branded graphics', icon: '◌', label: 'Abstract graphics', description: 'Shapes, textures, diagrams, and custom visual motifs instead of stock photos.' }
    ]
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

function appPassword() { try { return sessionStorage.getItem(PASSWORD_KEY) || ''; } catch { return ''; } }
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
  els.collaborationModeSelect.value = state.settings.collaborationMode;
  els.defaultCreativitySelect.value = state.settings.defaultCreativity;
  els.saveProjectsToggle.checked = state.settings.saveProjects;
  els.autoValidateToggle.checked = state.settings.autoValidate;
  els.outputFormatBtn.textContent = formatLabel(state.settings.outputFormat);
  els.promptModeLabel.textContent = state.inputMode === 'general' ? 'General AI' : `Website mode · ${state.settings.collaborationMode === 'manual' ? 'manual team' : 'automatic team'}`;
  if (els.quickManualToggle) els.quickManualToggle.checked = state.settings.collaborationMode === 'manual';
}

function formatLabel(value) {
  return ({ static: 'Static multi-file', 'single-html': 'Single index.html', nextjs: 'Next.js project', auto: 'Auto format' })[value] || 'Static multi-file';
}


function resetArchitect(prefill = '') {
  state.architect = { step: 0, answers: { creativity: ({ safe: 'Safe', creative: 'Creative', experimental: 'Experimental' })[state.settings.defaultCreativity] || 'Creative' }, concepts: [], selectedConceptIds: [], prefill };
  els.architectBusinessInfo.value = prefill;
  els.architectCustomAnswer.value = '';
  els.architectQuestionStage.classList.remove('hidden');
  els.architectConceptStage.classList.add('hidden');
  els.architectBriefStage.classList.add('hidden');
  renderArchitectQuestion();
}

function openArchitect(prefill = '') {
  resetArchitect(prefill || els.promptInput.value.trim());
  els.architectModal.showModal();
}

function questionAnswers(question) {
  return typeof question.answers === 'function' ? question.answers(state.architect.answers) : question.answers;
}

function renderArchitectQuestion() {
  const step = Math.max(0, Math.min(websiteQuestions.length - 1, state.architect.step));
  const question = websiteQuestions[step];
  const answers = questionAnswers(question);
  els.architectQuestionKicker.textContent = `Question ${step + 1} of ${websiteQuestions.length}`;
  els.architectQuestionTitle.textContent = question.title;
  els.architectQuestionHelp.textContent = question.help;
  els.architectProgressBar.style.width = `${Math.round(((step + 1) / (websiteQuestions.length + 2)) * 100)}%`;
  els.architectBackBtn.disabled = step === 0;
  els.architectAnswerGrid.innerHTML = answers.map((answer, index) => {
    const selected = state.architect.answers[question.id] === answer.value;
    const glows = ['rgba(155,140,255,.22)', 'rgba(104,184,255,.2)', 'rgba(76,228,210,.2)'];
    return `<button type="button" class="answer-card ${selected ? 'selected' : ''}" data-architect-answer="${escapeHtml(answer.value)}" style="--answer-glow:${glows[index % glows.length]}"><span class="answer-icon">${escapeHtml(answer.icon)}</span><strong>${escapeHtml(answer.label)}</strong><small>${escapeHtml(answer.description)}</small></button>`;
  }).join('');
  $$('[data-architect-answer]', els.architectAnswerGrid).forEach((button) => button.addEventListener('click', () => chooseArchitectAnswer(button.dataset.architectAnswer)));
  els.architectCustomAnswer.value = '';
}

function chooseArchitectAnswer(value) {
  const question = websiteQuestions[state.architect.step];
  state.architect.answers[question.id] = value;
  if (state.architect.step < websiteQuestions.length - 1) {
    state.architect.step += 1;
    renderArchitectQuestion();
  } else generateWebsiteConcepts();
}

function profileSummary(answers = state.architect.answers) {
  return websiteQuestions.map((question) => `${question.title}: ${answers[question.id] || 'Open to Creative Director recommendation'}`).join('\n');
}

function fallbackConcepts() {
  const a = state.architect.answers;
  const energy = a.personality || 'Premium and established';
  return [
    {
      id: 'signature-geometry', name: 'Signature Geometry', tagline: 'A conversion-first identity built around one memorable visual system.',
      palette: ['#0c1324', '#f4f1e9', '#f28b43'], layout: 'Asymmetric editorial grid with oversized type and diagonal project reveals',
      motion: a.motion || 'Smooth scroll storytelling', signature: 'A custom framed-corner motif that becomes navigation, image masks, and section dividers',
      why: `Fits the ${energy.toLowerCase()} direction while avoiding generic card-grid layouts.`
    },
    {
      id: 'human-proof', name: 'Human Proof', tagline: 'Warm local credibility presented like a premium field journal.',
      palette: ['#f5efe4', '#17211d', '#c96f3b'], layout: 'Story-led split screens, process timeline, and tactile project notes',
      motion: 'Subtle image reveals, handoff lines, and tactile hover states', signature: 'Project-stamp system with annotated before/after frames',
      why: 'Makes services feel real and trustworthy without relying on invented reviews or stock claims.'
    },
    {
      id: 'kinetic-monument', name: 'Kinetic Monument', tagline: 'Bold digital presence with strong motion and an unmistakable first screen.',
      palette: ['#080a0f', '#d8ff4f', '#e9edf6'], layout: 'Full-bleed modular canvas with horizontal service stories and sticky conversion rail',
      motion: a.motion === 'Minimal and elegant motion' ? 'Restrained kinetic typography and cursor-responsive accents' : 'Layered scroll choreography with kinetic typography',
      signature: 'A living service map that changes as visitors move through the page',
      why: 'Best when memorability and visual differentiation are more important than conventional presentation.'
    }
  ];
}

async function generateWebsiteConcepts() {
  els.architectQuestionStage.classList.add('hidden');
  els.architectConceptStage.classList.remove('hidden');
  els.architectBriefStage.classList.add('hidden');
  els.architectProgressBar.style.width = '82%';
  els.conceptGrid.innerHTML = '<div class="empty-panel">Creative Director is generating three distinct design systems…</div>';
  els.approveConceptBtn.disabled = true;
  try {
    const data = await postJson('/api/project-step', {
      action: 'concepts',
      prompt: state.architect.prefill || 'Create a distinctive website.',
      profile: state.architect.answers,
      modelIds: workflowModelIds(5),
      slot: 0
    }, 65000);
    state.architect.concepts = Array.isArray(data.concepts) && data.concepts.length >= 3 ? data.concepts.slice(0, 3) : fallbackConcepts();
  } catch (error) {
    state.architect.concepts = fallbackConcepts();
    showError(`Concept AI fallback used: ${error.message}`);
  }
  state.architect.selectedConceptIds = [];
  renderConcepts();
}


const conversationalQuestionIds = ['goal', 'personality', 'visualDirection', 'motion'];

function conversationalQuestions() {
  return conversationalQuestionIds.map((id) => websiteQuestions.find((question) => question.id === id)).filter(Boolean);
}

function inferSiteType(info = '') {
  const text = String(info).toLowerCase();
  if (/shop|store|product|checkout|e-?commerce|catalog/.test(text)) return 'Online store';
  if (/portfolio|photographer|artist|designer|creative work/.test(text)) return 'Portfolio website';
  if (/landing page|campaign|single offer|waitlist/.test(text)) return 'Landing page';
  return 'Business website';
}

function intakeProjectTitle(info = '') {
  const lines = String(info).split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const first = lines[0] || 'New website';
  return first.replace(/^build (a|the)?\s*website (for|about)?\s*/i, '').replace(/[.:;,]+$/, '').slice(0, 48) || 'New website';
}

function intakeMessage(role, content, meta = {}) {
  return { id: uid('chat'), role, content, createdAt: Date.now(), ...meta };
}

function startWebsiteIntake(info) {
  let project = activeProject();
  if (!project || project.status !== 'draft' || project.prompt || project.intake || project.artifact) project = createProject(info);
  project.prompt = info;
  project.mode = 'website';
  project.title = intakeProjectTitle(info);
  project.status = 'briefing';
  project.intake = {
    businessInfo: info,
    step: 0,
    stage: 'questions',
    answers: {
      siteType: inferSiteType(info),
      creativity: ({ safe: 'Safe', creative: 'Creative', experimental: 'Experimental' })[state.settings.defaultCreativity] || 'Creative'
    },
    concepts: [],
    selectedConceptId: null,
    messages: [
      intakeMessage('user', info),
      intakeMessage('assistant', 'Got it. I’ll use those facts and ask only a few creative questions before the team starts building.')
    ]
  };
  state.activeWorkspaceTab = 'chat';
  saveState();
  renderAll();
  requestAnimationFrame(() => els.briefingChat?.scrollTo({ top: els.briefingChat.scrollHeight, behavior: 'smooth' }));
  return project;
}

function currentIntakeQuestion(project = activeProject()) {
  const intake = project?.intake;
  if (!intake || intake.stage !== 'questions') return null;
  return conversationalQuestions()[intake.step] || null;
}

async function answerIntakeQuestion(value) {
  const project = activeProject();
  const intake = project?.intake;
  const question = currentIntakeQuestion(project);
  const answer = String(value || '').trim();
  if (!intake || !question || !answer) return;
  intake.answers[question.id] = answer;
  intake.messages.push(intakeMessage('assistant', question.title, { compact: true }));
  intake.messages.push(intakeMessage('user', answer, { compact: true }));
  intake.step += 1;
  if (intake.step >= conversationalQuestions().length) {
    intake.stage = 'generating-concepts';
    saveState(); renderBriefing(project);
    await generateConversationalConcepts(project);
    return;
  }
  saveState(); renderBriefing(project);
}

async function generateConversationalConcepts(project) {
  const intake = project?.intake;
  if (!intake) return;
  intake.stage = 'generating-concepts';
  saveState(); renderBriefing(project);
  try {
    const data = await postJson('/api/project-step', {
      action: 'concepts',
      prompt: intake.businessInfo || project.prompt || 'Create a distinctive website.',
      profile: intake.answers,
      modelIds: workflowModelIds(5),
      slot: 0
    }, 65000);
    intake.concepts = Array.isArray(data.concepts) && data.concepts.length >= 3 ? data.concepts.slice(0, 3) : fallbackConceptsFor(intake.answers);
  } catch (error) {
    intake.concepts = fallbackConceptsFor(intake.answers);
    intake.conceptWarning = error.message;
  }
  intake.stage = 'concepts';
  saveState(); renderBriefing(project);
}

function fallbackConceptsFor(answers = {}) {
  const previous = state.architect.answers;
  state.architect.answers = answers;
  const concepts = fallbackConcepts();
  state.architect.answers = previous;
  return concepts;
}

function selectedIntakeConcept(project = activeProject()) {
  const intake = project?.intake;
  return intake?.concepts?.find((concept) => concept.id === intake.selectedConceptId) || null;
}

function selectIntakeConcept(id) {
  const project = activeProject();
  if (!project?.intake) return;
  const concept = project.intake.concepts.find((item) => item.id === id);
  if (!concept) return;
  project.intake.selectedConceptId = id;
  project.intake.stage = 'ready';
  project.intake.messages.push(intakeMessage('user', `Use the “${concept.name}” direction.`, { compact: true }));
  project.intake.messages.push(intakeMessage('assistant', 'Perfect. The brief is ready. Start the build and you can watch every AI handoff from the Team button.'));
  saveState(); renderBriefing(project);
}

function profileSummaryFromAnswers(answers = {}) {
  return conversationalQuestions().map((question) => `${question.title}: ${answers[question.id] || 'Creative Director recommendation'}`).join('\n');
}

function buildConversationalPrompt(project) {
  const intake = project.intake;
  const concept = selectedIntakeConcept(project) || intake.concepts?.[0] || fallbackConceptsFor(intake.answers)[0];
  return `Build a complete, production-ready website.\n\nVERIFIED BUSINESS / PROJECT INFORMATION:\n${intake.businessInfo}\n\nWEBSITE DIRECTION:\nSite type: ${intake.answers.siteType || 'Business website'}\n${profileSummaryFromAnswers(intake.answers)}\nCreativity level: ${intake.answers.creativity || 'Creative'}\n\nAPPROVED DESIGN DNA:\nName: ${concept.name}\nConcept: ${concept.tagline || concept.why || ''}\nPalette direction: ${(concept.palette || []).join(', ')}\nLayout system: ${concept.layout || 'Distinctive responsive layout'}\nMotion system: ${concept.motion || 'Purposeful motion'}\nSignature visual idea: ${concept.signature || 'Create a project-specific motif'}\nWhy it fits: ${concept.why || 'It matches the requested business and creative direction.'}\n\nNON-NEGOTIABLE BUILD RULES:\n- Produce actual deployable files, a working preview, validation, and a downloadable ZIP.\n- Do not merely describe what was created.\n- Do not invent licenses, addresses, prices, guarantees, reviews, ratings, years in business, team members, or completed projects.\n- Avoid generic AI website patterns and repeated template compositions.\n- Create a unique visual motif tied to this project and use it consistently.\n- Make the mobile experience intentional, accessible, fast, and conversion-focused.`;
}

async function runPreparedWebsite(project = activeProject()) {
  if (!project?.intake || state.running) return;
  const concept = selectedIntakeConcept(project) || project.intake.concepts?.[0];
  if (!concept) return;
  showError('');
  state.running = true;
  els.runBtn.disabled = true;
  els.runBtn.querySelector('span').textContent = 'Working';
  els.runProgress.classList.remove('hidden');
  project.websiteProfile = structuredClone(project.intake.answers);
  project.designConcept = structuredClone(concept);
  project.prompt = buildConversationalPrompt(project);
  project.intake.stage = 'building';
  project.status = 'building';
  saveState(); renderAll();
  if (state.settings.collaborationMode === 'manual') openTeamPanel();
  try {
    await buildWorkflow(project);
    project.intake.stage = 'complete';
    saveState(); renderAll();
    setWorkspaceTab('preview');
  } catch (error) {
    project.status = 'failed';
    project.intake.stage = 'failed';
    project.updatedAt = new Date().toISOString();
    addTeamMessage(project, { from: 'Studio Runtime', to: 'User', kind: 'run-stopped', content: `The run stopped before release. Completed team messages and files were preserved. ${error.message}`, model: 'runtime', failed: true });
    recordAttempts(project, error.attempts || []);
    setTeamStatus('failed', 'Run stopped');
    showError(error.message);
    saveState(); renderAll();
  } finally {
    state.running = false;
    els.runBtn.disabled = false;
    els.runBtn.querySelector('span').textContent = 'Send';
    updateProjectHeader(project);
  }
}

function renderIntakeMessages(messages = []) {
  return messages.map((message) => `<div class="chat-message ${message.role === 'user' ? 'user' : 'assistant'} ${message.compact ? 'compact' : ''}"><div class="chat-avatar">${message.role === 'user' ? 'You' : 'OF'}</div><div class="chat-bubble"><p>${escapeHtml(message.content)}</p></div></div>`).join('');
}

function renderBriefing(project = activeProject()) {
  if (!els.briefingChat) return;
  const intake = project?.intake;
  if (!intake) {
    els.emptyStage.classList.remove('hidden');
    els.briefingChat.classList.add('hidden');
    els.briefingChat.innerHTML = '';
    return;
  }
  els.emptyStage.classList.add('hidden');
  els.briefingChat.classList.remove('hidden');
  let extra = '';
  if (intake.stage === 'questions') {
    const question = currentIntakeQuestion(project);
    const answers = question ? (typeof question.answers === 'function' ? question.answers(intake.answers) : question.answers) : [];
    extra = question ? `<section class="inline-question-card"><div class="inline-question-head"><span>Quick question</span><small>${intake.step + 1} of ${conversationalQuestions().length}</small></div><h3>${escapeHtml(question.title)}</h3><p class="question-help">${escapeHtml(question.help)}</p><div class="inline-answer-grid">${answers.slice(0,3).map((answer) => `<button class="inline-answer" data-intake-answer="${escapeHtml(answer.value)}"><b>${escapeHtml(answer.icon)}</b><strong>${escapeHtml(answer.label)}</strong><small>${escapeHtml(answer.description)}</small></button>`).join('')}</div><div class="inline-custom-row"><input id="inlineCustomAnswer" maxlength="500" placeholder="Or type your own answer…"><button class="ghost-btn" id="inlineCustomSend" type="button">Use answer</button><button class="text-link" id="inlineSkip" type="button">You decide</button></div></section>` : '';
  } else if (intake.stage === 'generating-concepts') {
    extra = `<div class="chat-message assistant"><div class="chat-avatar">OF</div><div class="chat-bubble"><strong>Creative Director</strong><p>Creating three different directions… <span class="typing-dots"><i></i><i></i><i></i></span></p></div></div>`;
  } else if (intake.stage === 'concepts') {
    extra = `<section class="inline-concepts"><div class="chat-message assistant"><div class="chat-avatar">OF</div><div class="chat-bubble"><strong>Choose a direction</strong><p>Pick the one that feels closest. The team will make it unique to this business.</p></div></div><div class="inline-concept-grid">${(intake.concepts || []).map((concept, index) => `<button class="inline-concept" data-intake-concept="${escapeHtml(concept.id)}"><div class="inline-concept-visual" style="${conceptVisualStyle(concept,index)}"><span>Concept ${String.fromCharCode(65+index)}</span></div><div class="inline-concept-copy"><strong>${escapeHtml(concept.name)}</strong><small>${escapeHtml(concept.tagline || concept.why || '')}</small></div></button>`).join('')}</div><div class="inline-concept-actions"><button class="ghost-btn" id="surpriseInlineConcept" type="button">Surprise me</button></div></section>`;
  } else if (intake.stage === 'ready') {
    const concept = selectedIntakeConcept(project);
    extra = `<section class="brief-ready-card"><h3>Ready to build</h3><p><strong>${escapeHtml(concept?.name || 'Selected direction')}</strong> · The team will create real files, review them, fix problems, validate the result, and prepare a ZIP.</p><div class="brief-ready-meta"><span>${escapeHtml(intake.answers.siteType || 'Website')}</span><span>${escapeHtml(intake.answers.personality || 'Custom brand')}</span><span>${escapeHtml(intake.answers.motion || 'Purposeful motion')}</span></div><div class="brief-ready-actions"><button class="ghost-btn" id="changeConceptBtn" type="button">Change direction</button><button class="primary-btn" id="buildPreparedBtn" type="button">Build website →</button></div></section>`;
  } else if (intake.stage === 'building') {
    extra = `<section class="build-chat-card"><span class="spinner"></span><div><strong>The AI team is building the website</strong><small>Open Team to watch every real handoff and model response.</small></div><button class="ghost-btn" id="watchTeamBtn" type="button">Watch team</button></section>`;
  } else if (intake.stage === 'complete' && project.artifact) {
    extra = `<section class="release-chat-card"><div class="release-check">✓</div><div><strong>${escapeHtml(project.artifact.projectName || project.title)} is ready</strong><small>${project.artifact.files?.length || 0} real files · preview, edit, or download the ZIP.</small></div><div><button class="ghost-btn" id="openResultTeamBtn" type="button">AI team</button><button class="ghost-btn" id="openResultFilesBtn" type="button">Files</button><button class="primary-btn compact" id="openResultPreviewBtn" type="button">Preview</button></div></section>`;
  } else if (intake.stage === 'failed') {
    extra = `<section class="release-chat-card failed"><div class="release-check">!</div><div><strong>The build stopped</strong><small>Completed messages and files were preserved. Open Team to see exactly where it stopped.</small></div><button class="ghost-btn" id="watchTeamBtn" type="button">Open team</button></section>`;
  }
  els.briefingChat.innerHTML = `<div class="briefing-thread">${renderIntakeMessages(intake.messages || [])}${extra}</div>`;
  $$('[data-intake-answer]', els.briefingChat).forEach((button) => button.addEventListener('click', () => answerIntakeQuestion(button.dataset.intakeAnswer)));
  $$('[data-intake-concept]', els.briefingChat).forEach((button) => button.addEventListener('click', () => selectIntakeConcept(button.dataset.intakeConcept)));
  const custom = $('#inlineCustomAnswer', els.briefingChat);
  const send = $('#inlineCustomSend', els.briefingChat);
  if (send && custom) send.addEventListener('click', () => answerIntakeQuestion(custom.value));
  if (custom) custom.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); answerIntakeQuestion(custom.value); } });
  $('#inlineSkip', els.briefingChat)?.addEventListener('click', () => answerIntakeQuestion('Creative Director recommendation'));
  $('#surpriseInlineConcept', els.briefingChat)?.addEventListener('click', () => { const items = intake.concepts || []; if (items.length) selectIntakeConcept(items[Math.floor(Math.random() * items.length)].id); });
  $('#changeConceptBtn', els.briefingChat)?.addEventListener('click', () => { intake.stage = 'concepts'; saveState(); renderBriefing(project); });
  $('#buildPreparedBtn', els.briefingChat)?.addEventListener('click', () => runPreparedWebsite(project));
  $('#watchTeamBtn', els.briefingChat)?.addEventListener('click', openTeamPanel);
  $('#openResultTeamBtn', els.briefingChat)?.addEventListener('click', openTeamPanel);
  $('#openResultFilesBtn', els.briefingChat)?.addEventListener('click', () => setWorkspaceTab('files'));
  $('#openResultPreviewBtn', els.briefingChat)?.addEventListener('click', () => setWorkspaceTab('preview'));
  requestAnimationFrame(() => { els.briefingChat.scrollTop = els.briefingChat.scrollHeight; });
}

function openTeamPanel() {
  els.teamPanel?.classList.add('open');
  els.teamOverlay?.classList.add('open');
}

function closeTeamPanel() {
  els.teamPanel?.classList.remove('open');
  els.teamOverlay?.classList.remove('open');
}

function conceptVisualStyle(concept, index) {
  const colors = Array.isArray(concept.palette) ? concept.palette : [];
  const safe = (value, fallback) => /^#[0-9a-f]{3,8}$/i.test(String(value || '')) ? String(value) : fallback;
  const a = safe(colors[0], ['#1c2440', '#18261f', '#21172e'][index % 3]);
  const b = safe(colors[1], ['#8c7cff', '#f0b16c', '#5fddce'][index % 3]);
  return `--concept-bg:linear-gradient(135deg,${a},${b});--concept-accent:${safe(colors[2], '#ffffff')}`;
}

function renderConcepts() {
  els.conceptGrid.innerHTML = state.architect.concepts.map((concept, index) => {
    const selected = state.architect.selectedConceptIds.includes(concept.id);
    const tags = [concept.layout, concept.motion, concept.signature].filter(Boolean).map((v) => String(v).split(' ').slice(0, 3).join(' '));
    return `<article class="concept-card ${selected ? 'selected' : ''}" data-concept-id="${escapeHtml(concept.id)}"><div class="concept-visual" style="${conceptVisualStyle(concept, index)}"><span>Concept ${String.fromCharCode(65 + index)}</span></div><div class="concept-copy"><strong>${escapeHtml(concept.name)}</strong><small>${escapeHtml(concept.tagline || concept.why || '')}</small><div class="concept-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div></div></article>`;
  }).join('');
  $$('[data-concept-id]', els.conceptGrid).forEach((card) => card.addEventListener('click', () => {
    const id = card.dataset.conceptId;
    if (state.architect.selectedConceptIds.includes(id)) state.architect.selectedConceptIds = state.architect.selectedConceptIds.filter((item) => item !== id);
    else state.architect.selectedConceptIds = [...state.architect.selectedConceptIds, id].slice(-2);
    renderConcepts();
  }));
  els.approveConceptBtn.disabled = state.architect.selectedConceptIds.length !== 1;
}

function selectedConcept() {
  const selected = state.architect.concepts.filter((concept) => state.architect.selectedConceptIds.includes(concept.id));
  if (selected.length === 1) return selected[0];
  if (selected.length > 1) return {
    id: 'blended-direction', name: `${selected[0].name} × ${selected[1].name}`, tagline: 'A deliberate hybrid of the selected concepts.',
    palette: [...new Set(selected.flatMap((item) => item.palette || []))].slice(0, 4),
    layout: `${selected[0].layout}; blended with ${selected[1].layout}`,
    motion: `${selected[0].motion}; selectively combined with ${selected[1].motion}`,
    signature: `${selected[0].signature}; fused with ${selected[1].signature}`,
    why: 'The Creative Director should combine the strongest compatible elements without creating visual clutter.'
  };
  return null;
}

function showArchitectBrief() {
  const concept = selectedConcept();
  if (!concept) return;
  state.architect.approvedConcept = concept;
  els.architectConceptStage.classList.add('hidden');
  els.architectQuestionStage.classList.add('hidden');
  els.architectBriefStage.classList.remove('hidden');
  els.architectProgressBar.style.width = '94%';
  if (!els.architectBusinessInfo.value) els.architectBusinessInfo.value = state.architect.prefill;
}

function buildArchitectPrompt() {
  const concept = state.architect.approvedConcept || selectedConcept() || fallbackConcepts()[0];
  const business = (els.architectBusinessInfo.value.trim() || state.architect.prefill || 'No business facts were supplied. Use clearly labeled placeholders for missing information.').slice(0, 8000);
  return `Build a complete, production-ready website.\n\nVERIFIED BUSINESS / PROJECT INFORMATION:\n${business}\n\nWEBSITE ARCHITECT PROFILE:\n${profileSummary()}\nCreativity level: ${state.architect.answers.creativity || state.settings.defaultCreativity}\n\nAPPROVED DESIGN DNA:\nName: ${concept.name}\nConcept: ${concept.tagline}\nPalette direction: ${(concept.palette || []).join(', ')}\nLayout system: ${concept.layout}\nMotion system: ${concept.motion}\nSignature visual idea: ${concept.signature}\nWhy it fits: ${concept.why}\n\nNON-NEGOTIABLE BUILD RULES:\n- Produce actual deployable files, a working preview, validation, and a downloadable ZIP.\n- Do not merely describe the website.\n- Do not invent licenses, addresses, prices, guarantees, reviews, ratings, years in business, team members, or completed projects.\n- Avoid generic AI website patterns: no automatic purple-gradient hero, no repetitive three-card service grid as the main idea, no meaningless floating blobs, and no copied template composition.\n- Create a unique visual motif tied to this project and use it consistently across navigation, sections, imagery, and interactions.\n- Make the mobile experience intentional, accessible, fast, and conversion-focused.`;
}

function finishArchitect() {
  const prompt = buildArchitectPrompt();
  els.promptInput.value = prompt;
  updatePromptCount();
  const project = createProject(prompt);
  project.mode = 'website';
  project.websiteProfile = structuredClone(state.architect.answers);
  project.designConcept = structuredClone(state.architect.approvedConcept || selectedConcept());
  project.title = (els.architectBusinessInfo.value.trim().split('\n')[0] || project.designConcept?.name || 'Website project').slice(0, 48);
  saveState(); renderAll();
  els.architectModal.close();
  els.promptInput.focus();
  setProgress(0, 'Website brief ready. Click Build website when you are ready.');
}

function transcriptText(project = activeProject()) {
  return (project?.teamMessages || []).map((message, index) => `[${index + 1}] ${message.from} → ${message.to || 'Team'}\nType: ${message.kind || 'handoff'}\nModel: ${message.model || 'system'}\nTime: ${new Date(message.createdAt || Date.now()).toISOString()}\n\n${message.content || ''}`).join('\n\n==============================\n\n');
}

function renderTranscript() {
  const project = activeProject();
  const messages = project?.teamMessages || [];
  els.transcriptStats.textContent = `${messages.length} visible message${messages.length === 1 ? '' : 's'} · ${project?.completedModels?.length || 0} distinct model${project?.completedModels?.length === 1 ? '' : 's'}`;
  els.transcriptList.innerHTML = messages.length ? messages.map((message) => {
    const attempts = (message.attempts || []).map((attempt) => `${attempt.success ? '✓' : '×'} ${escapeHtml(attempt.providerName || attempt.providerId || 'provider')} · ${escapeHtml(attempt.actualModel || attempt.requestedModel || 'model')}${attempt.latencyMs ? ` · ${(attempt.latencyMs / 1000).toFixed(1)}s` : ''}`).join('<br>');
    return `<article class="transcript-item ${message.failed ? 'failed' : ''}"><div class="transcript-meta"><strong>${escapeHtml(message.from)} → ${escapeHtml(message.to || 'Team')}</strong><small>${escapeHtml(message.kind || 'handoff')}</small><small>${escapeHtml(message.model || 'system')}</small><small>${escapeHtml(message.provider || '')}</small><small>${new Date(message.createdAt || Date.now()).toLocaleString()}</small>${attempts ? `<small>Attempts:<br>${attempts}</small>` : ''}</div><div class="transcript-content">${escapeHtml(message.content || '')}</div></article>`;
  }).join('') : '<div class="empty-panel">No AI conversation yet.</div>';
}

function openTranscript() { renderTranscript(); els.transcriptModal.showModal(); }

function messageMatchesFilter(message, filter = state.teamFilter) {
  if (filter === 'all') return true;
  if (filter === 'errors') return Boolean(message.failed) || /failed|stopped|error/i.test(message.kind || '');
  if (filter === 'files') return Boolean(message.artifactEvent) || /file|validation|release|edit/i.test(message.kind || '');
  return !message.artifactEvent && !message.failed;
}

function waitForManualAdvance(label) {
  if (state.settings.collaborationMode !== 'manual' || state.manualAutoContinue) return Promise.resolve();
  els.manualCollabBar.classList.remove('hidden');
  els.manualStepLabel.textContent = label;
  els.nextAgentBtn.disabled = false;
  setTeamStatus('working', 'Waiting for you');
  return new Promise((resolve) => { state.manualResolver = resolve; });
}

function releaseManualStep(auto = false) {
  const direction = els.manualDirectionInput.value.trim();
  const project = activeProject();
  if (direction && project) {
    addTeamMessage(project, { from: 'User', to: 'Next AI teammate', kind: 'manual-direction', content: direction, model: 'human direction', provider: 'user' });
    els.manualDirectionInput.value = '';
  }
  if (auto) state.manualAutoContinue = true;
  const resolver = state.manualResolver;
  state.manualResolver = null;
  els.nextAgentBtn.disabled = true;
  els.manualCollabBar.classList.add('hidden');
  if (resolver) resolver();
}

function activeProject() { return state.projects.find((project) => project.id === state.activeId) || null; }

function createProject(prompt = '') {
  const project = {
    id: uid('project'), title: prompt ? prompt.slice(0, 48) : 'Untitled project', prompt, mode: 'general', status: 'draft',
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
  if (/website|web site|landing page|online store|portfolio|homepage/i.test(prompt)) project.mode = 'website';
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
    state.inputMode = activeProject()?.mode === 'general' ? 'general' : 'website';
    syncSettingsUi(); saveState(); renderAll(); closeProjects();
  }));
}

function updateProjectHeader(project) {
  els.projectTitle.textContent = project?.artifact?.projectName || project?.title || 'Untitled project';
  const statusText = project?.status === 'complete' ? 'Project files ready' : project?.status === 'building' ? 'AI team is building' : project?.status === 'failed' ? 'Run stopped; completed work preserved' : project?.status === 'briefing' ? 'Answering a few creative questions' : 'Describe what the team should build.';
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
  els.previewStage.classList.toggle('hidden', !html);
  els.emptyPreview?.classList.toggle('hidden', Boolean(html));
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
  els.manualCollabBar.classList.toggle('hidden', !(state.running && state.settings.collaborationMode === 'manual' && !state.manualAutoContinue));
  if (!messages.length) {
    els.teamFeed.innerHTML = '<div class="empty-panel">The Website Strategist, Copywriter, Creative Director, UX Architect, Developer, Reviewer, Fixer, and Validator will communicate here.</div>';
    els.teamSummary.innerHTML = '<strong>No run yet</strong><small>Every visible handoff is passed to the next model as shared project context.</small>';
    els.agentChatForm.classList.add('hidden');
    return;
  }
  const visible = messages.map((message, index) => ({ message, index })).filter(({ message }) => messageMatchesFilter(message));
  els.teamFeed.innerHTML = visible.length ? visible.map(({ message, index }) => `
    <article class="team-message ${message.failed ? 'failed' : ''} ${message.artifactEvent ? 'artifact-event' : ''}">
      <div class="team-message-head"><div><strong>${escapeHtml(message.from)} → ${escapeHtml(message.to || 'Team')}</strong><small>${escapeHtml(message.kind || 'handoff')} · ${new Date(message.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small><small>${escapeHtml(message.provider || '')}${message.latencyMs ? ` · ${(message.latencyMs / 1000).toFixed(1)}s` : ''}</small></div><span class="model-chip" title="${escapeHtml(message.model || '')}">${escapeHtml(message.model || 'system')}</span></div>
      <div class="team-message-body">${escapeHtml(message.content || '')}</div>
      <div class="team-message-actions"><button data-copy-team="${index}">Copy</button><button data-use-note="${index}">Use as change request</button><button data-open-transcript="1">Full transcript</button></div>
    </article>`).join('') : '<div class="empty-panel">No messages match this filter.</div>';
  $$('[data-copy-team]', els.teamFeed).forEach((button) => button.addEventListener('click', async () => { await navigator.clipboard.writeText(messages[Number(button.dataset.copyTeam)]?.content || ''); button.textContent = 'Copied'; }));
  $$('[data-use-note]', els.teamFeed).forEach((button) => button.addEventListener('click', () => {
    const message = messages[Number(button.dataset.useNote)]; if (!message) return;
    project.pendingTeamNotes = [...(project.pendingTeamNotes || []), `${message.from}: ${message.content}`].slice(-8); saveState(); updateProjectHeader(project); button.textContent = 'Added';
  }));
  $$('[data-open-transcript]', els.teamFeed).forEach((button) => button.addEventListener('click', openTranscript));
  requestAnimationFrame(() => { els.teamFeed.scrollTop = els.teamFeed.scrollHeight; });
  const models = project.completedModels || [];
  const verified = project.integrity?.verified;
  els.teamSummary.innerHTML = `<strong>${verified ? 'Verified collaboration' : 'Collaboration record'} · ${models.length} distinct model${models.length === 1 ? '' : 's'}</strong><small>${project.attempts?.length || 0} provider attempts · ${messages.length} visible handoffs · ${project.integrity?.message || 'Every later teammate receives earlier messages.'}</small>`;
  const roles = [...new Set(messages.filter((message) => !message.artifactEvent).map((message) => message.from))];
  els.agentSelect.innerHTML = roles.map((role) => `<option>${escapeHtml(role)}</option>`).join('');
  els.agentChatForm.classList.toggle('hidden', !project.artifact);
}

function updateIntegrity(project) {
  if (!project) {
    els.integrityPill.className = 'integrity-pill';
    els.integrityPill.textContent = 'Waiting for a run';
    return;
  }
  const count = project.completedModels?.length || 0;
  const min = state.settings.minModels;
  const verified = count >= min;
  project.integrity = { verified, count, minimum: min, message: verified ? `${count} unique model IDs completed real work.` : `Only ${count}/${min} required unique models completed.` };
  els.integrityPill.className = `integrity-pill ${verified ? 'verified' : project.status === 'building' ? '' : 'warn'}`;
  els.integrityPill.textContent = project.status === 'building' ? `${count} models active` : verified ? `✓ Verified · ${count} models` : `${count}/${min} models`;
}

function renderAll() {
  const project = activeProject();
  renderProjectList(); updateProjectHeader(project); renderBriefing(project); renderPreview(project); renderFiles(project); renderChanges(project); renderValidation(); renderTeam(project); updateIntegrity(project);
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
  const modelIds = workflowModelIds(12);
  const activeRoles = project.mode === 'general' ? generalRoleDefinitions : roleDefinitions;
  project.status = 'building'; project.artifact = null; project.previousArtifact = null; project.teamMessages = []; project.attempts = []; project.completedModels = []; project.providers = []; project.review = null; project.validation = null; project.changes = []; project.pendingTeamNotes = [];
  state.manualAutoContinue = false; state.manualResolver = null;
  updateIntegrity(project); saveState(); renderAll();

  if (project.websiteProfile || project.designConcept) {
    const concept = project.designConcept || {};
    addTeamMessage(project, artifactMessage('Website Architect', 'Website Strategist', 'approved-creative-brief', `The user completed the guided brief.\n\nPROFILE:\n${profileSummary(project.websiteProfile || {})}\n\nAPPROVED DESIGN DNA:\n${concept.name || 'Creative Director recommendation'}\nLayout: ${concept.layout || 'Distinctive and responsive'}\nMotion: ${concept.motion || 'Purposeful motion'}\nSignature: ${concept.signature || 'Create a project-specific visual motif'}\n\nEvery teammate must preserve this direction, avoid generic template patterns, and use only supported business facts.`, { model: 'user-guided Website Architect' }));
  }

  for (let index = 0; index < activeRoles.length; index += 1) {
    const role = activeRoles[index];
    const next = activeRoles[index + 1]?.role || 'Frontend Developer';
    await waitForManualAdvance(`${role.role} will read the conversation and hand work to ${next}.`);
    const progress = 7 + (index * 8);
    await executeTeamAgent(project, role, next, `${role.role.toLowerCase().replace(/[^a-z]+/g, '-')}-handoff`, index, modelIds, progress, `${role.role} is collaborating with the team…`);
  }

  await waitForManualAdvance('Frontend Developer will read every approved handoff and create the actual website files.');
  setProgress(49, 'Frontend Developer is creating real website files…'); setTeamStatus('working', 'Developer building files');
  const build = await postJson('/api/project-step', { action: 'build', mode: project.mode, prompt: project.prompt, outputFormat: state.settings.outputFormat, modelIds, slot: activeRoles.length, workspace: project.teamMessages, projectName: project.title, profile: project.websiteProfile, concept: project.designConcept }, 76000);
  recordAttempts(project, build.attempts || []);
  project.artifact = build.project;
  project.title = build.project.projectName || project.title;
  state.activeFile = build.project.entryFile || build.project.files?.[0]?.path;
  addTeamMessage(project, artifactMessage('Frontend Developer', 'QA Reviewer', 'files-created', `Created ${build.project.files.length} actual files (${build.project.files.map((file) => file.path).join(', ')}). The files are now available in Preview, Files, and Code.`, build));
  renderPreview(project); renderFiles(project); renderCodeEditor();

  for (let round = 1; round <= state.settings.reviewRounds; round += 1) {
    await waitForManualAdvance(`QA Reviewer will inspect the real files and compare them with the original brief · round ${round}.`);
    setProgress(57 + (round - 1) * 16, `QA Reviewer is inspecting the actual files · round ${round}…`); setTeamStatus('working', `QA review ${round}`);
    const reviewData = await postJson('/api/project-step', { action: 'review', mode: project.mode, prompt: project.prompt, modelIds, slot: activeRoles.length + 1 + ((round - 1) * 2), workspace: project.teamMessages, project: project.artifact, profile: project.websiteProfile, concept: project.designConcept }, 72000);
    recordAttempts(project, reviewData.attempts || []); project.review = reviewData.review;
    addTeamMessage(project, reviewToMessage(reviewData.review, reviewData));

    if (reviewData.review.approved && !(reviewData.review.issues || []).length) break;
    await waitForManualAdvance(`Fixer Developer will read the QA conversation and patch the actual files · round ${round}.`);
    setProgress(67 + (round - 1) * 16, `Fixer Developer is applying QA corrections · round ${round}…`); setTeamStatus('working', `Repairing files ${round}`);
    const before = structuredClone(project.artifact);
    const repaired = await postJson('/api/project-step', { action: 'repair', mode: project.mode, prompt: project.prompt, modelIds, slot: activeRoles.length + 2 + ((round - 1) * 2), project: project.artifact, review: reviewData.review, profile: project.websiteProfile, concept: project.designConcept, customInstruction: `Repair round ${round}. Resolve every concrete QA issue while preserving correct work and the approved design DNA.` }, 76000);
    recordAttempts(project, repaired.attempts || []); project.previousArtifact = before; project.artifact = repaired.project; project.changes = computeChanges(before, repaired.project);
    addTeamMessage(project, artifactMessage('Fixer Developer', round < state.settings.reviewRounds ? 'QA Reviewer' : 'Release Validator', 'files-revised', `Updated ${project.changes.length} file${project.changes.length === 1 ? '' : 's'} after QA round ${round}: ${project.changes.map((change) => change.path).join(', ') || 'no file differences detected'}.`, repaired));
    renderPreview(project); renderFiles(project); renderChanges(project);
  }

  if (state.settings.autoValidate) {
    await waitForManualAdvance('Release Validator will inspect the final files before packaging.');
    await validateProject(project, modelIds, 91);
  }
  setProgress(100, 'Website files are ready.');
  project.status = 'complete'; project.updatedAt = new Date().toISOString(); updateIntegrity(project);
  addTeamMessage(project, artifactMessage('Release Packager', 'User', 'release-ready', `${project.artifact.files.length} files are ready. Preview the website, inspect the full AI conversation, edit code, and download the ZIP.`, { model: 'deterministic ZIP packager' }));
  setTeamStatus('complete', 'Website ready');
  els.manualCollabBar.classList.add('hidden');
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
  event.preventDefault();
  if (state.running) return;
  const prompt = els.promptInput.value.trim();
  if (!prompt) return;
  showError('');
  const project = activeProject();

  if (state.inputMode === 'website') {
    if (project?.artifact?.files?.length) {
      project.intake ||= { businessInfo: project.prompt || '', answers: {}, messages: [], stage: 'complete', concepts: [] };
      project.intake.messages ||= [];
      project.intake.messages.push(intakeMessage('user', prompt));
      project.intake.messages.push(intakeMessage('assistant', 'I sent that change request to the Fixer Developer.'));
      project.pendingTeamNotes = [...(project.pendingTeamNotes || []), prompt].slice(-8);
      els.promptInput.value = '';
      updatePromptCount();
      saveState(); renderBriefing(project); updateProjectHeader(project);
      await applyTeamNotes();
      return;
    }

    if (project?.intake?.stage === 'questions') {
      els.promptInput.value = '';
      updatePromptCount();
      await answerIntakeQuestion(prompt);
      return;
    }

    if (project?.intake?.stage === 'concepts' || project?.intake?.stage === 'ready') {
      project.intake.businessInfo += `\n\nADDITIONAL USER INFORMATION:\n${prompt}`;
      project.intake.messages.push(intakeMessage('user', prompt));
      project.intake.messages.push(intakeMessage('assistant', 'Added. I’ll keep that information in the website brief.'));
      els.promptInput.value = '';
      updatePromptCount();
      saveState(); renderBriefing(project);
      return;
    }

    if (project?.intake?.stage === 'generating-concepts' || project?.intake?.stage === 'building') {
      showError('The team is working right now. You can watch it from the Team button.');
      return;
    }

    startWebsiteIntake(prompt);
    els.promptInput.value = '';
    updatePromptCount();
    return;
  }

  state.running = true;
  els.runBtn.disabled = true;
  els.runBtn.querySelector('span').textContent = 'Working';
  els.runProgress.classList.remove('hidden');
  const generalProject = ensureProject(prompt);
  generalProject.mode = 'general';
  state.activeWorkspaceTab = 'chat';
  try {
    await buildWorkflow(generalProject);
    els.promptInput.value = '';
    updatePromptCount();
    setWorkspaceTab('preview');
  } catch (error) {
    generalProject.status = 'failed';
    generalProject.updatedAt = new Date().toISOString();
    addTeamMessage(generalProject, { from: 'Studio Runtime', to: 'User', kind: 'run-stopped', content: `The run stopped before release. Completed team messages and files were preserved. ${error.message}`, model: 'runtime', failed: true });
    recordAttempts(generalProject, error.attempts || []);
    setTeamStatus('failed', 'Run stopped');
    showError(error.message);
    saveState(); renderAll();
  } finally {
    state.running = false;
    els.runBtn.disabled = false;
    els.runBtn.querySelector('span').textContent = 'Send';
    updateProjectHeader(generalProject);
  }
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
function setInputMode(mode = 'website') {
  state.inputMode = mode === 'general' ? 'general' : 'website';
  els.architectChip.textContent = state.inputMode === 'general' ? '◇ General' : '✦ Website';
  els.promptInput.placeholder = state.inputMode === 'general' ? 'Ask the AI team to build or analyze something…' : 'Paste the business information or describe the website…';
  syncSettingsUi();
  saveState();
}
function openProjects() { els.projectsPanel.classList.add('open'); els.mobileOverlay.classList.add('open'); }
function closeProjects() { els.projectsPanel.classList.remove('open'); els.mobileOverlay.classList.remove('open'); }

els.buildForm.addEventListener('submit', runBuild);
els.promptInput.addEventListener('input', () => { updatePromptCount(); els.promptInput.style.height = 'auto'; els.promptInput.style.height = `${Math.min(180, els.promptInput.scrollHeight)}px`; });
els.promptInput.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); els.buildForm.requestSubmit(); } });
$$('[data-example]').forEach((button) => button.addEventListener('click', () => { els.promptInput.value = button.dataset.example; updatePromptCount(); els.promptInput.focus(); }));
$$('[data-chat-example]').forEach((button) => button.addEventListener('click', () => { setInputMode('website'); els.promptInput.value = button.dataset.chatExample || ''; updatePromptCount(); els.promptInput.focus(); }));

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
els.newProjectBtn.addEventListener('click', () => { createProject(); setInputMode('general'); state.activeWorkspaceTab = 'chat'; renderAll(); els.promptInput.focus(); });
els.websiteArchitectBtn.addEventListener('click', () => { createProject(); setInputMode('website'); state.activeWorkspaceTab = 'chat'; renderAll(); closeProjects(); els.promptInput.focus(); });
els.emptyArchitectBtn.addEventListener('click', () => { setInputMode('website'); els.promptInput.focus(); });
els.architectChip.addEventListener('click', () => { setInputMode(state.inputMode === 'website' ? 'general' : 'website'); els.promptInput.focus(); });
els.emptyGeneralBtn.addEventListener('click', () => { setInputMode('general'); els.promptInput.focus(); });
els.clearProjectsBtn.addEventListener('click', () => { if (!confirm('Clear all locally saved projects?')) return; state.projects = []; state.activeId = null; saveState(); renderAll(); });
els.projectMenuBtn.addEventListener('click', openProjects); els.closeProjectsBtn.addEventListener('click', closeProjects); els.mobileOverlay.addEventListener('click', closeProjects);
els.teamToggleBtn?.addEventListener('click', openTeamPanel); els.closeTeamBtn?.addEventListener('click', closeTeamPanel); els.teamOverlay?.addEventListener('click', closeTeamPanel);
els.quickManualToggle?.addEventListener('change', () => { state.settings.collaborationMode = els.quickManualToggle.checked ? 'manual' : 'auto'; if (state.settings.collaborationMode === 'auto' && state.manualResolver) releaseManualStep(true); syncSettingsUi(); saveState(); });

els.settingsBtn.addEventListener('click', () => els.settingsModal.showModal()); els.modelsBtn.addEventListener('click', () => { renderModels(); els.modelsModal.showModal(); }); els.selectedModelsBtn.addEventListener('click', () => { renderModels(); els.modelsModal.showModal(); }); els.integrationsBtn.addEventListener('click', () => els.integrationsModal.showModal());
els.sidebarModelsBtn?.addEventListener('click', () => { renderModels(); els.modelsModal.showModal(); }); els.modelsShortcutBtn?.addEventListener('click', () => { renderModels(); els.modelsModal.showModal(); }); els.sidebarIntegrationsBtn?.addEventListener('click', () => els.integrationsModal.showModal());
els.outputFormatBtn.addEventListener('click', () => els.settingsModal.showModal());
els.outputFormatSelect.addEventListener('change', () => { state.settings.outputFormat = els.outputFormatSelect.value; syncSettingsUi(); saveState(); });
els.reviewRoundsSelect.addEventListener('change', () => { state.settings.reviewRounds = Number(els.reviewRoundsSelect.value) === 2 ? 2 : 1; syncSettingsUi(); saveState(); });
els.minModelsSelect.addEventListener('change', () => { state.settings.minModels = Number(els.minModelsSelect.value); saveState(); updateIntegrity(activeProject()); updateProjectHeader(activeProject()); });
els.integrityModeSelect.addEventListener('change', () => { state.settings.integrityMode = els.integrityModeSelect.value; saveState(); updateProjectHeader(activeProject()); });
els.collaborationModeSelect.addEventListener('change', () => { state.settings.collaborationMode = els.collaborationModeSelect.value; if (state.settings.collaborationMode === 'auto' && state.manualResolver) releaseManualStep(true); syncSettingsUi(); saveState(); });
els.defaultCreativitySelect.addEventListener('change', () => { state.settings.defaultCreativity = els.defaultCreativitySelect.value; saveState(); });
els.saveProjectsToggle.addEventListener('change', () => { state.settings.saveProjects = els.saveProjectsToggle.checked; saveState(); });
els.autoValidateToggle.addEventListener('change', () => { state.settings.autoValidate = els.autoValidateToggle.checked; saveState(); });
els.savePasswordBtn.addEventListener('click', () => { sessionStorage.setItem(PASSWORD_KEY, els.appPasswordInput.value); loadStatus(); });
els.clearLocalDataBtn.addEventListener('click', () => { if (!confirm('Clear projects, model choices, and settings from this browser?')) return; localStorage.removeItem(STORAGE_KEY); location.reload(); });
els.modelSearch.addEventListener('input', renderModels); els.freeOnlyToggle.addEventListener('change', renderModels); els.clearModelsBtn.addEventListener('click', () => { state.selectedModels.clear(); saveState(); renderModels(); });
els.integrationSearch.addEventListener('input', filterIntegrations); els.integrationCategory.addEventListener('change', filterIntegrations);
els.themeBtn.addEventListener('click', () => { document.documentElement.classList.toggle('light'); els.themeBtn.textContent = document.documentElement.classList.contains('light') ? '☀' : '☾'; saveState(); });

els.closeArchitectBtn.addEventListener('click', () => els.architectModal.close());
els.architectBackBtn.addEventListener('click', () => { if (state.architect.step > 0) { state.architect.step -= 1; renderArchitectQuestion(); } });
els.architectSkipBtn.addEventListener('click', () => chooseArchitectAnswer('Creative Director recommendation'));
els.architectCustomBtn.addEventListener('click', () => { const value = els.architectCustomAnswer.value.trim(); if (value) chooseArchitectAnswer(value); });
els.architectCustomAnswer.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); els.architectCustomBtn.click(); } });
els.approveConceptBtn.addEventListener('click', showArchitectBrief);
els.blendConceptsBtn.addEventListener('click', () => { if (state.architect.selectedConceptIds.length !== 2) { showError('Select exactly two concepts to blend.'); return; } showArchitectBrief(); });
els.surpriseConceptBtn.addEventListener('click', () => { if (!state.architect.concepts.length) return; const pick = state.architect.concepts[Math.floor(Math.random() * state.architect.concepts.length)]; state.architect.selectedConceptIds = [pick.id]; renderConcepts(); showArchitectBrief(); });
els.backToConceptsBtn.addEventListener('click', () => { els.architectBriefStage.classList.add('hidden'); els.architectConceptStage.classList.remove('hidden'); els.architectProgressBar.style.width = '82%'; });
els.finishArchitectBtn.addEventListener('click', finishArchitect);
els.nextAgentBtn.addEventListener('click', () => releaseManualStep(false));
els.autoContinueBtn.addEventListener('click', () => releaseManualStep(true));
els.openTranscriptBtn.addEventListener('click', openTranscript);
els.closeTranscriptBtn.addEventListener('click', () => els.transcriptModal.close());
els.copyTranscriptBtn.addEventListener('click', async () => { await navigator.clipboard.writeText(transcriptText()); els.copyTranscriptBtn.textContent = 'Copied'; setTimeout(() => { els.copyTranscriptBtn.textContent = 'Copy transcript'; }, 1000); });
$$('[data-team-filter]').forEach((button) => button.addEventListener('click', () => { state.teamFilter = button.dataset.teamFilter; $$('[data-team-filter]').forEach((item) => item.classList.toggle('active', item === button)); renderTeam(activeProject()); }));

loadState(); state.inputMode = activeProject()?.mode === 'general' ? 'general' : 'website'; setInputMode(state.inputMode); updateModelSelectionUi(); updatePromptCount(); renderAll(); loadStatus();
