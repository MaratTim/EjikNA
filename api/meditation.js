export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  try {
    const response = await fetch('https://na-russia.org/meditations', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ru-RU,ru;q=0.9',
      }
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Failed to fetch' });
    }

    const html = await response.text();
    const parsed = parseMediation(html);

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).json(parsed);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

function parseMediation(html) {
  // Убираем теги
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                   .replace(/<style[\s\S]*?<\/style>/gi, '')
                   .replace(/<[^>]+>/g, ' ')
                   .replace(/&nbsp;/g, ' ')
                   .replace(/&laquo;/g, '«')
                   .replace(/&raquo;/g, '»')
                   .replace(/&mdash;/g, '—')
                   .replace(/\s+/g, ' ');

  const lines = text.split(/(?<=[.!?»])\s+|\n/).map(l => l.trim()).filter(l => l.length > 0);

  const MO = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const dateRe = new RegExp('^\\d{1,2}\\s+(' + MO.join('|') + ')$', 'i');

  let i = 0, date = '', quote = '', source = '', body = [], aff = '';

  while (i < lines.length && !dateRe.test(lines[i])) i++;
  if (i < lines.length) date = lines[i++];

  while (i < lines.length && lines[i].length < 5) i++;
  if (i < lines.length) quote = lines[i++].replace(/^[«"']+|[»"']+$/g, '').trim();
  if (i < lines.length && lines[i].length < 100) source = lines[i++];

  const skip = /^(Поделит|Читать|©|Собрани|Онлайн|Выберит|Анонимн|Единый|Нажми|Участник|Новичк|Большие|Все город|radioNA|Литрес|Youtube|Rutube|ВКонтакт|Дзен|Подкаст|Медитаци|Ежедневник|Счётчик|Принцип)/i;

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
    if (l.length > 50 && !skip.test(l)) body.push(l);
    i++;
  }

  return { date, quote, source, body: body.slice(0, 8), aff };
}
