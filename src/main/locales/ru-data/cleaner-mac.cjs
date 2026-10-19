'use strict';
// Russian translations of the macOS cleaning rules (mac/cleaner-rules.cjs) — see index.cjs.
// Text the macOS rules share word for word with the Windows rules (group names, Chromium/Firefox cache text,
// "Cache", "Safe to clean.", Electron app caches…) is translated once, in cleaner-win.cjs.
module.exports = {
  // ---------- Chromium browsers: cache locations ----------
  'Graphics shader cache for web pages': 'Кэш графических шейдеров для веб-страниц',

  // ---------- Chromium browsers: rules ----------
  'Websites load slightly slower the first time you open them again. You stay signed in everywhere.':
    'При следующем открытии сайты загрузятся чуть медленнее. Из аккаунтов вы не выйдете.',
  'The list of sites you visited, your download list and address-bar suggestions built from them.':
    'Список посещённых сайтов, список загрузок и основанные на них подсказки в адресной строке.',
  'The address bar stops suggesting sites you visited. Bookmarks, passwords, cookies and logins are kept.':
    'Адресная строка перестанет подсказывать посещённые сайты. Закладки, пароли, файлы cookie и данные для входа сохранятся.',
  'Clean for privacy — it frees little space and does not speed anything up.':
    'Очищайте ради конфиденциальности: места освобождается немного, и работа не ускоряется.',
  'Small files websites use to keep you signed in and remember settings such as language and cookie-banner choices.':
    'Небольшие файлы, с помощью которых сайты сохраняют вход в аккаунт и запоминают настройки — например, язык и ваш выбор в баннерах о cookie.',
  'You are signed out of every website and must log in again, often with two-factor codes.':
    'Вы выйдете из аккаунтов на всех сайтах, и придётся входить заново — часто с кодами двухфакторной аутентификации.',
  'Usually keep. Clean only to sign out everywhere or fix a misbehaving site.':
    'Обычно лучше оставить. Очищайте, только если нужно выйти из всех аккаунтов или исправить сайт, который работает неправильно.',

  // ---------- Firefox ----------
  'Small files websites use to keep you signed in.': 'Небольшие файлы, с помощью которых сайты сохраняют вход в аккаунт.',
  'Usually keep.': 'Обычно лучше оставить.',

  // ---------- Safari ----------
  'Copies of web pages, images and scripts Safari saved to load sites faster. No passwords, bookmarks or history.':
    'Копии веб-страниц, изображений и скриптов, которые Safari сохраняет, чтобы сайты открывались быстрее. Паролей, закладок и истории здесь нет.',
  'Websites load slightly slower the first time. You stay signed in.':
    'Сайты в первый раз загрузятся чуть медленнее. Из аккаунтов вы не выйдете.',
  'Safe to clean. Requires Full Disk Access because macOS protects Safari’s folders.':
    'Очищать безопасно. Нужен полный доступ к диску, потому что macOS защищает папки Safari.',
  'Safari cache': 'Кэш Safari',
  'Safari cache (sandbox)': 'Кэш Safari (песочница)',
  'Web content cache': 'Кэш веб-контента',
  'The list of sites you visited in Safari. If you use iCloud for Safari, history is also synced to your other devices.':
    'Список сайтов, которые вы посещали в Safari. Если Safari синхронизируется через iCloud, история есть и на других ваших устройствах.',
  'Safari stops suggesting visited sites. With iCloud sync, the history may be removed on your other devices as well.':
    'Safari перестанет подсказывать посещённые сайты. При синхронизации через iCloud история может удалиться и на других ваших устройствах.',
  'Clean for privacy only. Safari → History → Clear History does the same with more options.':
    'Очищайте только ради конфиденциальности. Команда Safari «История» → «Очистить историю» делает то же самое и предлагает больше вариантов.',
  'Safari history database': 'База данных истории Safari',

  // ---------- macOS ----------
  'App caches': 'Кэши приложений',
  'Cached data that all your other apps keep in ~/Library/Caches: downloaded images, previews, update files and similar. Only files not touched in the last 24 hours are removed.':
    'Кэшированные данные, которые все остальные приложения хранят в ~/Library/Caches: загруженные изображения, превью, файлы обновлений и т. п. Удаляются только файлы, которые не использовались последние 24 часа.',
  'Apps may start a little slower once and download some content again. Your documents and settings are not here.':
    'Приложения могут один раз запуститься чуть медленнее и заново загрузить часть данных. Ваших документов и настроек здесь нет.',
  'Safe to clean. Quit apps you use heavily first for the best result.':
    'Очищать безопасно. Для лучшего результата сначала завершите приложения, которыми активно пользуетесь.',
  'Loose files in ~/Library/Caches': 'Отдельные файлы в ~/Library/Caches',
  'App logs': 'Журналы приложений',
  'Text logs that apps write to record what they did (~/Library/Logs).':
    'Текстовые журналы, в которые приложения записывают свои действия (~/Library/Logs).',
  'Nothing you would notice. Only useful when troubleshooting a specific app.':
    'Ничего заметного. Журналы нужны, только когда вы разбираетесь с проблемами конкретного приложения.',
  'Your app logs': 'Журналы ваших приложений',
  'Crash reports': 'Отчёты о сбоях',
  'Reports macOS wrote when an app crashed or hung, used for sending to Apple or the developer.':
    'Отчёты, которые macOS создаёт при сбое или зависании приложения, — для отправки в Apple или разработчику.',
  'You lose details about past crashes. Apps and data are unaffected.':
    'Сведения о прошлых сбоях пропадут. Приложения и данные не пострадают.',
  'Delete them — unless you are currently troubleshooting crashes with a developer.':
    'Удаляйте, если только вы сейчас не разбираетесь со сбоями вместе с разработчиком.',
  'Crash and hang reports': 'Отчёты о сбоях и зависаниях',
  'Scratch files apps leave in your private temporary folder. Only files older than 3 days are removed.':
    'Промежуточные файлы, которые приложения оставляют в вашей личной временной папке. Удаляются только файлы старше 3 дней.',
  'Nothing; apps that are running are not affected because recent files are kept.':
    'Ничего: недавние файлы сохраняются, поэтому запущенные приложения не пострадают.',
  'Quick Look thumbnails': 'Эскизы «Быстрого просмотра»',
  'Preview images Finder and Quick Look generated for your files.':
    'Миниатюры ваших файлов, созданные Finder и «Быстрым просмотром».',
  'Previews are rebuilt the next time you view a folder — slightly slower once.':
    'Эскизы создадутся заново, когда вы снова откроете папку, — в первый раз это займёт чуть больше времени.',
  'Safe. Also fixes wrong or outdated thumbnails.': 'Безопасно. Заодно исправляет неверные или устаревшие эскизы.',
  'Quick Look thumbnail cache': 'Кэш эскизов «Быстрого просмотра»',
  'Trash': 'Корзина',
  'Files you moved to the Trash. macOS keeps them so you can still put them back.':
    'Файлы, которые вы переместили в Корзину. macOS хранит их, чтобы их можно было вернуть.',
  'Open the Trash first if you might still need something. Requires Full Disk Access.':
    'Если там может оказаться что-то нужное, сначала откройте Корзину. Нужен полный доступ к диску.',
  'Your Trash': 'Ваша Корзина',
  // Label made in resolve() as `Trash on ${volume}` (volume = disk name).
  'Trash on {volume}': 'Корзина на диске «{volume}»',
  'iPhone & iPad software updates': 'Обновления ПО для iPhone и iPad',
  'Full iOS/iPadOS installer files Finder downloaded to update a device. Each is 5–8 GB.':
    'Полные установочные файлы iOS и iPadOS, которые Finder загрузил для обновления устройства. Каждый занимает 5–8 ГБ.',
  'Finder downloads the file again if you ever restore or update a device from this Mac.':
    'Если вы будете восстанавливать или обновлять устройство с этого Mac, Finder загрузит файл заново.',
  'Safe to clean — they are only needed during an update.': 'Очищать безопасно — эти файлы нужны только во время обновления.',
  'iPhone updates': 'Обновления iPhone',
  'iPad updates': 'Обновления iPad',
  'Old installers in Downloads': 'Старые установщики в «Загрузках»',
  'Disk images (.dmg) and installer packages (.pkg) in your Downloads folder that are older than 30 days.':
    'Образы дисков (.dmg) и установочные пакеты (.pkg) старше 30 дней в папке «Загрузки».',
  'You would have to download those installers again if you need to reinstall something.':
    'Если понадобится что-то переустановить, установщики придётся загрузить заново.',
  'Usually safe — the apps are already installed. Check the list before cleaning.':
    'Обычно безопасно — приложения уже установлены. Перед очисткой просмотрите список.',
  'Installers in Downloads': 'Установщики в «Загрузках»',
  'Mail attachments cache': 'Кэш вложений Почты',
  'Copies of email attachments you opened in Mail. The attachments stay in your mailbox.':
    'Копии вложений, которые вы открывали в Почте. Сами вложения остаются в почтовом ящике.',
  'Mail re-downloads an attachment the next time you open it.': 'Почта заново загрузит вложение, когда вы снова его откроете.',
  'Safe if your mail account keeps messages on the server (iCloud, Gmail, Exchange). Requires Full Disk Access.':
    'Безопасно, если ваша почтовая учётная запись хранит письма на сервере (iCloud, Gmail, Exchange). Нужен полный доступ к диску.',
  'Mail Downloads': 'Загрузки Почты',
  'iPhone & iPad backups': 'Резервные копии iPhone и iPad',
  'Full local backups of your iPhone or iPad made by Finder. They can be tens of gigabytes.':
    'Полные локальные резервные копии iPhone или iPad, созданные в Finder. Они могут занимать десятки гигабайт.',
  'You can no longer restore a device from these backups. If a backup is your only copy of photos or messages, they would be lost.':
    'Восстановить устройство из этих копий будет нельзя. Если резервная копия — единственное место, где хранятся ваши фото или сообщения, они пропадут.',
  'Keep unless you back up to iCloud. Manage individual backups in Finder → your device → Manage Backups.':
    'Оставьте, если не делаете резервные копии в iCloud. Отдельными копиями можно управлять в Finder: выберите устройство → «Управлять резервными копиями».',
  'Device backups': 'Резервные копии устройств',

  // ---------- Applications ----------
  'Media loads again when you scroll back. Messages and login are unaffected.':
    'Медиафайлы загрузятся заново, когда вы к ним вернётесь. Сообщения и вход в аккаунт не пострадают.',
  'Song cache and offline downloads': 'Кэш песен и загрузки для прослушивания офлайн',
  'Songs you streamed recently, plus songs downloaded for offline listening.':
    'Недавно прослушанные песни, а также песни, скачанные для прослушивания офлайн.',
  'Recently played songs stream again. Offline playlists must download again.':
    'Недавно прослушанные песни снова будут загружаться из интернета. Плейлисты для прослушивания офлайн придётся скачать заново.',
  'Safe if you do not rely on offline playlists.': 'Безопасно, если вы не пользуетесь плейлистами офлайн.',
  'Slack starts a little slower once. Messages and login are kept.':
    'Slack один раз запустится чуть медленнее. Сообщения и вход в аккаунт сохранятся.',
  'Teams cache': 'Кэш Teams',
  'Cached images, profile pictures, previews and app code.': 'Кэшированные изображения, фото профилей, превью и код приложения.',
  'Teams starts slower once. Chats and login are kept.': 'Teams один раз запустится медленнее. Чаты и вход в аккаунт сохранятся.',
  'Editor caches, old extension installers and logs.': 'Кэши редактора, старые установщики расширений и журналы.',
  'VS Code starts slightly slower once. Settings, extensions and projects are kept.':
    'VS Code один раз запустится чуть медленнее. Настройки, расширения и проекты сохранятся.',
  'Cached images, web content and the app’s compiled code.': 'Кэшированные изображения, веб-контент и скомпилированный код приложения.',
  // Made with a template literal for Claude, Cursor, Notion and Obsidian.
  'Claude starts a little slower once. Your chats, documents and login are kept.':
    'Claude один раз запустится чуть медленнее. Ваши чаты, документы и вход в аккаунт сохранятся.',
  'Cursor starts a little slower once. Your chats, documents and login are kept.':
    'Cursor один раз запустится чуть медленнее. Ваши чаты, документы и вход в аккаунт сохранятся.',
  'Notion starts a little slower once. Your chats, documents and login are kept.':
    'Notion один раз запустится чуть медленнее. Ваши чаты, документы и вход в аккаунт сохранятся.',
  'Obsidian starts a little slower once. Your vaults and login are kept.':
    'Obsidian один раз запустится чуть медленнее. Ваши хранилища и вход в аккаунт сохранятся.',
  'Safe to clean while the app is closed.': 'Очищать безопасно, пока приложение закрыто.',
  'Store web cache': 'Веб-кэш Магазина',
  'Cached Store and Community web pages. Not your games.': 'Кэшированные веб-страницы Магазина и Сообщества. Игры здесь не хранятся.',
  'Store pages load slower once.': 'Страницы Магазина один раз загрузятся медленнее.',
  'Build files (DerivedData)': 'Файлы сборки (DerivedData)',
  'DerivedData (build files)': 'DerivedData (файлы сборки)',
  'Simulator caches': 'Кэши симулятора',
  'Intermediate build products and indexes Xcode creates for every project you open, plus simulator caches.':
    'Промежуточные результаты сборки и индексы, которые Xcode создаёт для каждого открытого проекта, а также кэши симулятора.',
  'The next build of each project takes longer while Xcode rebuilds them. Your source code is not here.':
    'Следующая сборка каждого проекта займёт больше времени, пока Xcode создаёт эти файлы заново. Исходного кода здесь нет.',
  'Safe and often frees many gigabytes.': 'Безопасно и часто освобождает много гигабайт.',
  'Device support files': 'Файлы поддержки устройств',
  'iOS device support': 'Поддержка устройств iOS',
  'watchOS device support': 'Поддержка устройств watchOS',
  'Debug symbols copied from every iPhone/iPad/Watch version you connected for development. Old iOS versions pile up.':
    'Отладочные символы, скопированные с каждой версии iPhone, iPad и Apple Watch, которую вы подключали для разработки. Файлы старых версий iOS со временем накапливаются.',
  'Connecting a device for debugging copies its files again (a few minutes).':
    'При подключении устройства для отладки его файлы скопируются заново (это займёт несколько минут).',
  'Safe for versions you no longer test on.': 'Безопасно для версий, на которых вы больше не тестируете.',
  'Downloaded bottles and installers': 'Загруженные пакеты (bottles) и установщики',
  'Packages Homebrew downloaded during installs and upgrades.': 'Пакеты, загруженные Homebrew при установке и обновлении.',
  'Reinstalling a package downloads it again.': 'При переустановке пакет загрузится заново.',
  'Safe to clean (same as “brew cleanup”).': 'Очищать безопасно (то же, что «brew cleanup»).',
  // Made with a template literal: `${name} package cache`.
  'CocoaPods package cache': 'Кэш пакетов CocoaPods',
  'Gradle package cache': 'Кэш пакетов Gradle',
  'Packages a developer tool downloaded, kept so future installs don’t download them again.':
    'Пакеты, загруженные инструментом разработчика и сохранённые, чтобы при следующих установках не загружать их снова.',
  'The next project install downloads these packages again. Your projects are not affected.':
    'При следующей установке зависимостей проекта эти пакеты загрузятся заново. Сами проекты не пострадают.',
  'For developers: clean when you need space.': 'Для разработчиков: очищайте, когда нужно освободить место.',
  'Media cache': 'Медиакэш',
  'Media cache files': 'Файлы медиакэша',
  'Media cache database': 'База данных медиакэша',
  'Audio and video previews Premiere Pro, After Effects and Audition generated for your footage.':
    'Превью аудио и видео, которые Premiere Pro, After Effects и Audition создали для ваших материалов.',
  'Projects re-generate previews when opened, which takes time.': 'При открытии проектов превью будут созданы заново, а это займёт время.',
  'Clean when no project is open, especially after finishing projects.':
    'Очищайте, когда ни один проект не открыт, — особенно после завершения работы над проектами.'
};
