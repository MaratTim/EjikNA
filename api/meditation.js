export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  try {
    const response = await fetch('https://na-russia.org/meditations', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
      }
    });

    if (!response.ok) {
      return res.status(502).json({ error: `HTTP ${response.status}` });
    }

    const html = await response.text();
    
    // Ищем текст медитации в JSON данных Next.js (__NEXT_DATA__)
    let parsed = null;
    
    // Метод 1: парсим __NEXT_DATA__
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        const props = nextData?.props?.pageProps;
        if (props) {
          parsed = parseFromNextData(props);
        }
      } catch(e) {}
    }

    // Метод 2: парсим HTML напрямую
    if (!parsed || !parsed.body || parsed.body.length === 0) {
      parsed = parseFromHTML(html);
    }

    if (!parsed || !parsed.body || parsed.body.length === 0) {
      return res.status(200).json({ error: 'no_content', raw: html.slice(0, 500) });
    }

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json(parsed);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

function parseFromNextData(props) {
  // Пробуем найти данные медитации в pageProps
  const meditation = props.meditation || props.data || props.content || props;
  
  let quote = '', source = '', body = [], aff = '', date = '';
  
  // Ищем поля разными именами
  quote = meditation.quote || meditation.citation || meditation.text || '';
  source = meditation.source || meditation.author || meditation.reference || '';
  date = meditation.date || meditation.day || '';
  
  if (meditation.body) {
    body = Array.isArray(meditation.body) ? meditation.body : [meditation.body];
  } else if (meditation.content) {
    body = Array.isArray(meditation.content) ? meditation.content : [meditation.content];
  } else if (meditation.paragraphs) {
    body = meditation.paragraphs;
  }
  
  aff = meditation.affirmation || meditation.onlyToday || meditation.today || '';
  
  return { date, quote, source, body, aff };
}

function parseFromHTML(html) {
  // Чистим HTML
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '—')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, '')
    .replace(/&amp;/g, '&');

  const lines = clean.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 3);

  const MO = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const dateRe = new RegExp('^\\d{1,2}\\s+(' + MO.join('|') + ')$', 'i');
  const skip = /^(Поделит|Читать|©|Собрани|Онлайн|Выберит|Анонимн|Единый|Нажми|Участник|Новичк|Большие|Все город|radioNA|Литрес|Youtube|Rutube|ВКонтакт|Дзен|Подкаст|Медитаци|Ежедневник|Счётчик|Принцип|Главная|Меню|Навигац|Контакт|Политик|Условия|Загрузк)/i;

  let i = 0, date = '', quote = '', source = '', body = [], aff = '';

  // Ищем дату
  while (i < lines.length && !dateRe.test(lines[i])) i++;
  if (i < lines.length) { date = lines[i++]; }
  
  // Пропускаем заголовок
  while (i < lines.length && lines[i].length < 5) i++;
  if (i < lines.length && lines[i].length < 100 && !lines[i].includes('.')) {
    i++; // заголовок
  }

  // Цитата
  while (i < lines.length && lines[i].length < 5) i++;
  if (i < lines.length) {
    quote = lines[i++].replace(/^[«"'„]+|[»"']+$/g, '').trim();
  }
  
  // Источник
  if (i < lines.length && lines[i].length < 100 && !lines[i].endsWith('.')) {
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
    if (l.length > 40 && !skip.test(l)) {
      body.push(l);
    }
    i++;
    if (body.length >= 8) break;
  }

  return { date, quote, source, body, aff };
}
