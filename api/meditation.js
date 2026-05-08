export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  try {
    const response = await fetch('https://na-russia.org/meditations', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ru-RU,ru;q=0.9',
        'Cache-Control': 'no-cache',
      }
    });

    if (!response.ok) {
      return res.status(502).json({ error: `HTTP ${response.status}` });
    }

    const html = await response.text();

    // Пробуем сначала извлечь из __NEXT_DATA__
    let parsed = null;
    const nextMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (nextMatch) {
      try {
        const nextData = JSON.parse(nextMatch[1]);
        // Ищем данные медитации рекурсивно
        parsed = findMeditation(nextData);
      } catch(e) {}
    }

    // Если не нашли — парсим HTML
    if (!parsed || !parsed.body || parsed.body.length === 0) {
      parsed = parseFromHTML(html);
    }

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json(parsed || { error: 'not_found' });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

function findMeditation(obj, depth = 0) {
  if (depth > 10 || !obj) return null;
  if (typeof obj === 'object') {
    // Ищем объект у которого есть title + body или quote
    if (obj.title && (obj.body || obj.quote || obj.paragraphs || obj.content)) {
      return {
        title: obj.title || '',
        quote: obj.quote || obj.citation || '',
        source: obj.source || obj.reference || '',
        body: Array.isArray(obj.body) ? obj.body :
              Array.isArray(obj.paragraphs) ? obj.paragraphs :
              obj.body ? [obj.body] : [],
        aff: obj.affirmation || obj.onlyToday || obj.today || '',
        date: obj.date || ''
      };
    }
    for (const key of Object.keys(obj)) {
      const result = findMeditation(obj[key], depth + 1);
      if (result) return result;
    }
  }
  return null;
}

function parseFromHTML(html) {
  // Ищем заголовок в тегах strong или span с классом title
  let title = '';

  // Ищем в тегах <strong> внутри первого блока с контентом
  const strongMatches = [...html.matchAll(/<strong[^>]*>([^<]{3,60})<\/strong>/gi)];
  if (strongMatches.length > 0) {
    // Первый strong который не похож на навигацию
    for (const m of strongMatches) {
      const t = m[1].trim();
      if (t.length > 3 && t.length < 60 && !/анонимн|наркоман|сайт|меню|войти|регистр/i.test(t)) {
        title = t;
        break;
      }
    }
  }

  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '—')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

  const lines = clean.split('\n').map(l => l.trim()).filter(l => l.length > 2);

  const MO = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const dateRe = new RegExp('^\\d{1,2}\\s+(' + MO.join('|') + ')$', 'i');
  const sourceRe = /стр|базовый|текст|литература|книга|глава/i;
  const skip = /^(Поделит|Читать|©|Собрани|Онлайн|Выберит|Анонимн|Единый|Нажми|Участник|Новичк|Большие|Все город|radioNA|Литрес|Youtube|Rutube|ВКонтакт|Дзен|Подкаст|Медитаци|Ежедневник|Счётчик|Принцип)/i;

  let i = 0, date = '', quote = '', source = '', body = [], aff = '';

  while (i < lines.length && !dateRe.test(lines[i])) i++;
  if (i < lines.length) date = lines[i++];

  // Если заголовок не нашли через теги — берём строку после даты
  if (!title) {
    while (i < lines.length && lines[i].length < 3) i++;
    if (i < lines.length && lines[i].length < 60 && !lines[i].startsWith('«') && !sourceRe.test(lines[i]) && !lines[i].endsWith('.')) {
      title = lines[i++];
    }
  } else {
    // Пропускаем строку совпадающую с заголовком
    while (i < lines.length && lines[i].length < 3) i++;
    if (i < lines.length && (lines[i] === title || lines[i].includes(title))) i++;
  }

  // Цитата
  while (i < lines.length && lines[i].length < 3) i++;
  if (i < lines.length) {
    const l = lines[i];
    if (l.startsWith('«') || l.startsWith('"') || l.startsWith('„') || l.length > 20) {
      quote = l.replace(/^[«"'„]+|[»"']+$/g, '').trim();
      i++;
    }
  }

  // Источник
  if (i < lines.length && lines[i].length < 100 && sourceRe.test(lines[i])) {
    source = lines[i++];
  }

  // Основной текст
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
    if (l.length > 40 && !skip.test(l)) body.push(l);
    i++;
    if (body.length >= 8) break;
  }

  return { date, title, quote, source, body, aff };
}
