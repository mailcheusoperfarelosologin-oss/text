const $ = id => document.getElementById(id);
const PREFIX = 'p2pchat-';           // evita collisioni sul server pubblico di PeerJS
let peer, isHost = false, guests = [], hostConn = null, myName = '', room = '';

const rand = () => Math.random().toString(36).slice(2, 8);
const link = () => location.origin + location.pathname + '?room=' + room;
const showErr = t => $('err').textContent = t || '';

function getName(){
  myName = $('name').value.trim() || 'Anonimo';
  try { localStorage.setItem('p2pchat-name', myName); } catch(e){}
  return myName;
}

function show(chat){
  $('home').classList.toggle('hidden', chat);
  $('chat').classList.toggle('hidden', !chat);
  if (chat) { $('roomLabel').textContent = room; $('text').focus(); }
}

function add(m){
  const log = $('log'), d = document.createElement('div');
  if (m.t === 'sys') { d.className = 'sys' + (m.err ? ' err' : ''); d.textContent = m.text; }
  else {
    d.className = 'm' + (m.mine ? ' me' : '');
    const s = document.createElement('small');
    s.textContent = m.from + ' · ' + new Date(m.ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    d.append(s, document.createTextNode(m.text));
  }
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
}

function broadcast(m, except){ guests.forEach(c => { if (c !== except && c.open) c.send(m); }); }

/* ---------- Host ---------- */
function createRoom(){
  getName(); showErr(); isHost = true;
  room = rand();
  peer = new Peer(PREFIX + room);
  peer.on('open', () => { show(true); add({t:'sys', text:'Stanza creata. Condividi il link con chi vuoi invitare.'}); });
  peer.on('error', e => {
    if (e.type === 'unavailable-id') { peer.destroy(); createRoom(); }
    else { showErr('Errore di connessione: ' + e.type); show(false); }
  });
  peer.on('connection', c => {
    c.on('data', d => {
      if (d.t === 'hello') {
        c.userName = String(d.name).slice(0, 24);
        guests.push(c);
        const m = {t:'sys', text: c.userName + ' è entrato'};
        add(m); broadcast(m, c);
      } else if (d.t === 'msg' && c.userName) {
        const m = {t:'msg', from:c.userName, text:String(d.text).slice(0, 2000), ts:Date.now()};
        add(m); broadcast(m, c);
      }
    });
    c.on('close', () => {
      if (!guests.includes(c)) return;
      guests = guests.filter(x => x !== c);
      const m = {t:'sys', text: c.userName + ' è uscito'};
      add(m); broadcast(m);
    });
  });
}

/* ---------- Guest ---------- */
function joinRoom(code){
  code = (code || '').trim();
  if (!code) return showErr('Inserisci il codice della stanza.');
  getName(); showErr(); isHost = false; room = code;
  peer = new Peer();
  peer.on('open', () => {
    hostConn = peer.connect(PREFIX + room, {reliable:true});
    hostConn.on('open', () => {
      hostConn.send({t:'hello', name:myName});
      show(true); add({t:'sys', text:'Sei dentro la stanza.'});
    });
    hostConn.on('data', d => add(d));
    hostConn.on('close', () => add({t:'sys', text:'La stanza è stata chiusa.', err:true}));
  });
  peer.on('error', e => {
    if (e.type === 'peer-unavailable') { showErr('Stanza non trovata. Controlla il codice.'); leave(); }
    else showErr('Errore di connessione: ' + e.type);
  });
}

/* ---------- Invio ---------- */
$('form').addEventListener('submit', e => {
  e.preventDefault();
  const text = $('text').value.trim();
  if (!text) return;
  $('text').value = '';
  const m = {t:'msg', from:myName, text, ts:Date.now()};
  add({...m, mine:true});
  if (isHost) broadcast(m);
  else if (hostConn && hostConn.open) hostConn.send({t:'msg', text});
  else add({t:'sys', text:'Messaggio non inviato: connessione chiusa.', err:true});
});

function leave(){
  if (peer) peer.destroy();
  peer = hostConn = null; guests = [];
  $('log').innerHTML = '';
  history.replaceState(null, '', location.pathname);
  show(false);
}

$('create').onclick = createRoom;
$('join').onclick = () => joinRoom($('code').value.replace(/.*room=/, ''));
$('leave').onclick = leave;
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(link()); $('copy').textContent = 'Copiato'; }
  catch(e){ prompt('Copia il link:', link()); }
  setTimeout(() => $('copy').textContent = 'Copia link', 1500);
};

try { $('name').value = localStorage.getItem('p2pchat-name') || ''; } catch(e){}
const r = new URLSearchParams(location.search).get('room');
if (r) { $('code').value = r; $('createBox').classList.add('hidden'); $('name').focus(); }
