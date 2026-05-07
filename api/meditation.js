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
    const parsed = parseFromHTML(html);

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json(parsed);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

function parseFromHTML(html) {
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

  const lines = clean.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 2);

  const MO = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const dateRe = new RegExp('^\\d{1,2}\\s+(' + MO.join('|') + ')$', 'i');
  // Источник — содержит "текст", "стр", "стp" или похоже на ссылку на книгу
  const sourceRe = /стр|базовый|текст|литература|книга|глава/i;
  const skip = /^(Поделит|Читать|©|Собрани|Онлайн|Выберит|Анонимн|Единый|Нажми|Участник|Новичк|Большие|Все город|radioNA|Литрес|Youtube|Rutube|ВКонтакт|Дзен|Подкаст|Медитаци|Ежедневник|Счётчик|Принцип)/i;

  let i = 0, date = '', quote = '', source = '', body = [], aff = '';

  // Ищем дату
  while (i < lines.length && !dateRe.test(lines[i])) i++;
  if (i < lines.length) date = lines[i++];

  // Пропускаем короткие строки (заголовок темы)
  while (i < lines.length && lines[i].length < 5) i++;
  // Если следующая строка — заголовок (короткий, без точки), пропускаем
  if (i < lines.length && lines[i].length < 80 && !lines[i].endsWith('.') && !lines[i].startsWith('«')) {
    i++;
  }

  // Цитата — ищем строку в кавычках «» или ""
  while (i < lines.length && lines[i].length < 3) i++;
  if (i < lines.length) {
    const l = lines[i];
    // Если строка начинается с кавычки или это длинная цитата
    if (l.startsWith('«') || l.startsWith('"') || l.startsWith('„') || l.length > 20) {
      quote = l.replace(/^[«"'„]+|[»"']+$/g, '').trim();
      i++;
    }
  }

  // Источник — следующая короткая строка с упоминанием книги/страницы
  if (i < lines.length && lines[i].length < 100 && sourceRe.test(lines[i])) {
    source = lines[i++];
  }

  // Основной текст до ТОЛЬКО СЕГОДНЯ
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
    if (l.length > 40 && !skip.test(l)) {
      body.push(l);
    }
    i++;
    if (body.length >= 8) break;
  }

  return { date, quote, source, body, aff };
}
