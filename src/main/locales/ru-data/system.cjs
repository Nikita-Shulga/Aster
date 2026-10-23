'use strict';
// Russian translations for the Windows modules outside the rule tables: programs, startup, updates (WinGet),
// the Aster updater, tools, system information and display — see index.cjs.
module.exports = {
  // ---------- Programs (programs.cjs) ----------
  'Refresh the program list and try again.': 'Обновите список программ и повторите попытку.',
  'This program does not provide an uninstaller.': 'Для этой программы не задана команда удаления.',
  'The uninstaller file is missing. Use "Remove entry" and scan for leftovers instead.': 'Файл программы удаления не найден. Удалите запись программы из списка и выполните поиск остатков.',
  'Could not remove the entry. Administrator rights may be required.': 'Не удалось удалить запись. Возможно, нужны права администратора.',
  'Scan for leftovers again.': 'Снова выполните поиск остатков.',
  // Why a leftover was found
  'Install folder': 'Папка установки',
  'Matches program name': 'Совпадает с названием программы',
  'Matches publisher and program name': 'Совпадает с издателем и названием программы',
  'Desktop shortcut': 'Ярлык на рабочем столе',
  'Uninstall entry': 'Запись в списке программ',
  'Program settings': 'Параметры программы',

  // ---------- Startup (startup.cjs) ----------
  // Where an entry comes from
  'Registry · Current user': 'Реестр · Текущий пользователь',
  'Registry · All users': 'Реестр · Все пользователи',
  'Registry · All users (32-bit)': 'Реестр · Все пользователи (32 бит)',
  'Run once · Current user': 'Однократный запуск · Текущий пользователь',
  'Run once · All users': 'Однократный запуск · Все пользователи',
  'Startup folder · Current user': 'Папка «Автозагрузка» · Текущий пользователь',
  'Startup folder · All users': 'Папка «Автозагрузка» · Все пользователи',
  'Scheduled task · At startup': 'Задание планировщика · При запуске компьютера',
  'Scheduled task · At sign-in': 'Задание планировщика · При входе в систему',
  'Service · Auto': 'Служба · Автоматически',
  'Service · Manual': 'Служба · Вручную',
  'Service · Disabled': 'Служба · Отключена',
  // Errors
  'Access denied. Administrator rights are required for entries that apply to all users.': 'Доступ запрещён. Для записей, которые действуют для всех пользователей, нужны права администратора.',
  'An entry with this name already exists.': 'Запись с таким именем уже существует.',
  'Administrator rights are required for this entry. Use "Restart as administrator".': 'Для этой записи нужны права администратора. Выберите «Перезапустить от имени администратора».',
  'This entry cannot be toggled. Refresh the list.': 'Эту запись нельзя включить или отключить. Обновите список.',
  'Refresh the list and try again.': 'Обновите список и повторите попытку.',
  'Could not delete the entry.': 'Не удалось удалить запись.',
  'Services can be switched to manual start but not deleted.': 'Службу можно перевести на запуск вручную, но удалить нельзя.',
  'Enter a name for the entry.': 'Введите имя записи.',
  'Choose a program.': 'Выберите программу.',

  // ---------- Program updates via WinGet (updates.cjs) ----------
  'WinGet (App Installer) is not installed. Get "App Installer" from the Microsoft Store to enable updates.': 'WinGet («Установщик приложений») не установлен. Чтобы проверять обновления, установите «Установщик приложений» из Microsoft Store.',
  'WinGet timed out.': 'WinGet не ответил вовремя.',
  'WinGet returned an unexpected response.': 'WinGet вернул непредвиденный ответ.',
  'Another update is running.': 'Уже выполняется другое обновление.',
  'Check for updates again.': 'Проверьте наличие обновлений ещё раз.',
  'This package ID was shortened by WinGet; update it from the command line.': 'WinGet сократил идентификатор этого пакета. Обновите его из командной строки.',
  'The installer reported an error.': 'Установщик сообщил об ошибке.',

  // ---------- Aster updates (updater.cjs) ----------
  'Could not reach GitHub. Check your internet connection and try again.': 'Не удалось подключиться к GitHub. Проверьте подключение к интернету и повторите попытку.',
  'GitHub is limiting requests right now. Try again in a few minutes.': 'GitHub временно ограничивает число запросов. Повторите попытку через несколько минут.',
  'GitHub returned a release without a version.': 'GitHub вернул выпуск без номера версии.',
  'Check for updates first.': 'Сначала проверьте наличие обновлений.',
  'You already have the latest version.': 'У вас уже установлена последняя версия.',
  'This release has no download for your system. Open the release page instead.': 'В этом выпуске нет файла для вашей системы. Откройте страницу выпуска.',
  'This release has no checksums, so Aster can\'t verify the download. Open the release page instead.': 'В этом выпуске нет контрольных сумм, поэтому Aster не может проверить загруженный файл. Откройте страницу выпуска.',
  'Unexpected download address.': 'Непредвиденный адрес загрузки.',
  'A download is already running.': 'Загрузка уже выполняется.',
  'The download is incomplete. Try again.': 'Файл загружен не полностью. Повторите попытку.',
  'The download doesn\'t match its published checksum, so it was discarded. Try again.': 'Загруженный файл не совпал с опубликованной контрольной суммой и был удалён. Повторите попытку.',
  'Download cancelled.': 'Загрузка отменена.',
  'Download the update first.': 'Сначала загрузите обновление.',
  'Updates can only be installed in the packaged app.': 'Обновления можно устанавливать только в собранной версии приложения.',

  // ---------- Tools (tools.cjs) ----------
  // Actions
  'Create a restore point': 'Создать точку восстановления',
  'Snapshot system settings before big changes. Requires administrator rights.': 'Сохраняет состояние системы перед серьёзными изменениями. Нужны права администратора.',
  'Flush DNS cache': 'Очистить кэш DNS',
  'Fixes sites that fail to load after network or DNS changes.': 'Помогает, если после смены сети или DNS сайты перестали открываться.',
  'Empty Recycle Bin': 'Очистить Корзину',
  'Permanently delete everything in the Recycle Bin on all drives.': 'Безвозвратно удаляет всё содержимое Корзины на всех дисках.',
  'Restart as administrator': 'Перезапустить от имени администратора',
  'Unlock system-wide cleaning, registry fixes and service control.': 'Открывает доступ к очистке всей системы, исправлению реестра и управлению службами.',
  // Windows tools
  'Task Manager': 'Диспетчер задач',
  'Resource Monitor': 'Монитор ресурсов',
  'Services': 'Службы',
  'Device Manager': 'Диспетчер устройств',
  'Event Viewer': 'Просмотр событий',
  'Disk Management': 'Управление дисками',
  'Disk Cleanup': 'Очистка диска',
  'Registry Editor': 'Редактор реестра',
  'System Configuration': 'Конфигурация системы',
  'Advanced system settings': 'Дополнительные параметры системы',
  'System Restore': 'Восстановление системы',
  'Network connections': 'Сетевые подключения',
  'Power options': 'Электропитание',
  'Programs and Features': 'Программы и компоненты',
  // Pages of Settings
  'Storage Sense': 'Контроль памяти',
  'Windows Update': 'Центр обновления Windows',
  'Installed apps': 'Установленные приложения',
  'Startup apps': 'Автозагрузка',
  'Windows Security': 'Безопасность Windows',
  'Privacy & security': 'Конфиденциальность и защита',
  'Default apps': 'Приложения по умолчанию',
  // Results and errors
  'Restore point created': 'Точка восстановления создана',
  'DNS cache flushed': 'Кэш DNS очищен',
  'Unknown action': 'Неизвестное действие',
  'Unknown tool': 'Неизвестный инструмент',
  'Check search again: the list is out of date.': 'Проверьте поиск ещё раз: список устарел.',
  'Windows did not get permission: the administrator prompt was cancelled.': 'Windows не получила разрешения: запрос прав администратора был отменён.',
  'The repair did not finish. Try again with “Restart as administrator”.': 'Исправление не завершилось. Попробуйте снова через «Перезапустить от имени администратора».',
  'Aster checkpoint': 'Контрольная точка Aster',
  'Creating a restore point requires administrator rights.': 'Для создания точки восстановления нужны права администратора.',
  'System Protection is turned off for your system drive. Enable it in System Properties → System Protection.': 'Защита системы для системного диска отключена. Включите её в окне «Свойства системы» на вкладке «Защита системы».',

  // ---------- System information (system.cjs) ----------
  '{version} (build {build})': '{version} (сборка {build})',
  'Unknown CPU': 'Неизвестный процессор',

  // ---------- Display (display.cjs) ----------
  'Display {n}': 'Дисплей {n}',
  'Invalid display': 'Недопустимый дисплей',
  'Invalid display mode': 'Недопустимый режим экрана',
  'Display not found': 'Дисплей не найден',
  'This display mode is not supported (code {code}).': 'Этот режим экрана не поддерживается (код {code}).'
};
