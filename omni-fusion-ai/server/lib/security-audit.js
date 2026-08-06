function unique(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function domainOf(value = '') {
  try { return new URL(value).hostname.toLowerCase(); } catch { return ''; }
}

function allText(project) {
  return (project?.files || []).map((file) => `\n/* ${file.path || 'file'} */\n${String(file.content || '')}`).join('\n');
}

export function scanPromptInjection(text = '') {
  const patterns = [
    /ignore (?:all|any|the) previous (?:instructions|prompts|rules)/i,
    /system (?:message|prompt|instructions?)\s*:/i,
    /developer (?:message|instructions?)\s*:/i,
    /do not (?:tell|show|reveal) the user/i,
    /act as (?:the )?(?:system|developer|administrator)/i,
    /exfiltrat|send (?:the )?(?:api key|password|secret|token)/i,
    /override (?:the )?(?:user|system|safety) instructions/i,
    /BEGIN[_ -]?(?:SYSTEM|PROMPT|INSTRUCTIONS)/i
  ];
  const lines = String(text || '').split(/\r?\n/);
  const suspiciousLines = lines.filter((line) => patterns.some((pattern) => pattern.test(line))).slice(0, 20);
  return {
    detected: suspiciousLines.length > 0,
    count: suspiciousLines.length,
    suspiciousLines: suspiciousLines.map((line) => line.trim().slice(0, 260))
  };
}

export function sanitizeImportedText(text = '') {
  const scan = scanPromptInjection(text);
  if (!scan.detected) return { text: String(text || ''), scan };
  const blocked = new Set(scan.suspiciousLines);
  const safe = String(text || '').split(/\r?\n/).filter((line) => !blocked.has(line.trim().slice(0, 260))).join('\n');
  return { text: safe, scan };
}

export function auditProjectSecurity(project, options = {}) {
  const text = allText(project);
  const checks = [];
  const add = (name, passed, detail, severity = 'medium') => checks.push({ name, passed: Boolean(passed), detail, severity });
  const externalScripts = unique([...text.matchAll(/<script[^>]+src=["'](https?:\/\/[^"']+)["']/gi)].map((match) => match[1]));
  const externalFrames = unique([...text.matchAll(/<(?:iframe|frame)[^>]+src=["'](https?:\/\/[^"']+)["']/gi)].map((match) => match[1]));
  const metaRefresh = /<meta[^>]+http-equiv=["']?refresh["']?/i.test(text);
  const dangerousExecution = /\beval\s*\(|\bnew\s+Function\s*\(|set(?:Timeout|Interval)\s*\(\s*["'`]/i.test(text);
  const miningSignals = /coinhive|cryptonight|webmine|stratum\+tcp|miner\.start|hashrate/i.test(text);
  const obfuscatedBlocks = (text.match(/(?:atob\s*\(|fromCharCode\s*\(|\\x[0-9a-f]{2})/gi) || []).length;
  const externalPosts = unique([
    ...[...text.matchAll(/<form[^>]+action=["'](https?:\/\/[^"']+)["']/gi)].map((match) => match[1]),
    ...[...text.matchAll(/fetch\s*\(\s*["'](https?:\/\/[^"']+)["']/gi)].map((match) => match[1]),
    ...[...text.matchAll(/(?:axios\.(?:post|put)|XMLHttpRequest)[\s\S]{0,180}?["'](https?:\/\/[^"']+)["']/gi)].map((match) => match[1])
  ]);
  const approvedDomains = new Set((options.approvedDomains || []).map((value) => domainOf(value)).filter(Boolean));
  const unknownPosts = externalPosts.filter((url) => !approvedDomains.has(domainOf(url)));
  const inlineHandlers = (text.match(/\son(?:click|load|error|submit|mouseover)\s*=/gi) || []).length;
  const hiddenElements = (text.match(/(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0)[^}]{0,180}(?:iframe|script|form)/gi) || []).length;

  add('No unknown external scripts', externalScripts.length === 0, externalScripts.length ? `External script source(s): ${externalScripts.join(', ')}` : 'No remote JavaScript dependencies detected.', externalScripts.length ? 'high' : 'low');
  add('No external embedded frames', externalFrames.length === 0, externalFrames.length ? `External frame source(s): ${externalFrames.join(', ')}` : 'No remote iframe embeds detected.', externalFrames.length ? 'high' : 'low');
  add('No forced redirects', !metaRefresh, metaRefresh ? 'A meta-refresh redirect was detected.' : 'No forced meta-refresh redirect detected.', 'high');
  add('No dynamic code execution', !dangerousExecution, dangerousExecution ? 'eval, Function constructor, or string-based timer execution was detected.' : 'No common dynamic code execution pattern detected.', 'high');
  add('No crypto-mining signals', !miningSignals, miningSignals ? 'A cryptocurrency-mining signal was detected.' : 'No common mining script signal detected.', 'critical');
  add('Limited code obfuscation', obfuscatedBlocks <= 2, obfuscatedBlocks > 2 ? `${obfuscatedBlocks} obfuscation-related patterns detected.` : 'No suspicious concentration of obfuscated code detected.', 'medium');
  add('Expected form and network destinations', unknownPosts.length === 0, unknownPosts.length ? `Unapproved data destination(s): ${unknownPosts.join(', ')}` : 'No unapproved external form or fetch destinations detected.', unknownPosts.length ? 'high' : 'low');
  add('No hidden executable embeds', hiddenElements === 0, hiddenElements ? `${hiddenElements} hidden executable/embed pattern(s) detected.` : 'No hidden executable embeds detected.', 'high');
  add('Inline event handlers minimized', inlineHandlers <= 8, inlineHandlers > 8 ? `${inlineHandlers} inline event handlers detected; prefer unobtrusive listeners.` : `${inlineHandlers} inline event handler(s) detected.`, 'low');

  const failures = checks.filter((check) => !check.passed && ['critical', 'high'].includes(check.severity));
  return {
    passed: failures.length === 0,
    score: Math.round((checks.filter((check) => check.passed).length / Math.max(1, checks.length)) * 100),
    checks,
    criticalFailures: failures.length,
    externalScripts,
    externalFrames,
    externalPosts
  };
}
