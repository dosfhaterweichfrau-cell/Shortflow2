// Start: node server-rss.js   (Node 18+, kein API-Key nötig)
// Benötigt im selben Ordner: index.html und channels.txt
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 3000, BASE = 'https://www.youtube.com/feeds/videos.xml?';
const dec = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
let ERR = [];

// channels.txt: pro Zeile "UC...(Kanal-ID) Thema", Zeilen mit # werden ignoriert
function channels() {
  return fs.readFileSync(path.join(__dirname, 'channels.txt'), 'utf8').split('\n').map(l => l.trim()).filter(Boolean)
    .map(l => { const [id, ...t] = l.split(/\s+/); return { id, tag: t.join(' ') || 'Shorts' }; })
    .filter(c => /^UC[\w-]{22}$/.test(c.id));
}
async function text(url) {
  try { const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } }); if (r.ok) return await r.text(); ERR.push('Status ' + r.status + ': ' + url); }
  catch (e) { ERR.push(e.message + ': ' + url); }
  return null;
}
const parse = (x, tag) => x.split('<entry>').slice(1).map(e => {
  const g = re => (e.match(re) || [])[1], key = g(/<yt:videoId>([^<]+)/);
  return { id: 'yt:' + key, src: 'yt', key, cr: dec(g(/<author>\s*<name>([^<]+)/) || 'YouTube'), tag, cap: dec(g(/<title>([^<]*)/) || ''), dur: 30, likes: +g(/<media:starRating count="(\d+)"/) || 0, cmt: 0, h: 0 };
}).filter(v => v.key);

// 1. Versuch: Shorts-Playlist des Kanals (UUSH...). 2. Versuch: normaler Kanal-Feed.
async function load({ id, tag }) {
  let x = await text(BASE + 'playlist_id=UUSH' + id.slice(2)), v = x ? parse(x, tag) : [];
  if (!v.length) { x = await text(BASE + 'channel_id=' + id); v = x ? parse(x, tag) : []; }
  return v;
}

let P, T = 0;  // 6 Stunden zwischenspeichern, leere Ergebnisse nicht
const get = () => {
  if (!P || Date.now() - T > 216e5) {
    T = Date.now(); ERR = [];
    P = Promise.all(channels().map(c => load(c))).then(a => { const r = a.flat().sort(() => Math.random() - .5); if (!r.length) P = null; return r; }).catch(e => { P = null; ERR.push(e.message); return []; });
  }
  return P;
};

http.createServer(async (q, r) => {
  if (q.url.startsWith('/api/shorts')) {
    const items = await get(); console.log(items.length + ' Videos geladen', ERR);
    r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ items, errors: ERR, channels: channels().length }));
    return;
  }
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  r.end(fs.readFileSync(path.join(__dirname, 'index.html')));
}).listen(PORT, () => console.log('ShortFlow läuft auf http://localhost:' + PORT));
