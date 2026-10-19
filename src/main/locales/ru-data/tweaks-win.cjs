'use strict';
// Russian translations — see index.cjs.
// Windows tweaks (src/main/tweaks.cjs). Titles and on/off labels also appear in History ("title: before → after"),
// so keep on/off short. Texts shared with tweaks-mac.cjs must have the same translation there.
module.exports = {
  // ---------- Groups ----------
  'Performance': 'Производительность',
  'Gaming': 'Игры',
  'Privacy & ads': 'Конфиденциальность и реклама',
  'Appearance': 'Оформление',
  'File Explorer': 'Проводник',
  'Taskbar & input': 'Панель задач и ввод',

  // ---------- Shared state labels ----------
  'On': 'Вкл.',
  'Off': 'Выкл.',
  'Shown': 'Показано',
  'Hidden': 'Скрыто',
  'Light': 'Светлый',
  'Dark': 'Тёмный',
  'Left': 'Слева',

  // ---------- Performance ----------
  'Start apps right after sign-in': 'Запускать программы сразу после входа',
  'Windows waits about 10 seconds after you sign in before launching your startup apps. This removes that wait.': 'После входа в систему Windows ждёт около 10 секунд, прежде чем запустить программы из автозагрузки. Этот параметр убирает задержку.',
  'Your startup apps are ready noticeably sooner after you log in.': 'Программы из автозагрузки готовы к работе заметно раньше.',
  'On an old hard disk (HDD), everything starting at once can make the first minute feel busy.': 'На старом жёстком диске (HDD) одновременный запуск всех программ может замедлить работу в первую минуту.',
  'No delay': 'Без задержки',
  'Windows default delay': 'Стандартная задержка',

  'Faster menus': 'Быстрое открытие меню',
  'Sub-menus (for example in right-click menus) open after 0.1 s instead of the default 0.4 s.': 'Вложенные меню (например, в контекстном меню) открываются через 0,1 с вместо стандартных 0,4 с.',
  'Menus feel snappier.': 'Меню реагируют быстрее.',
  'None for most people. Sub-menus open more eagerly when you move the mouse across them.': 'Для большинства — никаких. Вложенные меню охотнее раскрываются, когда указатель проходит над ними.',
  '100 ms': '100 мс',
  '400 ms (default)': '400 мс (по умолчанию)',

  'Turn off animation effects': 'Отключить эффекты анимации',
  'Disables window and menu animations — the same switch as Settings → Accessibility → Visual effects → Animation effects.': 'Отключает анимацию окон и меню — это тот же переключатель, что и «Параметры → Специальные возможности → Визуальные эффекты → Эффекты анимации».',
  'Windows and menus appear instantly; helps on older or weaker PCs.': 'Окна и меню появляются мгновенно; помогает на старых и маломощных компьютерах.',
  'Windows feels less smooth. On a modern PC the speed difference is barely noticeable.': 'Интерфейс Windows становится менее плавным. На современном компьютере разница в скорости почти незаметна.',
  'Animations off': 'Анимация отключена',
  'Animations on': 'Анимация включена',

  'Turn off transparency effects': 'Отключить эффекты прозрачности',
  'Makes the taskbar, Start menu and app backgrounds solid instead of see-through.': 'Панель задач, меню «Пуск» и фон приложений становятся непрозрачными.',
  'Slightly less work for the graphics chip; can help on weak laptops and saves a little battery.': 'Немного снижает нагрузку на графический процессор: помогает на слабых ноутбуках и чуть экономит заряд батареи.',
  'A flatter, less modern look.': 'Интерфейс выглядит более плоским и менее современным.',
  'Solid': 'Без прозрачности',
  'Transparent': 'С прозрачностью',

  'Turn off hibernation': 'Отключить гибернацию',
  'Disables Hibernate and deletes C:\\hiberfil.sys, a hidden file roughly 40% the size of your RAM.': 'Отключает режим гибернации и удаляет C:\\hiberfil.sys — скрытый файл размером примерно 40 % от объёма оперативной памяти.',
  'Frees several gigabytes on your system drive immediately.': 'Сразу освобождает несколько гигабайт на системном диске.',
  'The Hibernate option and Fast Startup stop working, so a cold boot can take a few seconds longer. Sleep still works.': 'Перестают работать гибернация и быстрый запуск, поэтому включение компьютера может занимать на несколько секунд больше. Спящий режим продолжит работать.',
  'Hibernation off': 'Гибернация отключена',
  'Hibernation on': 'Гибернация включена',

  'Automatic cleanup (Storage Sense)': 'Автоматическая очистка (Контроль памяти)',
  'Lets Windows automatically delete temporary files and old Recycle Bin items when the drive is getting full.': 'Windows автоматически удаляет временные файлы и старое содержимое Корзины, когда на диске заканчивается место.',
  'Your drive is less likely to fill up between cleanups.': 'Диск реже переполняется в промежутках между очистками.',
  'Items older than 30 days in the Recycle Bin are removed automatically.': 'Объекты, которые лежат в Корзине дольше 30 дней, удаляются автоматически.',

  'Turn off search indexing': 'Отключить индексирование поиска',
  'Stops the Windows Search service, which constantly catalogues your files so searches are instant.': 'Останавливает службу Windows Search, которая постоянно индексирует файлы, чтобы поиск работал мгновенно.',
  'Less background disk activity — mostly noticeable on old hard disks (HDDs).': 'Меньше фоновой нагрузки на диск — заметно в основном на старых жёстких дисках (HDD).',
  'Searching files in Start, Explorer and Outlook becomes much slower. Not worth it on an SSD.': 'Поиск файлов в меню «Пуск», Проводнике и Outlook станет намного медленнее. На SSD отключать не стоит.',
  'Indexing off': 'Индексирование отключено',
  'Indexing on': 'Индексирование включено',

  // ---------- Gaming ----------
  'Game Mode': 'Игровой режим',
  'When a game is running, Windows gives it priority and pauses updates and notifications.': 'Пока запущена игра, Windows отдаёт ей приоритет и приостанавливает обновления и уведомления.',
  'Steadier frame rates and no update installs mid-game.': 'Более стабильная частота кадров, и обновления не устанавливаются посреди игры.',
  'None for most people.': 'Для большинства — никаких.',

  'Turn off background game recording': 'Отключить фоновую запись игр',
  'Stops Xbox Game Bar from continuously recording gameplay in the background ("Record what happened").': 'Xbox Game Bar перестаёт постоянно записывать игровой процесс в фоновом режиме (чтобы можно было сохранить то, что уже произошло).',
  'Frees CPU and GPU time — often a few extra FPS.': 'Освобождает ресурсы процессора и видеокарты — часто это несколько дополнительных FPS.',
  'You can no longer save the last 30 seconds of gameplay after the fact. Manual recording with Win+Alt+R still works.': 'Сохранить последние 30 секунд игры задним числом больше не получится. Запись вручную через Win+Alt+R продолжит работать.',
  'Recording off': 'Запись отключена',
  'Recording on': 'Запись включена',

  'Hardware-accelerated GPU scheduling': 'Планирование графического процессора с аппаратным ускорением',
  'Lets the graphics card manage its own memory instead of Windows doing it.': 'Видеокарта сама управляет своей памятью вместо Windows.',
  'Can reduce input lag and improve frame pacing; required for DLSS Frame Generation.': 'Может уменьшить задержку ввода и сделать смену кадров равномернее; необходимо для DLSS Frame Generation.',
  'Needs a GPU from roughly 2018 or newer with a current driver. A few older games or apps can behave worse.': 'Нужна видеокарта примерно 2018 года выпуска или новее с актуальным драйвером. Некоторые старые игры и приложения могут работать хуже.',

  'Turn off mouse acceleration': 'Отключить ускорение мыши',
  'Disables "Enhance pointer precision", so the pointer moves exactly as far as your hand does, regardless of speed.': 'Отключает параметр «Повышенная точность установки указателя»: указатель смещается ровно настолько, насколько вы двигаете рукой, независимо от скорости.',
  'Consistent aim and muscle memory in games.': 'Стабильное прицеливание и мышечная память в играх.',
  'On a large screen with a slow mouse, you may need to move your hand further.': 'На большом экране при низкой скорости указателя придётся сильнее двигать рукой.',
  'Acceleration off': 'Ускорение отключено',
  'Acceleration on': 'Ускорение включено',

  'Stop the Sticky Keys pop-up': 'Убрать окно залипания клавиш',
  'Pressing Shift five times no longer opens the "Turn on Sticky Keys?" dialog.': 'При пятикратном нажатии Shift больше не появляется окно «Включить залипание клавиш?».',
  'No more interruptions when you tap Shift repeatedly in games.': 'Частые нажатия Shift в играх больше не прерывают игру.',
  'If you rely on Sticky Keys as an accessibility feature, turn it on in Settings instead.': 'Если вы пользуетесь залипанием клавиш как специальной возможностью, включите его в приложении «Параметры».',
  'No pop-up': 'Без окна',
  'Pop-up on Shift ×5': 'Окно после Shift ×5',

  // ---------- Privacy & ads ----------
  'Turn off advertising ID': 'Отключить рекламный идентификатор',
  'Stops apps from using a unique advertising ID to show you personalised ads.': 'Приложения больше не могут использовать уникальный рекламный идентификатор, чтобы показывать вам персонализированную рекламу.',
  'Apps can’t track you across each other for advertising.': 'Приложения не могут сопоставлять ваши действия между собой в рекламных целях.',
  'Ads in apps are less personalised (you still see ads).': 'Реклама в приложениях будет менее персонализированной (но не исчезнет).',

  'Turn off tips, suggestions and lock-screen ads': 'Отключить советы, рекомендации и рекламу на экране блокировки',
  'Removes "Get even more out of Windows" screens, app suggestions in Start, tips notifications and promotional content on the lock screen.': 'Убирает экраны с предложениями завершить настройку Windows, рекомендации приложений в меню «Пуск», уведомления с советами и рекламу на экране блокировки.',
  'Fewer pop-ups and ads, and Windows stops silently installing suggested apps.': 'Меньше всплывающих окон и рекламы, а Windows перестаёт без спроса устанавливать рекомендуемые приложения.',
  'You won’t see tips about new Windows features.': 'Вы не будете видеть советы о новых возможностях Windows.',

  'Search only this PC in Start': 'Искать в меню «Пуск» только на компьютере',
  'Stops the Start menu search from sending what you type to Bing and showing web results.': 'Поиск в меню «Пуск» перестаёт отправлять вводимый текст в Bing и показывать результаты из интернета.',
  'Faster, private search results — only your apps, files and settings.': 'Более быстрый и конфиденциальный поиск — только по вашим приложениям, файлам и параметрам.',
  'No quick web answers in Start. Windows may say “Some settings are managed by your organization”.': 'В меню «Пуск» не будет быстрых ответов из интернета. Windows может показывать надпись «Некоторыми параметрами управляет ваша организация».',
  'This PC only': 'Только компьютер',
  'PC + web': 'Компьютер и интернет',

  'Send only required diagnostic data': 'Отправлять только необходимые диагностические данные',
  'Limits the diagnostic data Windows sends to Microsoft to the required minimum.': 'Ограничивает диагностические данные, которые Windows отправляет в Microsoft, необходимым минимумом.',
  'Less data about how you use your PC leaves your computer.': 'С компьютера уходит меньше данных о том, как вы его используете.',
  'Windows shows “Some settings are managed by your organization” on the diagnostics page.': 'На странице диагностики Windows будет показывать надпись «Некоторыми параметрами управляет ваша организация».',
  'Required only': 'Только необходимые',
  'Windows default': 'По умолчанию',

  // ---------- Windows settings: appearance ----------
  'App colour mode': 'Цветовой режим приложений',
  'Whether apps (Settings, Explorer, Store and others) use a light or dark theme.': 'Светлая или тёмная тема для приложений («Параметры», Проводник, Microsoft Store и другие).',
  'Windows colour mode': 'Цветовой режим Windows',
  'Whether the taskbar, Start menu and notifications are light or dark.': 'Светлое или тёмное оформление панели задач, меню «Пуск» и уведомлений.',

  // ---------- Windows settings: File Explorer ----------
  'Show file extensions': 'Показывать расширения файлов',
  'Shows the end of file names, like ".pdf" or ".exe".': 'Показывает окончание имени файла, например «.pdf» или «.exe».',
  'You can see what a file really is — protects against fakes like "invoice.pdf.exe".': 'Сразу видно настоящий тип файла — это защищает от подделок вроде «invoice.pdf.exe».',
  'File names look a bit longer.': 'Имена файлов становятся немного длиннее.',

  'Show hidden files': 'Показывать скрытые файлы',
  'Shows files and folders marked as hidden, such as AppData.': 'Показывает файлы и папки с атрибутом «Скрытый», например AppData.',
  'Useful when you need to find app data or troubleshoot.': 'Пригодится, когда нужно найти данные приложений или устранить неполадки.',
  'More clutter in folders, and it is easier to delete something important.': 'В папках становится больше лишнего, и проще случайно удалить что-то важное.',

  'File Explorer opens to': 'Начальная страница Проводника',
  'The page you see when you open File Explorer.': 'Страница, которую вы видите при открытии Проводника.',
  'Home': 'Главная',
  'This PC': 'Этот компьютер',

  'Classic right-click menu': 'Классическое контекстное меню',
  'Brings back the full Windows 10 right-click menu instead of the short Windows 11 menu with “Show more options”.': 'Возвращает полное контекстное меню Windows 10 вместо сокращённого меню Windows 11 с пунктом «Показать дополнительные параметры».',
  'All options in one click — no more “Show more options”.': 'Все команды доступны в один щелчок — без «Показать дополнительные параметры».',
  'Loses the modern look of the Windows 11 menu.': 'Пропадает современный вид меню Windows 11.',
  'Classic': 'Классическое',
  'Windows 11 style': 'Как в Windows 11',

  // ---------- Windows settings: taskbar & input ----------
  'Taskbar alignment': 'Выравнивание панели задач',
  'Whether taskbar icons and the Start button sit in the centre or on the left.': 'Расположение значков панели задач и кнопки «Пуск» — по центру или слева.',
  'Center': 'По центру',

  'Search on the taskbar': 'Поиск на панели задач',
  'How search appears on the taskbar.': 'Как поиск отображается на панели задач.',
  'Icon': 'Значок',
  'Search box': 'Поле поиска',

  'Task view button': 'Кнопка «Представление задач»',
  'The button that shows all open windows and virtual desktops (also Win+Tab).': 'Кнопка, которая показывает все открытые окна и виртуальные рабочие столы (то же, что Win+Tab).',
  'Quick access to virtual desktops.': 'Быстрый доступ к виртуальным рабочим столам.',
  'Takes taskbar space; Win+Tab does the same.': 'Занимает место на панели задач, а Win+Tab делает то же самое.',

  '“End task” in taskbar right-click menu': '«Завершить задачу» в контекстном меню панели задач',
  'Adds “End task” when you right-click an app on the taskbar, so you can close a frozen app without Task Manager.': 'Добавляет пункт «Завершить задачу» в контекстное меню приложений на панели задач: зависшее приложение можно закрыть без Диспетчера задач.',
  'Close frozen apps in two clicks.': 'Зависшие приложения закрываются в два щелчка.',
  'Unsaved work in that app is lost if you use it.': 'При использовании этой команды несохранённые данные в приложении теряются.',

  'Clipboard history (Win+V)': 'Журнал буфера обмена (Win+V)',
  'Remembers the last things you copied; press Win+V to paste any of them.': 'Запоминает несколько последних скопированных фрагментов; нажмите Win+V, чтобы вставить любой из них.',
  'Paste something you copied earlier, not just the last item.': 'Можно вставить не только последний скопированный фрагмент, но и более ранние.',
  'Copied passwords stay in the history until you clear it or restart.': 'Скопированные пароли остаются в журнале, пока вы его не очистите или не перезагрузите компьютер.',

  // ---------- Errors ----------
  'Unknown setting': 'Неизвестный параметр',
  'Invalid value': 'Недопустимое значение',
  'This change needs administrator rights. Use "Restart as administrator".': 'Для этого изменения нужны права администратора. Воспользуйтесь командой «Перезапустить от имени администратора».',
  'Invalid plan': 'Недопустимая схема электропитания',
  'Invalid process': 'Недопустимый процесс',
  'This process is part of Windows and cannot be closed by Aster.': 'Этот процесс входит в состав Windows, и Aster не может его закрыть.'
};
