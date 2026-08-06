import dns from 'node:dns/promises';
import net from 'node:net';
import crypto from 'node:crypto';
import { sendJson, readJsonBody } from '../server/lib/http.js';
import { authorize, rateLimit, cleanString } from '../server/lib/security.js';
import { scanPromptInjection, sanitizeImportedText } from '../server/lib/security-audit.js';

export const config = { maxDuration: 30 };

function decodeHtml(value = '') {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code) || 32))
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(value = '') {
  return decodeHtml(String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' '));
}

function privateIp(address = '') {
  if (!net.isIP(address)) return true;
  if (address === '::1' || address === '0.0.0.0') return true;
  if (address.startsWith('127.') || address.startsWith('10.') || address.startsWith('192.168.') || address.startsWith('169.254.')) return true;
  if (address.startsWith('172.')) {
    const second = Number(address.split('.')[1]);
    if (second >= 16 && second <= 31) return true;
  }
  const normalized = address.toLowerCase();
  return normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:') || normalized === '::';
}

async function assertPublicUrl(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error('Enter a valid website URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS websites can be imported.');
  if (!url.hostname || url.username || url.password) throw new Error('That website URL is not supported.');
  const records = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!records.length || records.some((record) => privateIp(record.address))) throw new Error('Private or local network addresses cannot be imported.');
  return url;
}

function firstMatch(html, regex) {
  return decodeHtml(html.match(regex)?.[1] || '');
}

function unique(items) {
  return [...new Set(items.map((item) => String(item || '').trim()).filter(Boolean))];
}

function absoluteUrl(value, base) {
  try { return new URL(value, base).href; } catch { return ''; }
}

function extractWebsite(html, finalUrl) {
  const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = firstMatch(html, /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["'][^>]*>/i)
    || firstMatch(html, /<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:description|og:description)["'][^>]*>/i);
  const headings = unique([...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map((match) => stripTags(match[1]))).slice(0, 20);
  const phones = unique(stripTags(html).match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g) || []).slice(0, 8);
  const emails = unique((html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map((item) => item.replace(/^mailto:/i, ''))).slice(0, 8);
  const links = unique([...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi)].map((match) => absoluteUrl(match[1], finalUrl))).filter((href) => /^https?:/i.test(href)).slice(0, 30);
  const images = unique([...html.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi)].map((match) => absoluteUrl(match[1], finalUrl))).filter((src) => /^https?:/i.test(src)).slice(0, 12);
  const colors = unique((html.match(/#[0-9a-f]{3,8}\b/gi) || []).map((item) => item.toLowerCase())).slice(0, 12);
  const rawParagraphs = unique([...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((match) => stripTags(match[1])).filter((item) => item.length >= 25)).slice(0, 18);
  const rawText = stripTags(html).slice(0, 14000);
  const injection = scanPromptInjection(`${rawParagraphs.join('\n')}\n${rawText}`);
  const paragraphs = rawParagraphs.map((item) => sanitizeImportedText(item).text).filter(Boolean);
  const text = sanitizeImportedText(rawText).text;
  const suspiciousScripts = (html.match(/<script\b/gi) || []).length;
  const hiddenInstructionSignals = (html.match(/(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0)[^>]{0,180}/gi) || []).length;
  return {
    title: sanitizeImportedText(title).text,
    description: sanitizeImportedText(description).text,
    headings: headings.map((item) => sanitizeImportedText(item).text).filter(Boolean),
    phones, emails, links, images, colors, paragraphs, text, sourceUrl: finalUrl,
    security: {
      promptInjectionDetected: injection.detected,
      removedInstructionLines: injection.count,
      suspiciousLines: injection.suspiciousLines,
      strippedScriptBlocks: suspiciousScripts,
      hiddenContentSignals: hiddenInstructionSignals,
      treatment: 'Imported content is data only. Script, style, hidden instruction, and prompt-injection text is not passed through as trusted commands.'
    }
  };
}

export default async function handler(req, res) {
  const requestId = crypto.randomUUID();
  try {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST.', requestId });
    const access = authorize(req);
    if (!access.ok) return sendJson(res, access.status, { error: access.error, requestId });
    const limiter = rateLimit(req);
    if (!limiter.ok) return sendJson(res, limiter.status, { error: limiter.error, requestId });
    const body = await readJsonBody(req);
    const requested = cleanString(body.url, 2000);
    const url = await assertPublicUrl(requested);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    let response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; OmniFusionWebsiteImporter/15.0)',
          Accept: 'text/html,application/xhtml+xml'
        }
      });
    } finally { clearTimeout(timer); }
    if (!response.ok) throw new Error(`The website returned HTTP ${response.status}.`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) throw new Error('That URL did not return an HTML webpage.');
    const length = Number(response.headers.get('content-length') || 0);
    if (length > 2_500_000) throw new Error('That webpage is too large to import safely.');
    const html = (await response.text()).slice(0, 2_500_000);
    const imported = extractWebsite(html, response.url || url.href);
    return sendJson(res, 200, { requestId, imported });
  } catch (error) {
    return sendJson(res, 500, { error: error?.name === 'AbortError' ? 'The website import timed out.' : error?.message || 'Website import failed.', requestId });
  }
}

export { extractWebsite, assertPublicUrl };
