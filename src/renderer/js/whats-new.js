// What changed in each version, in a few short lines (English and Russian), newest first. CHANGELOG.md has the details;
// tests check that every version there is here too. os: 'win' / 'mac' marks a change for one platform only.
export const RELEASES = [
  {
    version: '2.7.0', date: '2026-10-23',
    title: {en: 'What’s new', ru: 'Что нового'},
    items: [
      {en: 'This page: a short summary of every version, with a “New” mark in the sidebar after an update.', ru: 'Эта страница: краткое описание каждой версии и отметка «Новое» в боковом меню после обновления.'}
    ]
  },
  {
    version: '2.6.0', date: '2026-10-23',
    title: {en: 'Pick single files, automatic cleaning, drive health', ru: 'Выбор отдельных файлов, автоочистка, состояние дисков'},
    items: [
      {en: 'Cleaner: “Choose files” lists every file of an item to search, sort and pick from — send them to the Recycle Bin or delete them.', ru: 'Очистка: «Выбрать файлы» показывает все файлы пункта — их можно искать, сортировать, отмечать и отправлять в Корзину или удалять.'},
      {en: 'Automatic cleaning every day or week, without opening a window (Settings).', ru: 'Автоматическая очистка каждый день или неделю, без открытия окна («Настройки»).'},
      {en: 'Empty folders: finds folders with nothing in them and moves them to the Recycle Bin.', ru: 'Пустые папки: находит папки, в которых ничего нет, и отправляет их в Корзину.'},
      {en: 'Drive health on Overview: the S.M.A.R.T. status of every drive, with a warning when one is failing.', ru: 'Состояние дисков на «Обзоре»: статус S.M.A.R.T. каждого диска и предупреждение, если диск выходит из строя.'},
      {os: 'win', en: 'Repair Windows (Tools): System File Checker, DISM and a drive error scan, with live progress.', ru: 'Восстановление Windows («Инструменты»): проверка системных файлов, DISM и проверка диска на ошибки с отображением хода работы.'},
      {os: 'mac', en: 'Check your disk (Tools): First Aid’s check of the startup disk.', ru: 'Проверка диска («Инструменты»): проверка загрузочного диска, как в «Первой помощи».'}
    ]
  },
  {
    version: '2.5.0', date: '2026-10-23',
    title: {en: 'Fix search', ru: 'Починка поиска'},
    items: [
      {os: 'win', en: 'Fix Windows Search (Tools): finds apps search can’t see because they have no Start menu shortcut, and adds them to Start.', ru: 'Починить поиск Windows («Инструменты»): находит программы, которых не видит поиск из-за отсутствия ярлыка в «Пуске», и добавляет их туда.'},
      {os: 'win', en: 'Restart search, turn the search service back on or rebuild the index in one click.', ru: 'Перезапуск поиска, включение службы поиска и перестройка индекса в один клик.'},
      {os: 'mac', en: 'Fix Spotlight: adds apps Spotlight missed, restarts it or rebuilds its index.', ru: 'Починить Spotlight: добавляет пропущенные приложения, перезапускает Spotlight или перестраивает его индекс.'}
    ]
  },
  {
    version: '2.4.0', date: '2026-10-20',
    title: {en: 'English or Russian', ru: 'Английский или русский'},
    items: [
      {en: 'The whole app in English or Russian (Settings → Language), switched instantly.', ru: 'Всё приложение на английском или русском («Настройки» → «Язык»), переключается сразу.'},
      {en: 'Numbers, sizes and dates follow the chosen language.', ru: 'Числа, размеры и даты оформляются по правилам выбранного языка.'}
    ]
  },
  {
    version: '2.3.0', date: '2026-10-19',
    title: {en: 'Results stay after closing', ru: 'Результаты сохраняются'},
    items: [
      {en: 'The last Cleaner, Disk analyzer and Duplicates results are still there when you reopen Aster.', ru: 'Последние результаты Очистки, Анализа диска и Дубликатов остаются после повторного запуска Aster.'}
    ]
  },
  {
    version: '2.2.0', date: '2026-10-19',
    title: {en: 'Update from Settings', ru: 'Обновление из настроек'},
    items: [
      {en: 'Settings → Updates checks GitHub, shows what’s new and installs the update after verifying it.', ru: '«Настройки» → «Обновления» проверяет GitHub, показывает, что нового, и устанавливает обновление после проверки.'},
      {en: 'The version next to the logo shows the installed version.', ru: 'Рядом с логотипом показана установленная версия.'}
    ]
  },
  {
    version: '2.1.0', date: '2026-10-19',
    title: {en: 'Clean exactly what you want', ru: 'Очищайте ровно то, что нужно'},
    items: [
      {en: 'Delete single files and clean single locations of a Cleaner item.', ru: 'Удаление отдельных файлов и очистка отдельных расположений пункта Очистки.'},
      {os: 'mac', en: 'App caches are split per app; accurate memory usage, safer Leftovers and battery health.', ru: 'Кэши приложений разделены по программам; точное использование памяти, более безопасные «Остатки» и состояние аккумулятора.'},
      {os: 'mac', en: 'New tools and settings: Free up memory, Power Nap, App Nap, the Library folder and more.', ru: 'Новые инструменты и настройки: освобождение памяти, Power Nap, App Nap, папка «Библиотека» и другие.'}
    ]
  },
  {
    version: '2.0.0', date: '2026-10-19',
    title: {en: 'Aster for Mac', ru: 'Aster для Mac'},
    items: [
      {en: 'Aster runs natively on macOS (Apple silicon and Intel), with every feature rebuilt for the Mac.', ru: 'Aster работает на macOS (Apple silicon и Intel), и каждая функция переделана под Mac.'},
      {os: 'mac', en: 'Leftovers replaces the registry cleaner; updates for macOS, Homebrew and App Store apps.', ru: '«Остатки» вместо очистки реестра; обновления macOS, Homebrew и приложений из App Store.'},
      {en: 'Installers for both platforms are built and tested on GitHub.', ru: 'Установщики для обеих платформ собираются и проверяются на GitHub.'}
    ]
  },
  {
    version: '1.2.0', date: '2026-10-18',
    title: {en: 'Filters everywhere', ru: 'Фильтры везде'},
    items: [
      {en: 'Every list can be filtered — by drive, type, publisher, size, date or verdict — and each option shows how many items it matches.', ru: 'Любой список можно отфильтровать — по диску, типу, издателю, размеру, дате или рекомендации, — и у каждого варианта видно число совпадений.'},
      {en: 'Programs and Startup show which drive each item is on; Cleaner can clean just one drive.', ru: 'Программы и Автозагрузка показывают диск каждого элемента; Очистка умеет чистить только один диск.'}
    ]
  },
  {
    version: '1.1.0', date: '2026-10-18',
    title: {en: 'Smarter explanations', ru: 'Понятные объяснения'},
    items: [
      {en: 'Every cleaner item says what it holds, what you lose and a verdict: Safe, Read first or Keep.', ru: 'Каждый пункт очистки объясняет, что в нём хранится, что вы потеряете, и даёт оценку: «Безопасно», «Сначала прочтите» или «Оставить».'},
      {en: 'Disk analyzer explains large files: what they are, which program they belong to and whether deleting is safe.', ru: 'Анализ диска объясняет большие файлы: что это, к какой программе относится и безопасно ли удалять.'},
      {en: 'Optimize: reversible tweaks, power plans and the apps using the most memory.', ru: 'Оптимизация: обратимые настройки, схемы электропитания и программы, занимающие больше всего памяти.'},
      {os: 'win', en: 'Windows settings: refresh rate, resolution, dark mode, the taskbar and more.', ru: 'Параметры Windows: частота обновления, разрешение, тёмная тема, панель задач и другое.'}
    ]
  },
  {
    version: '1.0.0', date: '2026-10-18',
    title: {en: 'Rebuilt from scratch', ru: 'Создан заново'},
    items: [
      {en: 'Smart Scan, Cleaner, a registry cleaner with backups and a full registry editor.', ru: 'Умное сканирование, Очистка, очистка реестра с резервными копиями и полноценный редактор реестра.'},
      {en: 'An uninstaller that removes leftovers, a startup manager and app updates through WinGet.', ru: 'Удаление программ вместе с остатками, менеджер автозагрузки и обновление программ через WinGet.'},
      {en: 'Disk analyzer, duplicate finder, tools and History with one-click restore.', ru: 'Анализ диска, поиск дубликатов, инструменты и История с восстановлением в один клик.'},
      {en: 'A new design with light and dark themes.', ru: 'Новый дизайн со светлой и тёмной темой.'}
    ]
  }
];

const parts = v => String(v || '0').split('.').map(n => parseInt(n, 10) || 0);
// Compares versions like "2.10.0" and "2.9.1": negative when a is older than b.
export function compareVersions(a, b) {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
}
