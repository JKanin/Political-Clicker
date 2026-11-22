export type ModStat = 'click' | 'income' | 'price' | 'drain';

export const MOD_STATS: ModStat[] = ['click', 'income', 'price', 'drain'];

export type EventEffect =

  | { type: 'gain'; clicks: number; seconds: number }

  | { type: 'loss'; share: number }

  | { type: 'mod'; stat: ModStat; multiplier: number; seconds: number };

export interface EventChoice {
  label: string;

  outcome: string;
  effects: EventEffect[];
}

export interface EventDef {
  id: string;

  short: string;

  paper: string;
  kicker: string;
  byline: string;

  issue: string;
  headline: string;
  icon: string;
  caption: string;

  body: string;

  minOwned: number;
  choices: EventChoice[];
}

export interface EventLine {
  text: string;
  good: boolean;
}

export interface ActiveMod {
  stat: ModStat;
  multiplier: number;

  endsAt: number;
  label: string;
}

export function modIsGood(stat: ModStat, multiplier: number): boolean {
  return stat === 'click' || stat === 'income' ? multiplier >= 1 : multiplier <= 1;
}

export function describeMod(stat: ModStat, multiplier: number): string {
  const pct = Math.round(Math.abs(multiplier - 1) * 100);
  const sign = multiplier >= 1 ? '+' : '−';
  switch (stat) {
    case 'click':
      return `${sign}${pct}% к доходу за клик`;
    case 'income':
      return `${sign}${pct}% к пассивному доходу`;
    case 'price':
      return `цены улучшений ${sign}${pct}%`;
    case 'drain':
      return `потери от митинга ${sign}${pct}%`;
  }
}

export const EVENTS: EventDef[] = [
  {
    id: 'dacha-leak',
    short: 'Скандал с дачей',
    paper: 'ВЕЧЕРНИЙ УКАЗ',
    kicker: 'СКАНДАЛ',
    byline: 'Корр. А. Садовников',
    issue: '№ 1 204 • Экстренный выпуск',
    headline: 'ДАЧА ЗА ТРИ МИЛЛИАРДА: СКАНДАЛ В ПРАВИТЕЛЬСТВЕ',
    icon: '📸',
    caption: 'Кадр из архива «анонимного садовника»',
    body:
      'Журналисты опубликовали снимки загородной резиденции министра: бассейн с золотыми кранами и вертолётная площадка. ' +
      'В сети уже появились первые мемы. Приближённые ждут вашей реакции — молчание грозит затянуть скандал.',
    minOwned: 3,
    choices: [
      {
        label: 'Уволить министра и свалить всё на него',
        outcome: 'Министр «ушёл по собственному желанию». Остальные чиновники присмотрелись и затихли.',
        effects: [
          { type: 'loss', share: 0.1 },
          { type: 'mod', stat: 'income', multiplier: 1.2, seconds: 90 },
        ],
      },
      {
        label: 'Объявить фотографии монтажом',
        outcome: '«Независимая» лаборатория подтвердила подделку. Правда, бассейн почему-то пропал со спутниковых карт, а подрядчики подняли цены.',
        effects: [
          { type: 'gain', clicks: 40, seconds: 0 },
          { type: 'mod', stat: 'price', multiplier: 1.15, seconds: 60 },
        ],
      },
    ],
  },
  {
    id: 'rating',
    short: 'Народная любовь',
    paper: 'ВЕСТНИК ВЕРТИКАЛИ',
    kicker: 'СОЦИОЛОГИЯ',
    byline: 'Пресс-служба Кабинета',
    issue: '№ 7 311 • Официальный орган Кабинета',
    headline: 'РЕЙТИНГ ДОВЕРИЯ ВЫРОС ДО 146 ПРОЦЕНТОВ',
    icon: '📊',
    caption: 'Социологи проверили график трижды — всё сошлось',
    body:
      'Государственный центр изучения мнения сообщил: любовь народа к главе государства превысила все допустимые значения. ' +
      'Учёные объясняют феномен «особой национальной математикой». Что делать с такой популярностью?',
    minOwned: 2,
    choices: [
      {
        label: 'Объявить всенародный праздник',
        outcome: 'Улицы украшены флагами, на площадях раздают пироги. Народ ликует, указы подписываются с особым энтузиазмом.',
        effects: [
          { type: 'loss', share: 0.06 },
          { type: 'mod', stat: 'click', multiplier: 1.3, seconds: 60 },
        ],
      },
      {
        label: 'Назначить досрочные выборы',
        outcome: 'Результат известен заранее, но урны всё равно торжественно опечатали. Оппозиция почуяла слабину и вышла на улицы.',
        effects: [
          { type: 'gain', clicks: 0, seconds: 45 },
          { type: 'mod', stat: 'drain', multiplier: 1.4, seconds: 90 },
        ],
      },
      {
        label: 'Скромно отказаться от почестей',
        outcome: 'Ваша скромность тронула народ и сэкономила бюджет: торжественные закупки отменены, поставщики сбросили цены.',
        effects: [{ type: 'mod', stat: 'price', multiplier: 0.9, seconds: 90 }],
      },
    ],
  },
  {
    id: 'reset',
    short: '«Перезагрузка»',
    paper: 'ЗАРУБЕЖНЫЙ КУРЬЕР',
    kicker: 'ДИПЛОМАТИЯ',
    byline: 'Корр. по международным делам',
    issue: '№ 52 • Выпуск для иностранных читателей',
    headline: 'ИНОСТРАНЦЫ ПРЕДЛАГАЮТ «ПЕРЕЗАГРУЗКУ» ОТНОШЕНИЙ',
    icon: '🌍',
    caption: 'Дипломаты обменялись рукопожатиями и взглядами',
    body:
      'Иностранные послы сообщили о готовности обсудить смягчение ограничений в обмен на «разумные шаги навстречу». ' +
      'Советники спорят: принять протянутую руку или ответить жёстко.',
    minOwned: 4,
    choices: [
      {
        label: 'Пойти на уступки',
        outcome: 'Несколько заводов вновь получили доступ к импорту. Цены в закупках пошли вниз. "Патриотичные" комментаторы в бешенстве',
        effects: [
          { type: 'loss', share: 0.12 },
          { type: 'mod', stat: 'price', multiplier: 0.8, seconds: 90 },
        ],
      },
      {
        label: 'Ответить жёстко',
        outcome: 'Телевидение объявило "мобилизацию духа". Указы летят как листовки, но заграничные партнёры закрыли часть контрактов.',
        effects: [
          { type: 'mod', stat: 'click', multiplier: 1.35, seconds: 60 },
          { type: 'mod', stat: 'income', multiplier: 0.85, seconds: 60 },
        ],
      },
    ],
  },
  {
    id: 'strike',
    short: 'Забастовка на заводе',
    paper: 'НЕЗАВИСИМЫЙ ГОЛОС',
    kicker: 'ВНУТРЕННЯЯ ПОЛИТИКА',
    byline: 'Наш человек у ворот',
    issue: '№ 3 • Тираж изъят, но не весь',
    headline: 'РАБОЧИЕ ПЕРЕКРЫЛИ ВОРОТА ЗАВОДА',
    icon: '🏭',
    caption: 'Ночная смена отказалась выходить к станкам',
    body:
      'Коллектив крупного завода требует повысить зарплаты и отменить «добровольные» взносы на портреты главы государства. ' +
      'К воротам уже подъезжают автобусы. Решение нужно принять сегодня.',
    minOwned: 5,
    choices: [
      {
        label: 'Повысить зарплаты из бюджета',
        outcome: 'Рабочие вернулись к станкам, а министр финансов — к валидолу. Производство вышло на небывалые обороты.',
        effects: [
          { type: 'loss', share: 0.15 },
          { type: 'mod', stat: 'income', multiplier: 1.25, seconds: 90 },
        ],
      },
      {
        label: 'Отправить к воротам «ответственных лиц»',
        outcome: 'Ворота вскоре освободили. Тишина на заводе стоит дорого, а шёпот в цехах звучит всё громче.',
        effects: [
          { type: 'gain', clicks: 0, seconds: 60 },
          { type: 'mod', stat: 'drain', multiplier: 1.4, seconds: 90 },
        ],
      },
    ],
  },
  {
    id: 'jubilee',
    short: 'Юбилей реформ',
    paper: 'ВЕДОМОСТИ КАБИНЕТА',
    kicker: 'ТОРЖЕСТВО',
    byline: 'Отдел праздничных сводок',
    issue: '№ 9 900 • Праздничный номер',
    headline: 'ЮБИЛЕЙ РЕФОРМ: СТРАНА ЖДЁТ ВАШИХ РАСПОРЯЖЕНИЙ',
    icon: '🎖️',
    caption: 'Оркестр репетирует уже третью неделю',
    body:
      'Исполняется ровно 5 лет с начала великих преобразований. ' +
      'Распорядители просят выбрать формат празднования: бюджет утверждён, но разгуляться есть где.',
    minOwned: 6,
    choices: [
      {
        label: 'Устроить грандиозный парад',
        outcome: 'Колонны прошли по площади, самолёты нарисовали в небе юбилейную цифру. Чиновники вдохновлены, казна пустеет.',
        effects: [
          { type: 'loss', share: 0.12 },
          { type: 'mod', stat: 'click', multiplier: 1.4, seconds: 60 },
        ],
      },
      {
        label: 'Раздать награды чиновникам',
        outcome: 'Грудь у каждого теперь шире, и аппетиты — тоже. Зато работают они на совесть... И на медали.',
        effects: [
          { type: 'mod', stat: 'income', multiplier: 1.2, seconds: 90 },
          { type: 'mod', stat: 'price', multiplier: 1.1, seconds: 90 },
        ],
      },
      {
        label: 'Сэкономить на торжествах',
        outcome: 'Праздник прошёл «в узком кругу». Казна пополнилась, а обиженные распорядители ушли в тень и перестали стараться.',
        effects: [
          { type: 'gain', clicks: 0, seconds: 30 },
          { type: 'mod', stat: 'income', multiplier: 0.9, seconds: 60 },
        ],
      },
    ],
  },
  {
    id: 'blackout',
    short: 'Блэкаут в стране',
    paper: 'ВЕСТНИК СЕТЕЙ',
    kicker: 'ЧРЕЗВЫЧАЙНОЕ ПРОИСШЕСТВИЕ',
    byline: 'Корр. Е. Розеткина',
    issue: '№ 2 077 • Выпуск при свечах',
    headline: 'ПОЛСТРАНЫ ОСТАЛОСЬ БЕЗ СВЕТА: ЭНЕРГЕТИКИ ВИНЯТ ПОГОДУ',
    icon: '🔌',
    caption: 'Столица в темноте: светились только портреты с подсветкой',
    body:
      'Вечером в нескольких регионах разом погасли огни. Министр энергетики заявил, что виновата «непредвиденная зима», хотя на дворе осень. ' +
      'Совещание проходит при свечах, и от вас ждут быстрого решения.',
    minOwned: 7,
    choices: [
      {
        label: 'Запустить резервные генераторы за счёт казны',
        outcome: 'Свет вернули за ночь, счета ушли в бюджет. Зато заводы и канцелярии заработали втрое бодрее.',
        effects: [
          { type: 'loss', share: 0.1 },
          { type: 'mod', stat: 'income', multiplier: 1.25, seconds: 90 },
        ],
      },
      {
        label: 'Объявить отключения «плановыми учениями»',
        outcome: 'Телевидение показало учения в лучшем свете. Граждане с фонариками, правда, смотрят на власть с подозрением.',
        effects: [
          { type: 'gain', clicks: 0, seconds: 40 },
          { type: 'mod', stat: 'drain', multiplier: 1.3, seconds: 90 },
        ],
      },
      {
        label: 'Призвать граждан к бережливости',
        outcome: 'Все дружно экономят свет и деньги. Поставщики, напуганные темнотой, готовы работать себе в убыток.',
        effects: [
          { type: 'mod', stat: 'price', multiplier: 0.88, seconds: 90 },
          { type: 'mod', stat: 'income', multiplier: 0.9, seconds: 60 },
        ],
      },
    ],
  },
  {
    id: 'whistleblower',
    short: 'Утечка документов',
    paper: 'ГОРОДСКОЙ ШЁПОТ',
    kicker: 'РАССЛЕДОВАНИЕ',
    byline: 'Автор скрыт по понятным причинам',
    issue: '№ 418 • Печатается тайком, раздаётся из-под полы',
    headline: 'ЧИНОВНИК ПЕРЕДАЛ ПРЕССЕ ТАБЛИЦЫ СЕКРЕТНЫХ ЗАКУПОК',
    icon: '🕵️',
    caption: 'Папку с документами нашли в урне у фонтана',
    body:
      'Неизвестный сотрудник аппарата опубликовал сметы: за скрепки платили как за самолёты, а за ремонт забора — как за дворец. ' +
      'Сеть кипит, и каждое ваше слово теперь будут разбирать на цитаты.',
    minOwned: 8,
    choices: [
      {
        label: 'Возбудить дело о «разглашении тайны»',
        outcome: 'Информатора быстро нашли, а заодно закрыли пару неудобных редакций. Но шёпот только стал громче.',
        effects: [
          { type: 'gain', clicks: 0, seconds: 50 },
          { type: 'mod', stat: 'drain', multiplier: 1.35, seconds: 90 },
        ],
      },
      {
        label: 'Признать «отдельные недочёты» и сменить подрядчиков',
        outcome: 'Старых поставщиков заменили новыми, которые тоже скоро научатся брать за скрепки как за самолёты. Пока цены ниже.',
        effects: [
          { type: 'loss', share: 0.08 },
          { type: 'mod', stat: 'price', multiplier: 0.85, seconds: 90 },
        ],
      },
    ],
  },
  {
    id: 'champions',
    short: 'Победа сборной',
    paper: 'СПОРТИВНАЯ ПРАВДА',
    kicker: 'ТРИУМФ',
    byline: 'Корр. Б. Финишный',
    issue: '№ 6 006 • Золотой выпуск',
    headline: 'НАША СБОРНАЯ ВЫИГРАЛА ЧЕМПИОНАТ, СОПЕРНИКОВ НЕ ЗАМЕТИЛИ',
    icon: '🏆',
    caption: 'Кубок поднят над головой, вторая команда осталась за кадром',
    body:
      'Национальная сборная одержала победу с рекордным счётом. Эксперты уверяют, что соперники явились на матч по недоразумению. ' +
      'Страна ликует и ждёт от вас праздничного решения.',
    minOwned: 10,
    choices: [
      {
        label: 'Подарить героям квартиры и автомобили',
        outcome: 'Игроки вышли к народу в новых шубах. Страна воодушевлена, казначей — не очень.',
        effects: [
          { type: 'loss', share: 0.08 },
          { type: 'mod', stat: 'click', multiplier: 1.35, seconds: 60 },
        ],
      },
      {
        label: 'Показывать победу по всем каналам неделю',
        outcome: 'Эфир забит повторами матча. Реклама приносит копейку, а чиновники смотрят футбол вместо работы.',
        effects: [
          { type: 'gain', clicks: 60, seconds: 0 },
          { type: 'mod', stat: 'income', multiplier: 0.9, seconds: 60 },
        ],
      },
      {
        label: 'Объявить победу национальным достоянием',
        outcome: 'Теперь победа числится в реестре госимущества. Любая закупка «во славу чемпионов» легко проходит, но цены растут.',
        effects: [
          { type: 'mod', stat: 'click', multiplier: 1.2, seconds: 90 },
          { type: 'mod', stat: 'price', multiplier: 1.1, seconds: 90 },
        ],
      },
    ],
  },
];
