'use strict';
// Russian translations of text in the macOS modules other than cleaning rules and tweaks
// (mac/leftovers, programs, startup, updates, tools, system, display, sh) — see index.cjs.
// Text these modules share word for word with the Windows modules (“Install folder”, “Unknown CPU”, “Refresh the list
// and try again.”, “Flush DNS cache”…) is translated once, in system.cjs / registry.cjs / identify-win.cjs / cleaner-win.cjs.
module.exports = {
  // ---------- Leftovers (mac/leftovers.cjs): categories ----------
  'Settings of removed apps': 'Настройки удалённых приложений',
  'Preference files (.plist) of apps that are no longer installed.': 'Файлы настроек (.plist) приложений, которых больше нет на Mac.',
  'Small files in ~/Library/Preferences where apps store their settings. These belong to apps that are no longer on this Mac.':
    'Небольшие файлы в ~/Library/Preferences, в которых приложения хранят свои настройки. Эти файлы остались от приложений, которых больше нет на этом Mac.',
  'If you reinstall one of these apps later, it starts with default settings.':
    'Если позже вы снова установите такое приложение, оно запустится с настройками по умолчанию.',
  'Safe to clean. Files go to the Trash, so you can put them back.':
    'Очищать безопасно. Файлы перемещаются в Корзину, так что их можно вернуть.',
  'Caches of removed apps': 'Кэши удалённых приложений',
  'Cache folders left behind by uninstalled apps.': 'Папки кэша, оставшиеся от удалённых приложений.',
  'Cached data in ~/Library/Caches from apps that were removed.': 'Кэшированные данные удалённых приложений в ~/Library/Caches.',
  'Nothing — the apps are gone.': 'Ничего — этих приложений уже нет.',
  'Saved window state': 'Сохранённое состояние окон',
  'Window positions saved by apps that were removed.': 'Положение окон, сохранённое удалёнными приложениями.',
  'Information macOS keeps to reopen an app’s windows where you left them, for apps that are no longer installed.':
    'Сведения, по которым macOS открывает окна приложения там же, где вы их оставили, — для приложений, которых больше нет на Mac.',
  'Nothing.': 'Ничего.',
  'Broken background agents': 'Неработающие фоновые агенты',
  'Launch agents pointing to programs that no longer exist.': 'Агенты запуска, которые ссылаются на уже удалённые программы.',
  'Instructions in ~/Library/LaunchAgents to start a helper program at login, where the program has been deleted.':
    'Инструкции в ~/Library/LaunchAgents, которые запускают при входе в систему вспомогательную программу, хотя сама программа уже удалена.',
  'macOS stops trying to start a missing program at every login.':
    'macOS перестанет пытаться запустить отсутствующую программу при каждом входе в систему.',
  'Logs of removed apps': 'Журналы удалённых приложений',
  'Log folders of apps that are no longer installed.': 'Папки журналов приложений, которых больше нет на Mac.',
  'Text logs in ~/Library/Logs written by apps that were removed.': 'Текстовые журналы в ~/Library/Logs, записанные удалёнными приложениями.',
  'App data of removed apps': 'Данные удалённых приложений',
  'Folders in Application Support that no installed app uses.': 'Папки в Application Support, которые не использует ни одно установленное приложение.',
  'Folders in ~/Library/Application Support whose app seems to be gone. They can contain documents, libraries, game saves or databases the app stored.':
    'Папки в ~/Library/Application Support, приложение которых, похоже, удалено. В них могут храниться документы, библиотеки, сохранения игр или базы данных этого приложения.',
  'If the app comes back, its data (and possibly saves or projects stored inside) is gone. Some folders belong to command-line tools rather than apps.':
    'Если вы снова установите приложение, его данных (а возможно, и сохранений или проектов внутри) уже не будет. Некоторые папки принадлежат не приложениям, а инструментам командной строки.',
  'Review the list — only remove folders you recognise as belonging to apps you deleted.':
    'Просмотрите список и удаляйте только те папки, которые точно относятся к удалённым вами приложениям.',
  'Sandbox containers of removed apps': 'Контейнеры удалённых приложений',
  'Data containers of App Store apps that were deleted.': 'Контейнеры данных удалённых приложений из App Store.',
  'Each App Store app keeps its data in a container in ~/Library/Containers. These belong to apps that are no longer installed.':
    'Каждое приложение из App Store хранит свои данные в контейнере в ~/Library/Containers. Эти контейнеры остались от приложений, которых больше нет на Mac.',
  'Documents those apps kept inside their container are removed too.': 'Документы, которые эти приложения хранили в своих контейнерах, тоже будут удалены.',
  'Review first; usually safe for apps you deleted on purpose.': 'Сначала просмотрите список. Для приложений, удалённых намеренно, это обычно безопасно.',

  // ---------- Leftovers: errors ----------
  'Scan again before cleaning.': 'Перед очисткой выполните сканирование ещё раз.',
  'The registry editor is only available on Windows.': 'Редактор реестра доступен только в Windows.',

  // ---------- Applications (mac/programs.cjs): leftover reasons ----------
  'Settings': 'Настройки',
  'Sandbox container (app data)': 'Контейнер приложения (данные)',
  'Shared app data': 'Общие данные приложений',
  'Window state': 'Состояние окон',
  'Web storage': 'Веб-хранилище',
  'Web data': 'Веб-данные',
  'Cookies': 'Файлы cookie',
  'Background agent': 'Фоновый агент',
  'Scripts': 'Скрипты',
  'Shared app data (all users)': 'Общие данные приложений (все пользователи)',
  'Background agent (all users)': 'Фоновый агент (все пользователи)',
  'Background service (all users)': 'Фоновая служба (все пользователи)',
  'Helper tool (all users)': 'Вспомогательная программа (все пользователи)',
  'Settings (all users)': 'Настройки (все пользователи)',

  // ---------- Applications: errors ----------
  'Apps that come with macOS cannot be removed.': 'Приложения, которые входят в состав macOS, удалить нельзя.',
  'Not needed on macOS — removing the app removes its entry.': 'В macOS это не нужно: при удалении приложения исчезает и его запись.',

  // ---------- Startup (mac/startup.cjs) ----------
  'Launch agent · Only me': 'Агент запуска · Только я',
  'Launch agent · All users': 'Агент запуска · Все пользователи',
  'Background service (daemon)': 'Фоновая служба (демон)',
  'Login item': 'Объект входа',
  'This item can’t be switched; remove it instead.': 'Этот объект нельзя включить или выключить — его можно только удалить.',
  'Unsupported item label.': 'Неподдерживаемая метка объекта.',
  'Choose an app.': 'Выберите приложение.',

  // ---------- Updates (mac/updates.cjs) ----------
  'Current': 'Текущая',
  'macOS updates install from System Settings → Software Update.': 'Обновления macOS устанавливаются через «Системные настройки» → «Обновление ПО».',
  'Invalid package': 'Недопустимый пакет',

  // ---------- Tools (mac/tools.cjs): actions ----------
  'Create a Time Machine snapshot': 'Создать снимок Time Machine',
  'Saves a local snapshot of your Mac you can restore from if a change goes wrong.':
    'Сохраняет локальный снимок Mac, из которого можно восстановиться, если какое-то изменение пойдёт не так.',
  'Free space used by local snapshots': 'Освободить место, занятое локальными снимками',
  'Removes Time Machine local snapshots, which can hold many gigabytes of “purgeable” space.':
    'Удаляет локальные снимки Time Machine, которые могут занимать много гигабайт «очищаемого» пространства.',
  'Free up memory': 'Освободить память',
  'Clears inactive memory and disk caches so a sluggish Mac gets room back for apps. Asks for your password.':
    'Очищает неактивную память и дисковые кэши, чтобы у медленно работающего Mac снова хватало памяти для приложений. Потребуется пароль.',
  'Fixes sites that fail to load after network or DNS changes. Asks for your password.':
    'Помогает, если после изменения настроек сети или DNS сайты перестали открываться. Потребуется пароль.',
  'Rebuild Spotlight index': 'Перестроить индекс Spotlight',
  'Fixes Spotlight not finding files. Re-indexing runs in the background for a while.':
    'Помогает, если Spotlight не находит файлы. Переиндексация займёт некоторое время и пройдёт в фоне.',
  'Fix duplicate “Open With” entries': 'Убрать повторы в меню «Открыть в программе»',
  'Rebuilds the Launch Services database that lists which apps open which files.':
    'Перестраивает базу данных Launch Services, в которой записано, какие приложения открывают какие файлы.',
  'Empty the Trash': 'Очистить Корзину',
  'Permanently deletes everything in the Trash.': 'Безвозвратно удаляет всё содержимое Корзины.',

  // ---------- Tools: apps and System Settings shortcuts ----------
  'Activity Monitor': 'Мониторинг системы',
  'Disk Utility': 'Дисковая утилита',
  'Console': 'Консоль',
  'System Information': 'Информация о системе',
  'Terminal': 'Терминал',
  'Keychain Access': 'Связка ключей',
  'Storage': 'Хранилище',
  'Software Update': 'Обновление ПО',
  'Login Items': 'Объекты входа',
  'Privacy & Security': 'Конфиденциальность и безопасность',
  'Displays': 'Дисплеи',
  'Battery': 'Аккумулятор',
  'Network': 'Сеть',

  // ---------- Tools: results and errors ----------
  'Snapshot created': 'Снимок создан',
  'No local snapshots were found': 'Локальные снимки не найдены',
  'Spotlight is re-indexing in the background': 'Spotlight переиндексирует диск в фоне',
  'Inactive memory freed': 'Неактивная память освобождена',
  'Trash emptied': 'Корзина очищена',
  '“Open With” list rebuilt': 'Список «Открыть в программе» перестроен',
  'Allow Aster to control Finder in System Settings → Privacy & Security → Automation.':
    'Разрешите Aster управлять Finder: «Системные настройки» → «Конфиденциальность и безопасность» → «Автоматизация».',

  // ---------- Displays (mac/display.cjs) ----------
  'Display': 'Дисплей',
  'macOS only allows changing resolution and refresh rate in System Settings → Displays.':
    'В macOS разрешение и частоту обновления можно изменить только в разделе «Системные настройки» → «Дисплеи».',

  // ---------- Commands (mac/sh.cjs) ----------
  'Timed out.': 'Время ожидания истекло.',
  'The administrator password prompt was cancelled.': 'Запрос пароля администратора отменён.'
};
