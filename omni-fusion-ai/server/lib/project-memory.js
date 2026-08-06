import { cleanString } from './security.js';

function list(value, max = 12) {
  return (Array.isArray(value) ? value : []).map((item) => cleanString(typeof item === 'string' ? item : JSON.stringify(item), 900)).filter(Boolean).slice(0, max);
}

export function normalizeProjectBrain(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    verifiedFacts: list(source.verifiedFacts, 24),
    preferences: source.preferences && typeof source.preferences === 'object' ? source.preferences : {},
    decisions: list(source.decisions, 20),
    priorMistakes: list(source.priorMistakes, 16),
    unfinishedTasks: list(source.unfinishedTasks, 16),
    projectSummary: cleanString(source.projectSummary, 4000),
    fileSummary: cleanString(source.fileSummary, 5000),
    latestUserIntent: cleanString(source.latestUserIntent, 2400),
    updatedAt: cleanString(source.updatedAt, 40)
  };
}

export function relevantMemoryText(input = {}, role = 'AI teammate', maxChars = 10000) {
  const brain = normalizeProjectBrain(input);
  const blocks = [
    `ROLE RECEIVING MEMORY: ${cleanString(role, 100)}`,
    brain.projectSummary ? `PROJECT SUMMARY:\n${brain.projectSummary}` : '',
    brain.latestUserIntent ? `LATEST USER INTENT:\n${brain.latestUserIntent}` : '',
    brain.verifiedFacts.length ? `VERIFIED FACTS:\n${brain.verifiedFacts.map((item) => `- ${item}`).join('\n')}` : '',
    Object.keys(brain.preferences).length ? `USER PREFERENCES:\n${JSON.stringify(brain.preferences)}` : '',
    brain.decisions.length ? `LOCKED DECISIONS:\n${brain.decisions.map((item) => `- ${item}`).join('\n')}` : '',
    brain.priorMistakes.length ? `PRIOR MISTAKES TO AVOID:\n${brain.priorMistakes.map((item) => `- ${item}`).join('\n')}` : '',
    brain.unfinishedTasks.length ? `UNFINISHED TASKS:\n${brain.unfinishedTasks.map((item) => `- ${item}`).join('\n')}` : '',
    brain.fileSummary ? `CURRENT FILE SUMMARY:\n${brain.fileSummary}` : ''
  ].filter(Boolean);
  return blocks.join('\n\n').slice(0, maxChars);
}
