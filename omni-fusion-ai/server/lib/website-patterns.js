import crypto from 'node:crypto';

export const WEBSITE_PATTERN_LIBRARY = [
  { id: 'editorial-split', family: 'hero', name: 'Editorial Split Hero', structure: 'Asymmetric two-column first screen with oversized type, narrow proof rail, and image crop that breaks the grid.', bestFor: ['local service', 'portfolio', 'premium'], avoidWith: ['dense ecommerce'] },
  { id: 'project-canvas', family: 'hero', name: 'Project Canvas Hero', structure: 'Layered project imagery, floating factual labels, and one dominant conversion action anchored to a visual canvas.', bestFor: ['painting', 'construction', 'creative'], avoidWith: ['no imagery'] },
  { id: 'field-journal', family: 'story', name: 'Field Journal Story', structure: 'Sequential annotated sections that feel like a documented project notebook rather than a generic landing page.', bestFor: ['local service', 'craft', 'consulting'], avoidWith: ['ultra minimal'] },
  { id: 'before-after-stage', family: 'gallery', name: 'Before/After Stage', structure: 'Large transformation comparison with keyboard-accessible controls and contextual captions.', bestFor: ['painting', 'renovation', 'beauty'], avoidWith: ['no project photos'] },
  { id: 'service-pathway', family: 'services', name: 'Service Pathway', structure: 'Services arranged as a guided decision path based on visitor goals instead of equal cards.', bestFor: ['multi-service', 'home services'], avoidWith: ['single offer'] },
  { id: 'availability-rail', family: 'conversion', name: 'Availability Rail', structure: 'Persistent but unobtrusive rail showing hours, phone action, and service area with collision-safe mobile behavior.', bestFor: ['local service', 'emergency'], avoidWith: ['editorial portfolio'] },
  { id: 'local-proof-map', family: 'trust', name: 'Local Proof Map', structure: 'Service-area narrative and verified contact facts presented as a geographic trust moment without inventing an address.', bestFor: ['local business'], avoidWith: ['global product'] },
  { id: 'cinematic-chapters', family: 'story', name: 'Cinematic Chapters', structure: 'Full-width story chapters with controlled reveal motion, section progress, and reduced-motion fallback.', bestFor: ['creative', 'premium'], avoidWith: ['very low content'] },
  { id: 'modular-monument', family: 'layout', name: 'Modular Monument', structure: 'Bold modular blocks with one signature geometric rule repeated across navigation, imagery, and calls to action.', bestFor: ['bold brand', 'technology', 'creative'], avoidWith: ['traditional audience'] },
  { id: 'quiet-authority', family: 'layout', name: 'Quiet Authority', structure: 'Restrained typography-led composition with generous whitespace, precise dividers, and proof placed before promotion.', bestFor: ['professional', 'premium'], avoidWith: ['youthful entertainment'] },
  { id: 'process-timeline', family: 'process', name: 'Interactive Process Timeline', structure: 'Step-by-step process that reveals details on focus and click, with a readable no-JavaScript fallback.', bestFor: ['service', 'agency'], avoidWith: ['one-step purchase'] },
  { id: 'estimate-composer', family: 'conversion', name: 'Estimate Composer', structure: 'Progressive estimate request interface that starts with one choice and reveals only relevant fields.', bestFor: ['contractor', 'service'], avoidWith: ['no form destination'] },
  { id: 'trust-ledger', family: 'trust', name: 'Trust Ledger', structure: 'Verified claims, operating hours, rating context, and customer-feedback themes presented with source-safe labels.', bestFor: ['local business'], avoidWith: ['anonymous project'] },
  { id: 'horizontal-case-scroll', family: 'gallery', name: 'Horizontal Case Scroll', structure: 'Desktop horizontal project sequence with vertical mobile fallback and visible progress controls.', bestFor: ['portfolio', 'visual services'], avoidWith: ['accessibility-first simple site'] },
  { id: 'sticky-conversion-story', family: 'conversion', name: 'Sticky Conversion Story', structure: 'One stable call-to-action panel paired with scrolling service and proof content, disabled on narrow screens.', bestFor: ['lead generation'], avoidWith: ['many primary goals'] },
  { id: 'type-led-service-index', family: 'services', name: 'Type-led Service Index', structure: 'Large service names act as navigation and reveal concise supporting details without repetitive cards.', bestFor: ['multi-service', 'creative'], avoidWith: ['long product specs'] },
  { id: 'community-noticeboard', family: 'trust', name: 'Community Noticeboard', structure: 'Warm local information system combining hours, service area, project notes, and contact actions.', bestFor: ['friendly local'], avoidWith: ['luxury minimal'] },
  { id: 'proof-first-landing', family: 'hero', name: 'Proof-first Landing', structure: 'First screen begins with concrete proof and contact information before aspirational marketing copy.', bestFor: ['high trust barrier', 'local service'], avoidWith: ['new brand without proof'] }
];

function seedNumber(value = '') {
  const digest = crypto.createHash('sha256').update(String(value)).digest();
  return digest.readUInt32BE(0);
}

export function selectWebsitePatterns({ prompt = '', concept = {}, count = 5 } = {}) {
  const text = `${prompt} ${concept?.name || ''} ${concept?.layout || ''} ${concept?.signature || ''}`.toLowerCase();
  const scored = WEBSITE_PATTERN_LIBRARY.map((pattern, index) => {
    let score = ((seedNumber(`${text}:${pattern.id}`) % 1000) / 1000) * 4;
    for (const keyword of pattern.bestFor || []) if (text.includes(keyword)) score += 8;
    for (const keyword of pattern.avoidWith || []) if (text.includes(keyword)) score -= 5;
    if (/paint|handyman|contractor|home service|renovation/.test(text) && ['project-canvas', 'before-after-stage', 'service-pathway', 'availability-rail', 'trust-ledger', 'estimate-composer'].includes(pattern.id)) score += 9;
    if (/editorial|asymmetric|typography/.test(text) && ['editorial-split', 'quiet-authority', 'type-led-service-index'].includes(pattern.id)) score += 7;
    if (/advanced|interactive|motion|cinematic/.test(text) && ['cinematic-chapters', 'horizontal-case-scroll', 'process-timeline'].includes(pattern.id)) score += 6;
    return { ...pattern, score, index };
  }).sort((a, b) => b.score - a.score || a.index - b.index);

  const chosen = [];
  const families = new Set();
  for (const pattern of scored) {
    if (chosen.length >= count) break;
    if (families.has(pattern.family) && chosen.length < Math.min(3, count)) continue;
    chosen.push(pattern);
    families.add(pattern.family);
  }
  for (const pattern of scored) {
    if (chosen.length >= count) break;
    if (!chosen.some((item) => item.id === pattern.id)) chosen.push(pattern);
  }
  return chosen.map(({ score, index, ...pattern }) => pattern);
}

export function patternLibraryText(options = {}) {
  return selectWebsitePatterns(options).map((pattern, index) => `${index + 1}. ${pattern.name} [${pattern.family}]\n${pattern.structure}`).join('\n\n');
}
