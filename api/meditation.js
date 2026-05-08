export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const response = await fetch('https://na-russia.org/meditations', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        'Accept-Language': 'ru-RU,ru;q=0.9',
        'Cache-Control': 'no-cache',
      }
    });

    const html = await response.text();
    const parsed = parse(html);

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
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

  // Ищем маркер "Медитация на сегодня"
  let i = 0;
  while (i < lines.length && !/^Медитация на сегодня$/i.test(lines[i])) i++;
  i++; // пропускаем маркер

  // Заголовок — сразу после маркера
  while (i < lines.length && lines[i].length < 2) i++;
  const title = lines[i++] || '';

  // Дата
  while (i < lines.length && lines[i].length < 2) i++;
  const date = lines[i++] || '';

  // Цитата
  while (i < lines.length && lines[i].length < 2) i++;
  const quote = (lines[i++] || '').replace(/^[«"„]+|[»"]+$/g, '').trim();

  // Источник
  let source = '';
  if (i < lines.length && /стр|базовый|текст/i.test(lines[i])) {
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
    if (l.length > 40 && !skip.test(l)) body.push(l);
    i++;
    if (body.length >= 8) break;
  }

  return { title, date, quote, source, body, aff };
}
