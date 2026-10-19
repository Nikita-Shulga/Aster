'use strict';
// Russian translations — see index.cjs.
// File identification on macOS (src/main/mac/identify.cjs). File types and phrases shared with Windows
// ('Download', 'Folder', 'Personal files', 'Your downloads'…) are in identify-win.cjs.
module.exports = {
  // ── macOS itself
  'macOS system': 'Система macOS',
  'Part of macOS itself, protected by System Integrity Protection.': 'Часть самой macOS, защищённая функцией «Защита целостности системы» (SIP).',
  'Never delete. macOS manages it and wouldn’t let you anyway.': 'Никогда не удаляйте. Этим управляет macOS, и она всё равно не позволит это удалить.',
  'Sleep image': 'Образ сна',
  'macOS saves memory here for safe sleep and hibernation.': 'Сюда macOS сохраняет содержимое памяти для безопасного сна и гибернации.',
  'Leave it; macOS manages its size.': 'Не трогайте его — macOS сама управляет его размером.',
  'Virtual memory': 'Виртуальная память',
  'Swap space macOS uses when RAM is full.': 'Файл подкачки, который macOS использует, когда заканчивается оперативная память.',
  'Leave it. Quitting memory-heavy apps shrinks it.': 'Не трогайте его. Он уменьшится, если завершить приложения, которые занимают много памяти.',
  'Temporary & cache files': 'Временные файлы и кэш',
  'Per-user temporary and cache files.': 'Временные файлы и кэш пользователей.',
  'Use the Cleaner’s Temporary files and Quick Look items instead of deleting by hand.': 'Не удаляйте вручную — воспользуйтесь пунктами «Временные файлы» и «Эскизы „Быстрого просмотра“» в разделе «Очистка».',
  'Shared system component': 'Общий системный компонент',
  'Components shared by apps or developer tools.': 'Компоненты, общие для приложений или инструментов разработчика.',
  'Don’t delete by hand.': 'Не удаляйте вручную.',

  // ── Apps
  'Application': 'Приложение',
  'The {app} app.': 'Приложение {app}.',
  'Uninstall it from Programs so Aster also removes its leftovers.': 'Удалите его в разделе «Программы» — тогда Aster уберёт и оставшиеся после него файлы.',

  // ── Xcode
  'Xcode build files': 'Файлы сборки Xcode',
  'Intermediate build products Xcode recreates.': 'Промежуточные результаты сборки, которые Xcode создаёт заново.',
  'Safe to delete; the Cleaner removes them.': 'Можно удалить — раздел «Очистка» удаляет их.',
  'Xcode archives': 'Архивы Xcode',
  'Archived app builds, needed to symbolicate crash reports of released versions.': 'Архивные сборки приложений — они нужны для символикации отчётов о сбоях в выпущенных версиях.',
  'Keep archives of versions you still support.': 'Сохраните архивы версий, которые вы ещё поддерживаете.',
  'iOS device support': 'Поддержка устройств iOS',
  'Debug symbols for connected iPhones.': 'Отладочные символы для подключавшихся iPhone.',
  'Delete versions you no longer test on.': 'Удалите версии, на которых вы больше не тестируете.',
  'iOS simulators': 'Симуляторы iOS',
  'Simulator devices and their data.': 'Устройства симулятора и их данные.',
  'Remove unused simulators in Xcode → Devices and Simulators.': 'Удалите неиспользуемые симуляторы в Xcode → Devices and Simulators.',

  // ── Your data in Apple apps
  'iPhone/iPad backup': 'Резервная копия iPhone/iPad',
  'A full local backup of a device.': 'Полная локальная резервная копия устройства.',
  'Manage in Finder → your device → Manage Backups. Delete only if you have another backup.': 'Управлять копиями можно в Finder: выберите своё устройство → «Управлять резервными копиями». Удаляйте, только если у вас есть другая копия.',
  'Files synced with iCloud Drive.': 'Файлы, синхронизированные с iCloud Drive.',
  'Deleting here deletes them on all your devices. Use “Remove Download” in Finder to free space but keep them in iCloud.': 'Если удалить их здесь, они удалятся на всех ваших устройствах. Чтобы освободить место, но сохранить файлы в iCloud, выберите в Finder «Удалить загруженную копию».',
  'Mail data': 'Данные Почты',
  'Your downloaded email and attachments.': 'Загруженные письма и вложения.',
  'Manage mailboxes in Mail instead.': 'Лучше управляйте почтовыми ящиками в приложении «Почта».',
  'Mail': 'Почта',
  'Messages history': 'История Сообщений',
  'Your iMessage and SMS history and attachments.': 'Ваша переписка в iMessage и SMS вместе с вложениями.',
  'Delete conversations in Messages, or enable “Keep messages: 1 year”.': 'Удаляйте разговоры в приложении «Сообщения» или включите параметр «Оставлять сообщения: 1 год».',
  'Messages': 'Сообщения',
  'Photos library': 'Медиатека Фото',
  'Your Photos library with all photos and edits.': 'Ваша медиатека «Фото» со всеми снимками и правками.',
  'Never delete by hand. Use Photos to remove pictures.': 'Никогда не удаляйте её вручную. Удаляйте снимки в приложении «Фото».',
  'Photos': 'Фото',
  'Docker virtual disk': 'Виртуальный диск Docker',
  'All Docker images and containers.': 'Все образы и контейнеры Docker.',
  'Free space with “docker system prune”, not by deleting this file.': 'Освобождайте место командой «docker system prune», а не удалением этого файла.',

  // ── Caches, logs, Trash, downloads
  'Cache': 'Кэш',
  'Cached data of {owner}.': 'Кэш приложения {owner}.',
  'Cached data.': 'Кэшированные данные.',
  'Safe to delete — the Cleaner does this automatically.': 'Можно удалить — раздел «Очистка» делает это автоматически.',
  'Logs': 'Журналы',
  'Log files.': 'Файлы журналов.',
  'Safe to delete.': 'Можно удалить.',
  'Trash': 'Корзина',
  'Files you deleted.': 'Удалённые вами файлы.',
  'Empty the Trash when you’re sure.': 'Очистите Корзину, когда будете уверены.',
  'Installer': 'Установщик',
  'A disk image or installer package used to install an app.': 'Образ диска или установочный пакет, из которого устанавливают приложение.',
  'Safe to delete once the app is installed.': 'Можно удалить, когда приложение уже установлено.',
  'Something you downloaded.': 'Что-то, что вы скачали.',
  'Safe to delete if you no longer need it.': 'Можно удалить, если больше не нужно.',
  'Only delete what you’re sure you don’t need.': 'Удаляйте только то, что вам точно не нужно.',

  // ── App data
  'App file': 'Файл приложения',
  'Data or settings of {owner}.': 'Данные или настройки приложения {owner}.',
  'Deleting can reset or break {owner}. Uninstall it from Programs if you don’t use it.': 'После удаления приложение {owner} может сбросить настройки или перестать работать. Если вы им не пользуетесь, удалите его в разделе «Программы».',
  'Data stored in the “{folder}” folder. No installed app with that name was found — it may be left over from a removed app.': 'Данные в папке «{folder}». Установленного приложения с таким названием не найдено — возможно, это остатки удалённого приложения.',
  'See Leftovers for a safe cleanup. If unsure, leave it.': 'Безопасно удалить такие данные можно в разделе «Остатки». Если сомневаетесь, оставьте их.',

  // ── Nothing matched
  'A folder Aster can’t attribute to a specific app.': 'Папка, которую Aster не может связать с конкретным приложением.',
  'Aster can’t tell which app created this file. It is in the folder “{folder}”.': 'Aster не может определить, какое приложение создало этот файл. Он находится в папке «{folder}».',
  'If you don’t recognise it, it’s safer to leave it.': 'Если вы не знаете, что это за файл, лучше его не трогать.'
};
