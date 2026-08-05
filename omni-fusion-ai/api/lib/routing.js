const patterns = {
  research: ['research', 'latest', 'current', 'today', 'news', 'sources', 'compare', 'price', 'trend', 'verify'],
  code: ['code', 'website', 'app', 'github', 'javascript', 'python', 'api', 'debug', 'program', 'sql'],
  creative: ['create', 'write', 'story', 'caption', 'script', 'brand', 'idea', 'viral', 'design', 'prompt'],
  reasoning: ['solve', 'analyze', 'strategy', 'plan', 'decision', 'why', 'evaluate', 'logic'],
  writing: ['rewrite', 'email', 'letter', 'essay', 'grammar', 'translate', 'summary'],
  media: ['image', 'picture', 'thumbnail', 'video', 'voice', 'audio', 'music', 'logo']
};

export function inferIntent(prompt) {
  const text = String(prompt || '').toLowerCase();
  const scores = Object.fromEntries(Object.entries(patterns).map(([key, words]) => [key, words.reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0)]));
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const primary = sorted[0][1] > 0 ? sorted[0][0] : 'general';
  return { primary, scores, mediaRequested: scores.media > 0 };
}

export function rankProviders(providers, intent, selectedIds = []) {
  const selected = new Set(selectedIds || []);
  return [...providers].sort((a, b) => {
    const aSelected = selected.has(a.id) ? 100 : 0;
    const bSelected = selected.has(b.id) ? 100 : 0;
    const aMatch = a.strengths?.includes(intent.primary) ? 30 : 0;
    const bMatch = b.strengths?.includes(intent.primary) ? 30 : 0;
    const aResearch = intent.primary === 'research' && a.id === 'perplexity' ? 50 : 0;
    const bResearch = intent.primary === 'research' && b.id === 'perplexity' ? 50 : 0;
    return (bSelected + bMatch + bResearch + b.priority) - (aSelected + aMatch + aResearch + a.priority);
  });
}

export function fallbackRoles(intent, count) {
  const specialized = {
    research: [
      ['Researcher', 'Find the most relevant facts, assumptions, and evidence.'],
      ['Analyst', 'Compare the options and identify the strongest conclusion.'],
      ['Skeptic', 'Flag weak claims, missing sources, and uncertainty.'],
      ['Editor', 'Turn the findings into a clear useful answer.'],
      ['Strategist', 'Convert the findings into practical next steps.']
    ],
    code: [
      ['Architect', 'Choose a reliable structure and interfaces.'],
      ['Engineer', 'Produce practical implementation details.'],
      ['Reviewer', 'Find bugs, security risks, and edge cases.'],
      ['UX Specialist', 'Improve usability and compatibility.'],
      ['Tester', 'Define tests and verify the solution.']
    ],
    creative: [
      ['Creative Director', 'Develop the strongest original concept.'],
      ['Audience Strategist', 'Optimize the idea for attention and clarity.'],
      ['Writer', 'Create polished usable copy.'],
      ['Critic', 'Remove weak, generic, or repetitive parts.'],
      ['Producer', 'Turn the concept into an executable plan.']
    ]
  };
  const defaults = [
    ['Strategist', 'Find the strongest practical approach.'],
    ['Domain Expert', 'Solve the task accurately and concretely.'],
    ['Critic', 'Find weaknesses, risks, and missing details.'],
    ['Creative', 'Offer a useful alternative perspective.'],
    ['Editor', 'Improve clarity and usability.']
  ];
  return (specialized[intent.primary] || defaults).slice(0, count).map(([role, instruction]) => ({ role, instruction }));
}

export function parseJsonObject(text) {
  try {
    const source = String(text || '').replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const start = source.indexOf('{');
    const end = source.lastIndexOf('}');
    return JSON.parse(start >= 0 && end > start ? source.slice(start, end + 1) : source);
  } catch {
    return null;
  }
}
