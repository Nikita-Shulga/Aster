'use strict';
// Russian translations — see index.cjs.
// macOS tweaks (src/main/mac/tweaks.cjs). Titles and on/off labels also appear in History ("title: before → after"),
// so keep on/off short. Texts shared with tweaks-win.cjs must have the same translation there.
module.exports = {
  // ---------- Groups ----------
  'Performance': 'Производительность',
  'Privacy': 'Конфиденциальность',
  'Appearance': 'Оформление',
  'Finder': 'Finder',
  'Dock': 'Dock',
  'Keyboard & trackpad': 'Клавиатура и трекпад',
  'Screenshots': 'Снимки экрана',

  // ---------- Shared state labels ----------
  'On': 'Вкл.',
  'Off': 'Выкл.',
  'Shown': 'Показано',
  'Hidden': 'Скрыто',
  'Light': 'Светлый',
  'Dark': 'Тёмный',
  'Left': 'Слева',
  'Default': 'По умолчанию',
  'Instant': 'Мгновенно',
  'This Mac': 'Этот Mac',

  // ---------- Performance ----------
  'Turn off window opening animations': 'Отключить анимацию открытия окон',
  'Windows and sheets appear instantly instead of zooming in.': 'Окна и диалоговые панели появляются сразу, без анимации увеличения.',
  'The Mac feels snappier, especially on older models.': 'Mac кажется более отзывчивым, особенно если модель не новая.',
  'Less smooth. Affects apps you open after the change.': 'Интерфейс становится менее плавным. Действует на приложения, открытые после изменения.',

  'Faster window resizing': 'Быстрое изменение размера окон',
  'Window resize and sheet animations take almost no time.': 'Анимация изменения размера окон и появления диалоговых панелей проходит почти мгновенно.',
  'Less waiting for animations.': 'Меньше ожидания анимаций.',
  'Transitions look abrupt.': 'Переходы выглядят резкими.',

  'Show a hidden Dock instantly': 'Мгновенно показывать скрытый Dock',
  'If the Dock is set to hide automatically, it appears immediately when you move the pointer to it.': 'Если Dock скрывается автоматически, он появляется сразу, как только вы подводите к нему указатель.',
  'No half-second wait for the Dock.': 'Не нужно ждать Dock полсекунды.',
  'The Dock may pop up more often by accident.': 'Dock может чаще появляться случайно.',
  'Default delay': 'Стандартная задержка',

  'Stop bouncing app icons': 'Отключить подпрыгивание значков',
  'App icons no longer bounce in the Dock while the app opens.': 'Значки приложений в Dock больше не подпрыгивают во время запуска.',
  'Calmer Dock.': 'Dock выглядит спокойнее.',
  'Less visual feedback that an app is starting.': 'Сложнее заметить, что приложение запускается.',
  'No bounce': 'Не подпрыгивают',
  'Bounce': 'Подпрыгивают',

  'No .DS_Store files on network & USB drives': 'Без файлов .DS_Store на сетевых и USB-дисках',
  'Finder stops writing hidden .DS_Store files to network shares and USB drives.': 'Finder перестаёт создавать скрытые файлы .DS_Store в общих сетевых папках и на USB-накопителях.',
  'Faster browsing of network folders, and no clutter on drives you share with Windows PCs.': 'Сетевые папки открываются быстрее, а на дисках, которые вы подключаете и к компьютерам с Windows, не остаётся мусора.',
  'Finder doesn’t remember view options (icon size, sort order) for folders on those drives.': 'Finder не запоминает параметры вида (размер значков, порядок сортировки) для папок на этих дисках.',
  'Finder default': 'По умолчанию',

  'Turn off Spotlight indexing': 'Отключить индексирование Spotlight',
  'Stops Spotlight from cataloguing files on all drives.': 'Spotlight перестаёт индексировать файлы на всех дисках.',
  'Less background disk and CPU activity.': 'Меньше фоновой нагрузки на диск и процессор.',
  'Spotlight, Finder search and Mail search stop finding files and messages. Not worth it on most Macs.': 'Spotlight, поиск в Finder и в Почте перестанут находить файлы и письма. На большинстве компьютеров Mac отключать не стоит.',
  'Indexing off': 'Индексирование отключено',
  'Indexing on': 'Индексирование включено',

  'Low Power Mode': 'Режим энергосбережения',
  'Reduces energy use by lowering processor speed and pausing some background activity.': 'Снижает энергопотребление за счёт уменьшения частоты процессора и приостановки части фоновых процессов.',
  'Longer battery life, cooler and quieter.': 'Аккумулятор работает дольше, а Mac меньше греется и тише шумит.',
  'Heavy tasks (exports, games) run slower.': 'Ресурсоёмкие задачи (экспорт, игры) выполняются медленнее.',

  'Turn off Power Nap': 'Отключить Power Nap',
  'Stops the Mac waking up briefly while asleep to check mail, sync iCloud and make Time Machine backups.': 'Mac перестаёт ненадолго просыпаться в режиме сна, чтобы проверить почту, синхронизировать iCloud и создать резервные копии Time Machine.',
  'Less battery drain overnight and a cooler Mac in a bag.': 'Аккумулятор меньше разряжается за ночь, а Mac в сумке не нагревается.',
  'Mail, calendars and backups update only after you wake the Mac.': 'Почта, календари и резервные копии обновляются только после пробуждения Mac.',

  'Keep background apps at full speed': 'Не замедлять фоновые приложения',
  'Turns off App Nap, which slows down apps whose windows are hidden.': 'Отключает App Nap — функцию, которая замедляет приложения со скрытыми окнами.',
  'Long exports, downloads and renders keep full speed when you switch away.': 'Долгий экспорт, загрузка и рендеринг идут на полной скорости, даже когда вы переключаетесь на другое приложение.',
  'More battery use and heat. Leave on unless a background task is noticeably slow.': 'Выше расход заряда и нагрев. Оставьте App Nap включённым, если фоновые задачи заметно не замедляются.',
  'Full speed': 'Полная скорость',
  'App Nap': 'App Nap',

  // ---------- Privacy ----------
  'Turn off personalized Apple ads': 'Отключить персонализированную рекламу Apple',
  'Apple stops using your activity to personalize ads in the App Store, Apple News and Stocks.': 'Apple перестаёт использовать ваши действия для персонализации рекламы в App Store, Apple News и «Акциях».',
  'Less profiling for advertising.': 'Меньше сбора сведений о вас для рекламы.',
  'Ads are less relevant (you still see ads).': 'Реклама станет менее релевантной (но не исчезнет).',

  'Don’t share Mac analytics with Apple': 'Не делиться аналитикой Mac с Apple',
  'Stops sending diagnostic and usage data to Apple (Settings → Privacy & Security → Analytics).': 'Mac перестаёт отправлять в Apple данные диагностики и использования («Системные настройки → Конфиденциальность и безопасность → Аналитика и улучшения»).',
  'Less data about how you use your Mac leaves it.': 'С Mac уходит меньше данных о том, как вы им пользуетесь.',
  'Apple gets less information to fix bugs you run into.': 'У Apple будет меньше сведений для исправления ошибок, с которыми вы сталкиваетесь.',
  'Not shared': 'Не отправляется',
  'Shared': 'Отправляется',

  'Quiet crash reports': 'Ненавязчивые отчёты о сбоях',
  'When an app crashes, macOS shows a notification instead of a large “quit unexpectedly” dialog.': 'При сбое приложения macOS показывает уведомление вместо большого окна о неожиданном завершении работы.',
  'Fewer interruptions.': 'Меньше отвлекающих окон.',
  'Easy to miss that an app crashed.': 'Сбой приложения легко пропустить.',
  'Notification': 'Уведомление',
  'Dialog': 'Окно',

  // ---------- Mac settings: appearance ----------
  'Light or dark mode for macOS and apps that follow the system.': 'Светлый или тёмный режим для macOS и приложений, которые следуют системным настройкам.',
  'Show scroll bars': 'Показывать полосы прокрутки',
  'When scroll bars are visible in windows.': 'Когда в окнах видны полосы прокрутки.',
  'Automatic': 'Автоматически',
  'When scrolling': 'При прокрутке',
  'Always': 'Всегда',

  // ---------- Finder ----------
  'Show all file extensions': 'Показывать все расширения имён файлов',
  'Shows the end of file names, like “.pdf” or “.dmg”.': 'Показывает окончание имени файла, например «.pdf» или «.dmg».',
  'You see what a file really is.': 'Сразу видно настоящий тип файла.',
  'File names look a bit longer.': 'Имена файлов становятся немного длиннее.',

  'Show hidden files': 'Показывать скрытые файлы',
  'Shows files and folders that macOS normally hides, such as Library and dot-files.': 'Показывает файлы и папки, которые macOS обычно скрывает, например папку «Библиотеки» и файлы, имена которых начинаются с точки.',
  'Useful when troubleshooting or developing.': 'Пригодится для устранения неполадок и разработки.',
  'More clutter, and it is easier to delete something important. Tip: ⌘⇧. toggles this in Finder.': 'Больше лишнего на виду, и проще случайно удалить что-то важное. Совет: в Finder это переключается сочетанием ⌘⇧.',

  'Show path bar': 'Показывать строку пути',
  'Shows the folder path at the bottom of every Finder window.': 'Показывает путь к папке внизу каждого окна Finder.',
  'You always know where you are and can click any parent folder.': 'Всегда понятно, где вы находитесь, и в любую родительскую папку можно перейти одним нажатием.',
  'Takes a thin strip of window space.': 'Занимает узкую полоску в окне.',

  'Show status bar': 'Показывать строку состояния',
  'Shows item count and free space at the bottom of Finder windows.': 'Показывает число объектов и свободное место внизу окон Finder.',
  'See free disk space at a glance.': 'Свободное место на диске видно с первого взгляда.',

  'Keep folders on top': 'Папки всегда сверху',
  'Folders are listed before files when sorting by name, like on Windows.': 'При сортировке по имени папки идут перед файлами, как в Windows.',
  'Easier to find folders in long lists.': 'Папки проще найти в длинных списках.',
  'None really.': 'Практически никаких.',
  'On top': 'Сверху',
  'Mixed': 'Вперемешку',

  'Show your Library folder': 'Показывать папку «Библиотеки»',
  'Shows ~/Library in your home folder, where apps keep settings, caches and data.': 'Показывает ~/Library в домашней папке — там приложения хранят настройки, кэши и данные.',
  'Handy when following support guides or checking what an app left behind.': 'Удобно, когда вы следуете инструкциям поддержки или проверяете, что осталось после приложения.',
  'Easier to change something an app depends on.': 'Проще случайно изменить то, от чего зависит работа приложения.',

  'Save new documents to this Mac': 'Сохранять новые документы на этом Mac',
  'Save dialogs start in a folder on this Mac instead of iCloud Drive.': 'Окна сохранения открываются в папке на этом Mac, а не в iCloud Drive.',
  'Files don’t fill up iCloud storage or wait for upload.': 'Файлы не занимают место в хранилище iCloud и не ждут выгрузки.',
  'New documents aren’t automatically on your other devices.': 'Новые документы не появляются автоматически на других ваших устройствах.',
  'iCloud': 'iCloud',

  'Expanded save dialogs': 'Развёрнутые окна сохранения',
  'Save dialogs open with the full folder browser instead of the small version.': 'Окна сохранения сразу открываются с полным обзором папок, а не в компактном виде.',
  'Pick a folder without an extra click.': 'Папку можно выбрать без лишнего нажатия.',
  'Dialogs take more room.': 'Окна занимают больше места.',
  'Expanded': 'Развёрнутые',
  'Compact': 'Компактные',

  'Finder search looks in': 'Область поиска в Finder',
  'Where Finder searches when you type in a window’s search field.': 'Где Finder ищет, когда вы вводите запрос в поле поиска окна.',
  'Current folder': 'Текущая папка',

  'Don’t warn when changing an extension': 'Не предупреждать при смене расширения',
  'Renaming “photo.png” to “photo.jpg” no longer asks for confirmation.': 'Переименование «photo.png» в «photo.jpg» больше не требует подтверждения.',
  'Faster renaming.': 'Переименовывать быстрее.',
  'Easier to accidentally rename a file into a type it isn’t.': 'Проще по ошибке дать файлу расширение, не соответствующее его типу.',
  'No warning': 'Без предупреждения',
  'Warn': 'Предупреждать',

  // ---------- Dock ----------
  'Automatically hide the Dock': 'Автоматически скрывать Dock',
  'The Dock slides away until you move the pointer to the screen edge.': 'Dock убирается с экрана, пока вы не подведёте указатель к его краю.',
  'More screen space for windows.': 'Больше места на экране для окон.',
  'One extra movement to reach the Dock.': 'Чтобы добраться до Dock, нужно лишнее движение.',
  'Hide': 'Скрывать',
  'Always visible': 'Всегда виден',

  'Hide recent apps in the Dock': 'Скрывать недавние приложения в Dock',
  'Removes the section that shows recently used apps you didn’t pin.': 'Убирает раздел с недавно использованными приложениями, которые вы не закрепили.',
  'A tidier, predictable Dock.': 'Dock становится аккуратнее и предсказуемее.',
  'Recently used apps aren’t one click away.': 'Недавние приложения уже не открыть одним нажатием.',

  'Dock position': 'Положение Dock',
  'Which screen edge the Dock sits on.': 'У какого края экрана находится Dock.',
  'Bottom': 'Снизу',
  'Right': 'Справа',

  'Minimize effect': 'Эффект свёртывания окон',
  'The animation used when a window goes into the Dock. Scale is quicker.': 'Анимация, с которой окно убирается в Dock. «Масштаб» работает быстрее.',
  'Genie': 'Джинн',
  'Scale': 'Масштаб',

  // ---------- Keyboard & trackpad ----------
  'Tap to click': 'Нажатие для имитации щелчка',
  'A light tap on the trackpad counts as a click.': 'Лёгкое касание трекпада срабатывает как нажатие.',
  'Less pressure needed; quieter.': 'Не нужно надавливать, и это тише.',
  'Accidental clicks while typing.': 'Возможны случайные нажатия во время набора текста.',

  'Fast key repeat': 'Быстрый автоповтор клавиш',
  'Holding a key repeats it faster and sooner.': 'При удержании клавиши символ начинает повторяться раньше и быстрее.',
  'Quicker cursor movement and deleting.': 'Курсор перемещается и текст удаляется быстрее.',
  'Easier to type repeated characters by accident.': 'Проще случайно напечатать лишние повторы символа.',
  'Fast': 'Быстрый',

  'Repeat keys instead of accent menu': 'Автоповтор вместо меню символов',
  'Holding a letter repeats it instead of showing the accent picker (é, è, ê…).': 'При удержании буквы она повторяется, а не открывается меню выбора символов с диакритикой (é, è, ê…).',
  'Useful for coding and games.': 'Удобно для программирования и игр.',
  'You lose the quick accent menu.': 'Пропадает быстрое меню символов с диакритикой.',
  'Repeat': 'Повтор',
  'Accent menu': 'Меню символов',

  'Turn off smart quotes and dashes': 'Отключить смарт-кавычки и тире',
  'Typing " and -- stays as typed instead of becoming curly quotes and dashes.': 'Символы " и -- остаются как есть и не заменяются на типографские кавычки и тире.',
  'Essential when writing code or commands.': 'Незаменимо при написании кода и команд.',
  'Text looks less typographic.': 'Текст выглядит менее аккуратно с точки зрения типографики.',

  'Turn off autocorrect': 'Отключить автокоррекцию',
  'macOS stops changing words automatically while you type.': 'macOS перестаёт автоматически исправлять слова при наборе.',
  'No surprise corrections, especially in other languages or names.': 'Никаких неожиданных исправлений — особенно в словах на других языках и в именах.',
  'Typos stay until you fix them.': 'Опечатки остаются, пока вы их не исправите.',

  // ---------- Screenshots ----------
  'Screenshot format': 'Формат снимков экрана',
  'File type for screenshots. JPG files are much smaller; PNG is lossless.': 'Тип файлов для снимков экрана. Файлы JPG намного меньше, а PNG сохраняет изображение без потерь.',
  'PNG': 'PNG',
  'JPG': 'JPG',
  'HEIC': 'HEIC',

  'No shadow on window screenshots': 'Снимки окон без тени',
  'Window screenshots (⌘⇧4, then Space) are saved without the large drop shadow.': 'Снимки окон (⌘⇧4, затем пробел) сохраняются без большой тени.',
  'Tighter, smaller images.': 'Изображения компактнее и меньше по размеру.',
  'Windows look flatter on light backgrounds.': 'На светлом фоне окна выглядят более плоскими.',
  'No shadow': 'Без тени',
  'Shadow': 'С тенью',

  // ---------- Errors ----------
  'Unknown setting': 'Неизвестный параметр',
  'Invalid value': 'Недопустимое значение',
  'This process is part of macOS and cannot be closed by Aster.': 'Этот процесс входит в состав macOS, и Aster не может его завершить.',
  'Not available on macOS.': 'Недоступно в macOS.'
};
