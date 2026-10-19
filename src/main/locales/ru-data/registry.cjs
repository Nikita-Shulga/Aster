'use strict';
// Russian translations — see index.cjs.
// Registry cleaner categories (registry.cjs) and registry errors (registry.cjs, registry-ps.cjs).
module.exports = {
  // ---------- Shared advice ----------
  'Worth fixing.': 'Стоит исправить.',
  'Safe housekeeping.': 'Безопасно: просто наводит порядок.',

  // ---------- Broken uninstall entries ----------
  'Broken uninstall entries': 'Неработающие записи в списке программ',
  'Programs listed as installed whose uninstaller and folder are gone.':
    'Программы, которые числятся установленными, хотя их папки и программы удаления уже нет.',
  'Entries in Settings → Installed apps for programs that were deleted without uninstalling. Clicking "Uninstall" on them only shows an error.':
    'Записи в разделе «Параметры» → «Установленные приложения» для программ, которые просто стёрли, а не удалили как положено. Кнопка «Удалить» для них выдаёт только ошибку.',
  'The ghost entry disappears from the apps list. Nothing else changes.':
    'Запись-призрак исчезнет из списка приложений. Больше ничего не изменится.',
  'Worth fixing. Programs on a drive that is currently unplugged are skipped automatically, so they are not flagged.':
    'Стоит исправить. Программы на дисках, которые сейчас отключены, пропускаются автоматически и в список проблем не попадают.',

  // ---------- Invalid startup entries ----------
  'Invalid startup entries': 'Неверные записи автозагрузки',
  'Programs set to run at sign-in that no longer exist.':
    'Несуществующие программы, которым назначен запуск при входе в систему.',
  'Instructions to start a program at sign-in, where the program file no longer exists.':
    'Команды на запуск программы при входе в систему, хотя файла этой программы уже нет.',
  'Windows stops trying to start a missing program — no more error pop-ups at sign-in.':
    'Windows перестанет пытаться запустить отсутствующую программу — сообщения об ошибках при входе в систему больше не появятся.',

  // ---------- Invalid application paths ----------
  'Invalid application paths': 'Неверные пути приложений',
  'App shortcuts registered with Windows that point to missing files.':
    'Зарегистрированные в Windows пути к приложениям, которые указывают на отсутствующие файлы.',
  'Registrations that let you start apps by name (Win+R → "chrome") for apps that were removed.':
    'Записи, позволяющие запускать приложения по имени (Win+R → «chrome»), — для уже удалённых приложений.',
  'Typing the removed app’s name in Run no longer gives an error.':
    'Ввод имени удалённого приложения в окне «Выполнить» больше не будет приводить к ошибке.',

  // ---------- Missing shared DLLs ----------
  'Missing shared DLLs': 'Отсутствующие общие DLL',
  'Shared library counters for files that were removed.': 'Счётчики общих библиотек для удалённых файлов.',
  'Counters installers use to know how many programs share a library file — for files that no longer exist.':
    'Счётчики, по которым установщики определяют, сколько программ используют один файл библиотеки, — для файлов, которых больше нет.',
  'Nothing visible; just tidier records.': 'Внешне ничего — просто записи станут аккуратнее.',
  'Safe, but gives no noticeable benefit. Fix or skip as you like.':
    'Безопасно, но заметной пользы не даёт. Исправлять или нет — на ваше усмотрение.',

  // ---------- Obsolete "Open with" apps ----------
  'Obsolete "Open with" apps': 'Устаревшие приложения в «Открыть с помощью»',
  'Applications offered in "Open with" that were uninstalled.':
    'Удалённые приложения, которые всё ещё предлагаются в меню «Открыть с помощью».',
  'Entries for removed programs that still appear in the "Open with" menu.':
    'Записи удалённых программ, которые до сих пор видны в меню «Открыть с помощью».',
  'Removed programs stop appearing in "Open with".': 'Удалённые программы перестанут появляться в меню «Открыть с помощью».',

  // ---------- Unused file extensions ----------
  'Unused file extensions': 'Неиспользуемые расширения файлов',
  'File types linked to programs that are not registered anymore.':
    'Типы файлов, связанные с программами, которые больше не зарегистрированы.',
  'File types (like .xyz) that point to a program type Windows no longer knows.':
    'Типы файлов (например, .xyz), которые ссылаются на тип программы, неизвестный Windows.',
  'Those file types become "unknown" — which they effectively already are. Rarely, an app re-creates the link the next time it starts.':
    'Эти типы файлов станут «неизвестными» — по сути, они уже такие. Изредка приложение при следующем запуске заново создаёт связь.',
  'Optional. Harmless either way; not selected by default.':
    'Необязательно. Вреда не будет в любом случае; по умолчанию не выбрано.',

  // ---------- Broken COM registrations ----------
  'Broken COM registrations': 'Неработающие регистрации COM',
  'Per-user ActiveX/COM components whose files were removed.':
    'Компоненты ActiveX/COM текущего пользователя, файлы которых удалены.',
  'Registrations of program components (plug-ins, shell extensions) whose files are gone — usually from uninstalled apps.':
    'Регистрации программных компонентов (подключаемых модулей, расширений оболочки), файлов которых уже нет, — обычно от удалённых приложений.',
  'Usually nothing. In rare cases a program that installs components on demand has to re-register them.':
    'Обычно ничего. В редких случаях программе, которая устанавливает компоненты по требованию, придётся зарегистрировать их заново.',
  'Only fix if a program shows "class not registered" errors. Not selected by default.':
    'Исправляйте, только если программа выдаёт ошибки «Класс не зарегистрирован». По умолчанию не выбрано.',

  // ---------- MUI cache ----------
  'MUI cache': 'Кэш MUI',
  'Cached program names for executables that were deleted.':
    'Сохранённые в кэше названия программ, исполняемые файлы которых удалены.',
  'A cache of display names for programs you ran, used by Windows menus — for programs that no longer exist.':
    'Кэш отображаемых названий запускавшихся программ, которым пользуются меню Windows, — для программ, которых больше нет.',
  'Nothing. It is a pure cache that Windows refills.': 'Ничего. Это обычный кэш, Windows заполнит его снова.',
  'Safe to fix. Mostly a privacy cleanup: it reveals which programs you ran.':
    'Исправлять безопасно. В основном это очистка ради конфиденциальности: по этим записям видно, какие программы вы запускали.',

  // ---------- Compatibility records ----------
  'Compatibility records': 'Записи о совместимости',
  'Compatibility Assistant entries for programs that no longer exist.':
    'Записи помощника по совместимости программ для программ, которых больше нет.',
  'Notes Windows keeps about programs you ran (often installers in Downloads) to apply compatibility fixes — for files that are gone.':
    'Заметки Windows о запускавшихся программах (часто это установщики в папке «Загрузки»), нужные для исправления проблем совместимости, — для файлов, которых уже нет.',
  'Nothing. Records for existing programs are never touched.': 'Ничего. Записи существующих программ никогда не затрагиваются.',
  'Safe to fix. Also a privacy cleanup.': 'Исправлять безопасно. Заодно это очистка ради конфиденциальности.',

  // ---------- Installer folders ----------
  'Installer folders': 'Папки установщика',
  'Windows Installer references to folders that were removed.': 'Ссылки установщика Windows на удалённые папки.',
  'Windows Installer’s list of folders it created for installed programs, where the folder is now missing.':
    'Список папок, которые установщик Windows создал для установленных программ, — тех, что теперь отсутствуют.',
  'Usually nothing. If a program’s folder was removed by mistake, its "Repair" option may no longer work.':
    'Обычно ничего. Если папку программы удалили по ошибке, её команда «Восстановить» может перестать работать.',
  'Optional; not selected by default. Gives no speed benefit.': 'Необязательно; по умолчанию не выбрано. На скорость не влияет.',

  // ---------- Missing fonts ----------
  'Missing fonts': 'Отсутствующие шрифты',
  'Font registrations pointing to deleted font files.': 'Регистрации шрифтов, которые указывают на удалённые файлы.',
  'Fonts registered with Windows whose font file was deleted.': 'Шрифты, зарегистрированные в Windows, файлы которых удалены.',
  'Windows stops trying to load fonts that don’t exist.': 'Windows перестанет пытаться загрузить несуществующие шрифты.',

  // ---------- Missing help files ----------
  'Missing help files': 'Отсутствующие файлы справки',
  'Help file references to files that were removed.': 'Ссылки на удалённые файлы справки.',
  'Links to help documents of uninstalled programs.': 'Ссылки на справочные документы удалённых программ.',
  'Nothing visible.': 'Внешне ничего не изменится.',

  // ---------- Empty software keys ----------
  'Empty software keys': 'Пустые разделы программ',
  'Leftover program keys with no values or subkeys.': 'Оставшиеся от программ разделы без параметров и подразделов.',
  'Completely empty folders in the registry left behind by uninstalled programs.':
    'Совершенно пустые «папки» (разделы) реестра, оставшиеся от удалённых программ.',
  'Nothing — they hold no data.': 'Ничего — в них нет данных.',

  // ---------- Errors (registry.cjs) ----------
  'Invalid registry path': 'Недопустимый путь в реестре',
  'Scan again before fixing issues.': 'Перед исправлением запустите сканирование ещё раз.',
  'Unsupported registry operation': 'Неподдерживаемая операция с реестром',
  'This key is protected because deleting it would damage Windows.': 'Этот раздел защищён: его удаление повредит Windows.',
  'Name too long': 'Слишком длинное имя',
  'Enter a key name without backslashes.': 'Введите имя раздела без обратной косой черты (\\).',
  'Unsupported value type': 'Неподдерживаемый тип параметра',
  'Enter text to search for.': 'Введите текст для поиска.',
  'The file could not be imported.': 'Не удалось импортировать файл.',

  // ---------- Errors thrown by the PowerShell scripts (registry-ps.cjs) ----------
  'Refusing to delete a top-level key': 'Удалять раздел верхнего уровня запрещено',
  'This key no longer exists.': 'Этот раздел больше не существует.',
  'Cannot open this key for writing. Administrator rights may be required.':
    'Не удаётся открыть раздел для записи. Возможно, нужны права администратора.',
  'A value with that name already exists.': 'Параметр с таким именем уже существует.'
};
