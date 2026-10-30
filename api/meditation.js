export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const MO = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
    const msk = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
    const todayRu = `${msk.getDate()} ${MO[msk.getMonth()]}`;

    // До 2 попыток с короткими таймаутами (чтобы уложиться в лимит Vercel)
    let parsed = null;
    let diag = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4500);
      try {
        const response = await fetch('https://na-russia.org/meditations', {
          signal: ctrl.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
            'Accept-Language': 'ru-RU,ru;q=0.9',
            'Cache-Control': 'no-cache',
          }
        });
        const html = await response.text();
        const p = parse(html);
        diag = 'HTTP ' + response.status + ', ' + html.length + ' симв.';
        if (p && p.body && p.body.length > 0) {
          parsed = p;
          if ((p.date || '').trim().toLowerCase() === todayRu) break;
        } else {
          diag += ', текст дня не найден';
        }
      } catch (err) {
        diag = err.name === 'AbortError' ? 'сайт АН долго отвечает' : err.message;
      } finally {
        clearTimeout(timer);
      }
    }
    if (!parsed) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(502).json({ error: 'na-russia.org: ' + diag });
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.status(200).json(parsed);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}

function parse(html) {
  // Убираем теги, оставляем текст
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"');

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);

  const MON = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const dateRe = new RegExp('^\\d{1,2}\\s+(' + MON.join('|') + ')$', 'i');

  // Основной способ: строка-дата, сразу за ней цитата в «»; заголовок — строка перед датой
  let i = -1;
  for (let k = 1; k < lines.length - 1; k++) {
    if (dateRe.test(lines[k]) && /^[«"„]/.test(lines[k + 1])) { i = k - 1; break; }
  }
  // Запасной способ: маркер "Медитация на сегодня"
  if (i < 0) {
    let m = 0;
    while (m < lines.length && !/^Медитация на сегодня$/i.test(lines[m])) m++;
    i = m + 1;
  }

  // Заголовок — сразу после маркера
  while (i < lines.length && lines[i].length < 2) i++;
  const title = lines[i++] || '';

  // Дата
  while (i < lines.length && lines[i].length < 2) i++;
  const date = lines[i++] || '';

  // Цитата
  while (i < lines.length && lines[i].length < 2) i++;
  const quote = (lines[i++] || '').replace(/^[«"„]+|[»"]+$/g, '').trim();

  // Источник — только короткие строки до 60 символов со ссылкой на книгу
  let source = '';
  if (i < lines.length && lines[i].length < 60 && /стр|базовый|текст/i.test(lines[i])) {
    source = lines[i++];
  }

  // Основной текст
  const skip = /^(Поделит|Читать|©|Собрани|Онлайн|Выберит|Анонимн|Единый|Нажми|Большие|Все город|radioNA|Литрес|Youtube|Rutube|ВКонтакт|Дзен|Подкаст|Выберите)/i;
  const body = [];
  let aff = '';

  while (i < lines.length) {
    const l = lines[i];
    if (/^ТОЛЬКО СЕГОДНЯ/i.test(l)) {
      aff = l.replace(/^ТОЛЬКО СЕГОДНЯ[:\s]*/i, '').trim();
      i++;
      while (i < lines.length && lines[i].length > 10 && !skip.test(lines[i])) {
        aff += ' ' + lines[i++];
      }
      break;
    }
    // Конец текста — подвал сайта. Начало абзаца НЕ фильтруем: текст может начинаться с любых слов.
    if (/^(Единый номер|Приложение АН|©)/i.test(l)) break;
    body.push(l);
    i++;
    if (body.length >= 12) break;
  }

  return { title, date, quote, source, body, aff };
}
