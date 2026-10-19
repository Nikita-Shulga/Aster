'use strict';
// Russian translations — see index.cjs.
// Windows cleaning rules (cleaner-rules.cjs): rule texts, groups and location labels.
module.exports = {
  // ---------- Groups and app names ----------
  'Browsers': 'Браузеры',
  'Applications': 'Приложения',
  'Yandex Browser': 'Яндекс Браузер',

  // ---------- Browser profiles in location labels: "Cache (main profile)" ----------
  'main profile': 'основной профиль',
  'guest profile': 'гостевой профиль',
  'system profile': 'системный профиль',

  // ---------- Chromium browsers ----------
  'Cache': 'Кэш',
  'Temporary copies of images, scripts and pages from websites you visited, compiled JavaScript, graphics shaders and offline data saved by web apps. It does NOT contain your passwords, bookmarks, history, cookies or logins.':
    'Временные копии изображений, скриптов и страниц посещённых сайтов, скомпилированный JavaScript, графические шейдеры и офлайн-данные веб-приложений. Ваших паролей, закладок, истории, файлов cookie и данных для входа здесь НЕТ.',
  'Websites load slightly slower the first time you open them again while the cache refills. You stay signed in everywhere.':
    'При следующем открытии сайты загрузятся чуть медленнее, пока кэш наполняется заново. Из аккаунтов на сайтах вы не выйдете.',
  'Safe to clean anytime. Especially useful if a site looks broken or outdated.':
    'Можно смело очищать в любое время. Особенно полезно, если сайт отображается неправильно или показывает устаревшее содержимое.',

  'Browsing history': 'История посещений',
  'The list of sites you visited, your download list and the address-bar suggestions built from them.':
    'Список посещённых сайтов, список загрузок и подсказки адресной строки, которые на их основе составляет браузер.',
  'The address bar stops suggesting sites you visited and "Most visited" tiles reset. Bookmarks, passwords, cookies and logins are kept.':
    'Адресная строка перестанет подсказывать посещённые сайты, а плитки «Часто посещаемые» сбросятся. Закладки, пароли, файлы cookie и данные для входа сохранятся.',
  'Clean for privacy — for example on a shared PC. It frees little space and does not speed anything up.':
    'Очищайте ради конфиденциальности — например, на общем компьютере. Места освобождается немного, и быстрее ничего работать не станет.',

  'Cookies & site logins': 'Файлы cookie и входы на сайты',
  'Small files websites use to keep you signed in and to remember settings such as language, shopping cart and cookie-banner choices.':
    'Небольшие файлы, с помощью которых сайты сохраняют вход в аккаунт и запоминают настройки: язык, товары в корзине интернет-магазина, ваш выбор в баннерах о файлах cookie.',
  'You are signed out of every website and must log in again, often with two-factor codes. Cookie banners come back.':
    'Вы выйдете из аккаунтов на всех сайтах, и придётся входить заново — часто с кодом двухфакторной проверки. Баннеры о файлах cookie появятся снова.',
  'Usually keep. Clean only if you want to sign out everywhere or to fix a site that misbehaves.':
    'Обычно лучше оставить. Очищайте, только если хотите выйти из аккаунтов везде или исправить сайт, который работает неправильно.',

  'Open tabs (session)': 'Открытые вкладки (сеанс)',
  'The tabs and windows the browser reopens when you start it again.':
    'Вкладки и окна, которые браузер снова откроет при следующем запуске.',
  'Your previously open tabs will not be restored on the next launch.':
    'При следующем запуске ранее открытые вкладки не восстановятся.',
  'Clean only if the browser keeps reopening tabs you do not want, or for privacy.':
    'Очищайте, только если браузер упорно открывает ненужные вкладки, или ради конфиденциальности.',

  // Chromium location labels
  'Page cache — images, scripts and styles of sites you visited': 'Кэш страниц — изображения, скрипты и стили посещённых сайтов',
  'Compiled JavaScript, so sites start faster': 'Скомпилированный JavaScript — чтобы сайты открывались быстрее',
  'Graphics card shader cache for web pages': 'Кэш шейдеров видеокарты для веб-страниц',
  'WebGPU shader cache': 'Кэш шейдеров WebGPU',
  'Offline copies saved by web apps (service workers)': 'Офлайн-копии, сохранённые веб-приложениями (service workers)',
  'Background scripts of web apps': 'Фоновые скрипты веб-приложений',
  'Shared graphics shader cache': 'Общий кэш графических шейдеров',
  'Shared WebGPU shader cache': 'Общий кэш шейдеров WebGPU',
  'History database': 'База данных истории',
  'Cookie database': 'База данных файлов cookie',
  'Saved sessions': 'Сохранённые сеансы',

  // ---------- Firefox ----------
  'Temporary copies of web pages, images and scripts, plus page thumbnails. No passwords, bookmarks, history or logins.':
    'Временные копии веб-страниц, изображений и скриптов, а также эскизы страниц. Паролей, закладок, истории и данных для входа здесь нет.',
  'Sites load slightly slower the first time you revisit them. You stay signed in.':
    'При следующем посещении сайты загрузятся чуть медленнее. Из аккаунтов вы не выйдете.',
  'Safe to clean anytime.': 'Можно смело очищать в любое время.',
  'Small files websites use to keep you signed in and remember your preferences.':
    'Небольшие файлы, с помощью которых сайты сохраняют вход в аккаунт и запоминают ваши настройки.',
  'You are signed out of every website.': 'Вы выйдете из аккаунтов на всех сайтах.',
  'Usually keep. Clean only to sign out everywhere or fix a broken site.':
    'Обычно лучше оставить. Очищайте, только чтобы выйти из аккаунтов везде или исправить сайт, который не работает.',
  'The tabs and windows Firefox restores on the next start.': 'Вкладки и окна, которые Firefox восстановит при следующем запуске.',
  'Previously open tabs will not be restored.': 'Ранее открытые вкладки не восстановятся.',
  'Clean only if Firefox keeps restoring tabs you do not want.': 'Очищайте, только если Firefox упорно восстанавливает ненужные вкладки.',

  // Firefox location labels
  'Page cache': 'Кэш страниц',
  'Startup cache': 'Кэш запуска',
  'Page thumbnails': 'Эскизы страниц',
  'Saved session': 'Сохранённый сеанс',
  'Session backups': 'Резервные копии сеанса',

  // ---------- Windows ----------
  'Safe to clean.': 'Очищать безопасно.',

  'Temporary files': 'Временные файлы',
  'Scratch files that programs create while working: unpacked installers, update downloads, previews and leftovers. Programs are supposed to delete them, but often forget.':
    'Черновые файлы, которые программы создают во время работы: распакованные установщики, скачанные обновления, файлы предпросмотра и прочие остатки. Программы должны удалять их сами, но часто об этом забывают.',
  'Nothing. Only files older than 24 hours are removed, so programs that are running right now are not affected.':
    'Ничего. Удаляются только файлы старше 24 часов, поэтому программы, запущенные прямо сейчас, это не затронет.',
  'Safe to clean regularly. This is usually one of the biggest wins.':
    'Можно очищать регулярно — это безопасно. Обычно именно здесь удаётся освободить больше всего места.',
  'Your temporary folder': 'Ваша папка временных файлов',

  'System temporary files': 'Системные временные файлы',
  'The Windows-wide temporary folder used by installers, drivers and services.':
    'Общая папка временных файлов Windows, которой пользуются установщики, драйверы и службы.',
  'Nothing. Only files older than 24 hours are removed.': 'Ничего. Удаляются только файлы старше 24 часов.',
  'Safe to clean. Requires administrator rights.': 'Очищать безопасно. Нужны права администратора.',
  'Windows temporary folder': 'Папка временных файлов Windows',

  'Recycle Bin': 'Корзина',
  'Files you deleted yourself. Windows keeps them so you can still restore them.':
    'Файлы, которые вы удалили сами. Windows хранит их, чтобы их можно было восстановить.',
  'Those files are gone for good and cannot be restored.': 'Эти файлы исчезнут навсегда, восстановить их будет нельзя.',
  'Open the Recycle Bin first if you might still need something from it.':
    'Если там может оказаться что-то нужное, сначала загляните в Корзину.',

  'Thumbnail cache': 'Кэш эскизов',
  'Small preview pictures that File Explorer shows for photos, videos and documents.':
    'Уменьшенные изображения (эскизы), которые Проводник показывает для фотографий, видео и документов.',
  'Folders with many pictures show previews a bit slower the first time while they are rebuilt.':
    'В папках с большим количеством изображений эскизы в первый раз появятся чуть медленнее, пока создаются заново.',
  'Safe. Also fixes wrong or broken thumbnails. Files in use by Explorer are skipped.':
    'Безопасно. Заодно исправляет неверные или испорченные эскизы. Файлы, занятые Проводником, пропускаются.',
  'Explorer thumbnail and icon cache': 'Кэш эскизов и значков Проводника',

  'Internet cache': 'Интернет-кэш',
  'Web content cached by Windows itself, Office, Outlook and older programs that use the Internet Explorer engine.':
    'Веб-содержимое, которое кэшируют сама Windows, Office, Outlook и старые программы на движке Internet Explorer.',
  'Nothing noticeable; content is downloaded again when needed.': 'Ничего заметного: при необходимости содержимое загрузится заново.',
  'Windows internet cache': 'Интернет-кэш Windows',

  'Error reports': 'Отчёты об ошибках',
  'Diagnostic reports Windows writes after a program or Windows itself crashed, for sending to Microsoft or the app developer.':
    'Диагностические отчёты, которые Windows создаёт после сбоя программы или самой системы, чтобы отправить их в Microsoft или разработчику приложения.',
  'Nothing you would use day to day. Only developers investigating a crash need them.':
    'Ничего, что пригодилось бы в повседневной работе. Они нужны только разработчикам, которые выясняют причину сбоя.',
  'Your error reports': 'Ваши отчёты об ошибках',
  'Sent error reports': 'Отправленные отчёты об ошибках',
  'Queued error reports': 'Отчёты об ошибках, ожидающие отправки',

  'Crash dumps': 'Дампы памяти',
  'Snapshots of memory saved when a program crashed or Windows showed a blue screen. A single dump can be several gigabytes.':
    'Снимки памяти, которые сохраняются при сбое программы или при «синем экране» Windows. Один дамп может занимать несколько гигабайт.',
  'You lose the evidence needed to analyse why a crash happened. Your programs and data are not affected.':
    'Пропадут сведения, по которым можно выяснить причину сбоя. Программы и данные это не затронет.',
  'Delete them — unless you are currently troubleshooting repeated crashes or blue screens with a technician or the app developer.':
    'Удаляйте — если только вы сейчас не разбираетесь с повторяющимися сбоями или «синими экранами» вместе со специалистом или разработчиком приложения.',
  'App crash dumps': 'Дампы памяти приложений',
  'Blue screen mini dumps': 'Малые дампы памяти «синего экрана»',
  'Full blue screen memory dump': 'Полный дамп памяти «синего экрана»',

  'Graphics shader cache': 'Кэш графических шейдеров',
  'Graphics programs (shaders) that games and apps compiled for your specific graphics card, stored by DirectX, NVIDIA and AMD drivers.':
    'Графические программы (шейдеры), которые игры и приложения скомпилировали именно под вашу видеокарту. Их хранят DirectX и драйверы NVIDIA и AMD.',
  'Games may stutter or load slower the first time you play them again while shaders are rebuilt.':
    'При следующем запуске игры могут подтормаживать или дольше загружаться, пока шейдеры компилируются заново.',
  'Keep it normally — it makes games smoother. Clean after a graphics driver update or if a game shows visual glitches.':
    'Обычно лучше оставить — с ним игры идут плавнее. Очищайте после обновления драйвера видеокарты или если в игре появились графические артефакты.',
  'DirectX shader cache': 'Кэш шейдеров DirectX',
  'NVIDIA DirectX shader cache': 'Кэш шейдеров DirectX от NVIDIA',
  'NVIDIA OpenGL shader cache': 'Кэш шейдеров OpenGL от NVIDIA',
  'AMD DirectX shader cache': 'Кэш шейдеров DirectX от AMD',
  'AMD OpenGL shader cache': 'Кэш шейдеров OpenGL от AMD',

  'Windows Update downloads': 'Загрузки Центра обновления Windows',
  'Update packages that Windows Update downloaded and has already installed.':
    'Пакеты обновлений, которые Центр обновления Windows скачал и уже установил.',
  'Nothing. If an update needs a file again, Windows downloads it.':
    'Ничего. Если какой-то файл снова понадобится для обновления, Windows скачает его.',
  'Safe. Avoid cleaning while Windows is in the middle of installing updates.':
    'Безопасно. Только не очищайте, пока Windows устанавливает обновления.',
  'Windows Update download folder': 'Папка загрузок Центра обновления Windows',

  'Delivery Optimization cache': 'Кэш оптимизации доставки',
  'Pieces of Windows and Store updates that your PC keeps to share with other PCs on your network or the internet.':
    'Части обновлений Windows и Microsoft Store, которые ваш компьютер хранит, чтобы раздавать их другим компьютерам в локальной сети или в интернете.',
  'Nothing for you; other PCs simply download from Microsoft instead.':
    'Для вас ничего не изменится: другие компьютеры просто скачают обновления напрямую у Microsoft.',

  'Windows log files': 'Файлы журналов Windows',
  'Setup, update and maintenance logs older than 7 days.': 'Журналы установки, обновления и обслуживания старше 7 дней.',
  'Old troubleshooting history for past Windows updates is gone. Nothing else changes.':
    'Пропадут старые диагностические записи о прошлых обновлениях Windows. Больше ничего не изменится.',
  'Windows logs': 'Журналы Windows',
  'Windows setup logs': 'Журналы установки Windows',

  'Recent files list': 'Список последних файлов',
  'Shortcuts to documents you opened recently, shown in Quick Access and Start. The documents themselves are not stored here.':
    'Ярлыки недавно открытых документов, которые видны на панели быстрого доступа и в меню «Пуск». Сами документы здесь не хранятся.',
  'The "Recent" list in Explorer and Start becomes empty. Your files are untouched.':
    'Список «Последние файлы» в Проводнике и меню «Пуск» опустеет. Сами файлы останутся на месте.',
  'Clean for privacy only — it frees almost no space.': 'Очищайте только ради конфиденциальности — места это почти не освобождает.',
  'Recent items shortcuts': 'Ярлыки недавних элементов',

  'Jump lists': 'Списки переходов',
  'Recent files and pinned items you see when right-clicking an app on the taskbar.':
    'Недавние файлы и закреплённые элементы, которые появляются при щелчке правой кнопкой мыши по значку приложения на панели задач.',
  'Those right-click lists become empty, including items you pinned there.':
    'Эти списки опустеют — вместе с элементами, которые вы там закрепили.',
  'Clean for privacy only.': 'Очищайте только ради конфиденциальности.',
  'Automatic jump lists': 'Автоматические списки переходов',
  'Custom jump lists': 'Настраиваемые списки переходов',

  'Prefetch data': 'Данные Prefetch',
  'Notes Windows keeps about how each program starts, so it can load it faster next time.':
    'Сведения о том, как запускается каждая программа. Windows собирает их, чтобы в следующий раз загружать программу быстрее.',
  'Windows and your programs start slower for a while until Windows learns again.':
    'Какое-то время Windows и программы будут запускаться медленнее, пока система заново не соберёт эти сведения.',
  'Not recommended. Windows limits its size automatically, and cleaning it makes the PC slower, not faster.':
    'Не рекомендуется. Windows сама ограничивает объём этих данных, а очистка делает компьютер медленнее, а не быстрее.',
  'Prefetch folder': 'Папка Prefetch',

  // ---------- Applications ----------
  // Electron apps (Discord, Slack, Teams, VS Code) — location labels
  'App cache — images and files you viewed': 'Кэш приложения — просмотренные изображения и файлы',
  'Media cache — images and files you viewed': 'Кэш медиафайлов — просмотренные изображения и файлы',
  'Compiled app code': 'Скомпилированный код приложения',
  'Offline web data': 'Веб-данные для работы офлайн',

  // Discord
  'Images, videos, GIFs and emojis from chats and servers you scrolled through.':
    'Изображения, видео, GIF-анимации и эмодзи из чатов и серверов, которые вы просматривали.',
  'Media loads again when you scroll back. Messages, servers and your login are unaffected.':
    'Медиафайлы загрузятся снова, когда вы до них долистаете. Сообщения, серверы и вход в аккаунт не пострадают.',
  'Safe to clean. Discord’s cache grows quickly if you use many servers.':
    'Очищать безопасно. Если вы состоите на многих серверах, кэш Discord растёт быстро.',

  // Spotify
  'Songs you streamed recently, kept so they play instantly without downloading again. This also includes songs you downloaded for offline listening.':
    'Недавно прослушанные песни — они хранятся, чтобы сразу начинать играть без повторной загрузки. Сюда же входят песни, скачанные для прослушивания офлайн.',
  'Recently played songs stream again (uses internet). Playlists marked for offline download must download again.':
    'Недавно прослушанные песни снова будут загружаться из интернета. Плейлисты, отмеченные для прослушивания офлайн, придётся скачать заново.',
  'Safe if you do not rely on offline playlists. Your playlists and account are not affected.':
    'Безопасно, если вы не пользуетесь плейлистами офлайн. Плейлисты и аккаунт не пострадают.',
  'Streamed songs cache': 'Кэш прослушанных песен',
  'Downloaded content and app data': 'Скачанный контент и данные приложения',

  // Slack
  'Cached images, file previews and the app’s code.': 'Кэшированные изображения, превью файлов и код приложения.',
  'Slack starts a little slower once and re-downloads previews. Messages and login are kept.':
    'Следующий запуск Slack будет чуть медленнее, а превью файлов загрузятся заново. Сообщения и вход в аккаунт сохранятся.',
  'Safe to clean. Also fixes many Slack display problems.':
    'Очищать безопасно. Заодно это устраняет многие проблемы с отображением в Slack.',

  // Microsoft Teams
  'Cached images, profile pictures, file previews and app code.': 'Кэшированные изображения, фото профилей, превью файлов и код приложения.',
  'Teams starts slower once. Chats, files and your login are kept.':
    'Следующий запуск Teams будет медленнее. Чаты, файлы и вход в аккаунт сохранятся.',
  'Safe to clean. Microsoft recommends it when Teams misbehaves.':
    'Очищать безопасно. Microsoft советует делать это, если Teams работает со сбоями.',

  // Visual Studio Code
  'Editor caches, old extension installer files and logs.': 'Кэши редактора, старые установочные файлы расширений и журналы.',
  'VS Code starts slightly slower once. Settings, extensions, projects and unsaved work are kept.':
    'Следующий запуск VS Code будет чуть медленнее. Настройки, расширения, проекты и несохранённые изменения останутся на месте.',
  'Cached editor code': 'Кэшированный код редактора',
  'Downloaded extension installers': 'Скачанные установщики расширений',
  'Logs': 'Журналы',

  // Steam
  'Cached Store, Library and Community web pages. Not your games or saves.':
    'Кэшированные веб-страницы Магазина, Библиотеки и Сообщества. Игр и сохранений здесь нет.',
  'Store pages load slower once. Games, saves and login are unaffected.':
    'Страницы Магазина один раз загрузятся медленнее. Игры, сохранения и вход в аккаунт не пострадают.',
  'Safe to clean. Fixes a Store that shows blank or outdated pages.':
    'Очищать безопасно. Помогает, если Магазин показывает пустые или устаревшие страницы.',
  'Store and community web cache': 'Веб-кэш Магазина и Сообщества',

  // Epic Games Launcher
  'Cached store pages and images of the launcher. Not your games.': 'Кэшированные страницы магазина и изображения лаунчера. Игр здесь нет.',
  'The launcher loads pages slower once.': 'Лаунчер один раз загрузит страницы медленнее.',
  'Launcher web cache': 'Веб-кэш лаунчера',

  // Java
  'Downloaded Java web applets and apps.': 'Скачанные веб-апплеты и приложения Java.',
  'Java web apps download again when you start them.': 'Веб-приложения Java загрузятся заново при запуске.',
  'Java applet cache': 'Кэш Java-апплетов',

  // Microsoft Office
  'Local copies of documents Office uploads to OneDrive or SharePoint, plus usage telemetry.':
    'Локальные копии документов, которые Office отправляет в OneDrive или SharePoint, а также телеметрия использования.',
  'Changes that were not uploaded yet could be lost.': 'Изменения, которые ещё не успели отправиться, могут пропасть.',
  'Only clean when all your Office documents show as saved/synced.':
    'Очищайте, только когда все документы Office отмечены как сохранённые или синхронизированные.',
  'Office upload cache': 'Кэш отправки файлов Office',
  'Office telemetry': 'Телеметрия Office',

  // Developer package caches (npm, pip, Yarn, NuGet)
  'Software packages a developer tool downloaded, kept so future installs do not download them again.':
    'Программные пакеты, скачанные инструментом разработчика. Они хранятся, чтобы при следующих установках не скачивать их снова.',
  'The next project install downloads these packages again (slower, uses internet). Your projects are not affected.':
    'При следующей установке зависимостей проекта эти пакеты скачаются заново (дольше и с расходом трафика). Сами проекты это не затронет.',
  'For developers: clean when you need space. Not needed otherwise.':
    'Для разработчиков: очищайте, когда нужно место. В остальных случаях это ни к чему.',
  'npm package cache': 'Кэш пакетов npm',
  'pip (Python) package cache': 'Кэш пакетов pip (Python)',
  'Yarn package cache': 'Кэш пакетов Yarn',
  'NuGet (.NET) package cache': 'Кэш пакетов NuGet (.NET)'
};
