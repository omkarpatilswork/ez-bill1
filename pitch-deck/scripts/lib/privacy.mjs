// Privacy: find what must be blurred (read-only, runs in the page), then blur
// those regions in the saved image. We blur, never replace or redact with boxes.
import sharp from 'sharp';

// Runs inside the page via page.evaluate(detectSensitive, opts). It only reads
// the DOM: it returns rectangles (CSS px, relative to the viewport) to blur.
// opts: { names: string[], route: string }
export function detectSensitive(opts) {
  const out = [];
  const counts = {};
  const learned = new Set();
  // pad a little sideways, barely vertically, so neighbouring lines stay sharp
  const push = (r, reason, padX = 4, padY = 1) => {
    if (!r || r.width < 1 || r.height < 1) return;
    out.push({ x: r.left - padX, y: r.top - padY, w: r.width + padX * 2, h: r.height + padY * 2, reason });
    counts[reason] = (counts[reason] || 0) + 1;
  };
  const visible = (el) => {
    if (!el || !el.getBoundingClientRect) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const textNodes = () => {
    const list = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const p = n.parentElement;
        if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(p.tagName)) return NodeFilter.FILTER_REJECT;
        return n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    let n; while ((n = w.nextNode())) if (visible(n.parentElement)) list.push(n);
    return list;
  };
  const rangeRects = (node, start, end) => {
    const rg = document.createRange();
    rg.setStart(node, start); rg.setEnd(node, end);
    return [...rg.getClientRects()];
  };
  const route = opts.route || '';
  const nodes = textNodes();

  // ---- names: given by the user (capture/private-names.txt) + learned here ----
  const names = new Set((opts.names || []).map((s) => s.trim()).filter((s) => s.length >= 2));
  for (const n of nodes) {
    const m = n.nodeValue.trim().match(/^(.{2,40}) \(you\)$/); // split chip "Omkar (you)"
    if (m) { names.add(m[1]); learned.add('self'); }
  }
  // Sidebar / header profile link holds the account holder's name and initials.
  for (const a of document.querySelectorAll('a[href="/profile"]')) {
    if (!visible(a)) continue;
    push(a.getBoundingClientRect(), 'profile');
    for (const s of a.querySelectorAll('span')) {
      const t = (s.textContent || '').trim();
      if (t && t.length >= 3 && !/^(profile|user)$/i.test(t)) { names.add(t); t.split(/\s+/).forEach((p) => p.length >= 3 && names.add(p)); learned.add('profile'); }
    }
  }
  // Split page: every participant chip under "People (n)" is a person.
  for (const el of document.querySelectorAll('p, h2, h3, div')) {
    if (el.children.length > 2) continue;
    if (!/^People \(\d+\)$/.test((el.textContent || '').trim())) continue;
    const card = el.closest('.glass-card') || el.parentElement?.parentElement;
    if (!card) continue;
    for (const chip of card.querySelectorAll('.rounded-full span, button.rounded-full')) {
      const t = (chip.textContent || '').replace(/\(you\)/, '').replace(/^\+\s*/, '').trim();
      if (t.length >= 2) { names.add(t); learned.add('participant'); }
    }
  }
  // Racked: leaderboard rows and feed cards name other gym members.
  if (route.startsWith('racked')) {
    for (const el of document.querySelectorAll('.name, .feed-name-text')) {
      const t = (el.textContent || '').trim();
      if (!t || /^you$/i.test(t) || !visible(el)) continue;
      push(el.getBoundingClientRect(), 'name');
      const row = el.closest('[class*="row"], [class*="feed"], li') || el.parentElement?.parentElement;
      row?.querySelectorAll('img').forEach((img) => visible(img) && push(img.getBoundingClientRect(), 'photo'));
    }
  }

  // ---- text patterns ----
  const patterns = [
    ['email', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi],
    ['phone', /(?:\+91[\s-]?)?(?<!\d)[6-9]\d{9}(?!\d)/g],
    // invoice / order / payment ids: 8+ chars mixing letters and digits (INV-2026-0042, pay_N3x...)
    ['id', /(?<![\w])(?=[A-Za-z0-9_\-/#]*\d)(?=[A-Za-z0-9_\-/#]*[A-Za-z])[A-Za-z0-9#][A-Za-z0-9_\-/#]{7,}(?![\w])/g],
    ['id', /(?<!\d)\d{9,}(?!\d)/g], // UTR and other long numeric refs
    ['id', /(?<=\b(?:invoice|order id|order no\.?|txn id|transaction id|utr|ref(?:erence)?(?: no\.?)?|payment id|bill no\.?)\s*[:#]\s*)\S+/gi],
  ];
  if (route === 'money-leaks') patterns.push(['merchant', /(?<=·\s*mostly\s+).+$/g, true]);
  if (names.size) {
    const alt = [...names].sort((a, b) => b.length - a.length).map(esc).join('|');
    patterns.push(['name', new RegExp(`(?<![\\p{L}])(?:${alt})(?![\\p{L}])`, 'giu')]);
  }
  for (const node of nodes) {
    const text = node.nodeValue;
    for (const [reason, re] of patterns) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        if (!m[0]) { re.lastIndex++; continue; }
        rangeRects(node, m.index, m.index + m[0].length).forEach((r) => push(r, reason));
      }
    }
    // Money Leaks merchant rows: "Swiggy · 21/10/2026" style lines
    if (route === 'money-leaks') {
      const p = node.parentElement;
      if (p && /^(.+) · \d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test((p.textContent || '').trim()) && p.firstChild === node) {
        push(rangeRects(node, 0, text.length)[0], 'merchant');
      }
    }
  }

  // ---- labelled values: "Invoice Number" -> blur the value next to it ----
  const LABEL = /^(invoice( number| no\.?| #)?|order( id| no\.?| number)|transaction( id| no\.?)?|txn( id)?|payment id|utr( no\.?)?|upi ref(erence)?( no\.?| id)?|ref(erence)?( id| no\.?| number)|bill( no\.?| number)|receipt( no\.?| number)|gstin|pan|account( number| no\.?)|card( number| no\.?)|serial( number| no\.?)?|imei|email|phone|mobile)\s*:?$/i;
  for (const el of document.querySelectorAll('p, span, dt, label, div, th, td')) {
    if (el.children.length > 1 || !visible(el)) continue;
    const t = (el.textContent || '').trim();
    if (t.length > 30 || !LABEL.test(t)) continue;
    const cands = [el.nextElementSibling, el.parentElement?.nextElementSibling];
    if (el.parentElement && el.parentElement.children.length === 2) cands.push([...el.parentElement.children].find((c) => c !== el));
    const v = cands.find((c) => c && visible(c) && (c.textContent || '').trim().length > 0 && (c.textContent || '').trim().length <= 80);
    if (v && !/^[—–-]$/.test((v.textContent || '').trim())) push(v.getBoundingClientRect(), 'labelled-id');
  }

  // ---- form fields holding an email / phone / id ----
  for (const f of document.querySelectorAll('input, textarea')) {
    if (!visible(f) || !f.value) continue;
    if (/@|\d{9,}/.test(f.value) || (names.size && [...names].some((n) => f.value.toLowerCase().includes(n.toLowerCase())))) push(f.getBoundingClientRect(), 'field');
  }

  // ---- photos of people (Google avatars etc.) ----
  for (const img of document.querySelectorAll('img')) {
    if (!visible(img)) continue;
    const src = img.currentSrc || img.src || '';
    const alt = img.alt || '';
    if (/googleusercontent|gravatar|avatar|profile/i.test(src) || (names.size && [...names].some((n) => alt.toLowerCase().includes(n.toLowerCase())))) {
      push(img.getBoundingClientRect(), 'photo');
    }
  }

  return { rects: out, counts, learnedNameSources: [...learned], nameCount: names.size };
}

// Merge overlapping rectangles so blurred regions don't leave sharp seams.
function mergeRects(rects) {
  const rs = rects.map((r) => ({ ...r }));
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i], b = rs[j];
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
          const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
          rs[i] = { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y, reason: a.reason };
          rs.splice(j, 1); merged = true; break outer;
        }
      }
    }
  }
  return rs;
}

// Blur rects (CSS px) on a screenshot buffer taken at `dpr`. `offsetY` lets us
// crop first and still map rects correctly. Returns an encoded image buffer.
export async function blurRegions(buf, rects, dpr, { format = 'png', quality = 92 } = {}) {
  const meta = await sharp(buf).metadata();
  const W = meta.width, H = meta.height;
  const composites = [];
  for (const r of mergeRects(rects)) {
    const left = Math.max(0, Math.floor(r.x * dpr));
    const top = Math.max(0, Math.floor(r.y * dpr));
    const width = Math.min(W - left, Math.ceil(r.w * dpr));
    const height = Math.min(H - top, Math.ceil(r.h * dpr));
    if (width < 2 || height < 2) continue;
    const sigma = Math.min(40, Math.max(10, height * 0.45));
    // Blur twice: once is enough to make text unreadable, twice removes letter shapes.
    const once = await sharp(buf).extract({ left, top, width, height }).blur(sigma).toBuffer();
    const twice = await sharp(once).blur(sigma).toBuffer();
    composites.push({ input: twice, left, top });
  }
  let img = sharp(buf);
  if (composites.length) img = img.composite(composites);
  return format === 'jpeg' ? img.jpeg({ quality, mozjpeg: true }).toBuffer() : img.png().toBuffer();
}
