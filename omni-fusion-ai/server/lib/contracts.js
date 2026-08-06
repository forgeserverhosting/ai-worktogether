import { cleanString } from './security.js';

const VALID_STATUS = new Set(['completed', 'partial', 'blocked']);
const CONTRACT_TYPES = new Set(['concepts', 'project', 'review', 'patches', 'validation', 'doctor-plan', 'handoff']);

function cleanList(value, maxItems = 20, maxChars = 700) {
  return (Array.isArray(value) ? value : [])
    .map((item) => cleanString(typeof item === 'string' ? item : JSON.stringify(item), maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function contractInstruction(type, role) {
  const safeType = CONTRACT_TYPES.has(type) ? type : 'project';
  return `Return one JSON object using this mandatory envelope: {"contractVersion":"1.0","type":"${safeType}","role":"${role}","status":"completed|partial|blocked","summary":"short factual summary","payload":{...the requested deliverable...},"evidence":["specific evidence or file produced"],"remainingIssues":["anything genuinely unfinished"]}. Do not return markdown or text outside JSON. A completed status is only allowed when the payload contains the requested usable deliverable.`;
}

export function normalizeAgentContract(input, expectedType = '') {
  const source = input && typeof input === 'object' ? input : {};
  const looksWrapped = source.contractVersion || source.payload || source.remainingIssues || source.evidence;
  const payload = looksWrapped && source.payload && typeof source.payload === 'object' ? source.payload : source;
  const type = cleanString(source.type, 40) || cleanString(expectedType, 40) || 'project';
  const status = VALID_STATUS.has(source.status) ? source.status : 'completed';
  return {
    contractVersion: cleanString(source.contractVersion, 12) || (looksWrapped ? '1.0' : 'legacy'),
    type,
    role: cleanString(source.role, 90) || 'AI teammate',
    status,
    summary: cleanString(source.summary, 1200),
    payload,
    evidence: cleanList(source.evidence, 24, 900),
    remainingIssues: cleanList(source.remainingIssues, 24, 900),
    legacy: !looksWrapped
  };
}

export function validateAgentContract(contract, expectedType = '') {
  const issues = [];
  if (!contract || typeof contract !== 'object') issues.push('Missing contract object.');
  if (expectedType && contract?.type !== expectedType) issues.push(`Expected contract type ${expectedType}, received ${contract?.type || 'none'}.`);
  if (!VALID_STATUS.has(contract?.status)) issues.push('Invalid completion status.');
  if (!contract?.payload || typeof contract.payload !== 'object') issues.push('Missing structured payload.');
  if (contract?.status === 'completed' && contract.remainingIssues?.length) issues.push('A completed contract cannot list unresolved issues.');
  return { ok: issues.length === 0, issues };
}

export function contractMeta(contract, validation) {
  return {
    contractVersion: contract?.contractVersion || 'unknown',
    contractType: contract?.type || 'unknown',
    contractStatus: contract?.status || 'unknown',
    contractValid: Boolean(validation?.ok),
    contractIssues: validation?.issues || [],
    contractLegacy: Boolean(contract?.legacy)
  };
}
