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

    if (!response.ok) return res.status(502).json({ error: `HTTP ${response.status}` });

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
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '—')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

  const lines = clean.split('\n').map(l => l.trim()).filter(l => l.length > 1);

  const MO = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const dateRe = new RegExp('^\\d{1,2}\\s+(' + MO.join('|') + ')$', 'i');
  const sourceRe = /стр\.?|базовый|текст|литература/i;
  const skip = /^(Поделит|Читать|©|Собрани|Онлайн|Выберит|Анонимн|Единый|Нажми|Участник|Новичк|Большие|Все город|radioNA|Литрес|Youtube|Rutube|ВКонтакт|Дзен|Подкаст|Медитаци|Ежедневник|Счётчик|Принцип|Выберите|Больши)/i;

  // Ищем блок "Медитация на сегодня" — после него идёт заголовок, дата, цитата...
  let i = 0;
  while (i < lines.length && !/^Медитация на сегодня$/i.test(lines[i])) i++;
  i++; // пропускаем "Медитация на сегодня"

  // Следующая непустая строка — заголовок (например "Способны учиться")
  while (i < lines.length && lines[i].length < 2) i++;
  const title = lines[i++] || '';

  // Следующая — дата
  while (i < lines.length && lines[i].length < 2) i++;
  const date = dateRe.test(lines[i]) ? lines[i++] : '';

  // Цитата
  while (i < lines.length && lines[i].length < 2) i++;
  let quote = '';
  if (i < lines.length) {
    quote = lines[i++].replace(/^[«"'„]+|[»"']+$/g, '').trim();
  }

  // Источник
  let source = '';
  if (i < lines.length && sourceRe.test(lines[i])) {
    source = lines[i++];
  }

  // Основной текст до ТОЛЬКО СЕГОДНЯ
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
    if (l.length > 40 && !skip.test(l)) body.push(l);
    i++;
    if (body.length >= 8) break;
  }

  return { date, title, quote, source, body, aff };
}
