'use strict';
// Русские сообщения основного процесса. Ключи те же, что в en.cjs (это проверяет test/i18n.test.cjs).
// {name} — подстановка; объекты {one, few, many, other} — формы множественного числа по {count}.
module.exports = {
  // ---------- Общее ----------
  'error.failed': 'Не удалось выполнить операцию.',
  'main.couldNotStart': 'Не удалось запустить Aster',

  // ---------- Журнал действий («История») ----------
  'activity.cleaned': {one: 'Удалён {count} ненужный файл', few: 'Удалено {count} ненужных файла', many: 'Удалено {count} ненужных файлов', other: 'Удалено {count} ненужного файла'},
  'activity.trashedFilesBin': {one: 'В Корзину перемещён {count} файл', few: 'В Корзину перемещено {count} файла', many: 'В Корзину перемещено {count} файлов', other: 'В Корзину перемещено {count} файла'},
  'activity.trashedFilesTrash': {one: 'В Корзину перемещён {count} файл', few: 'В Корзину перемещено {count} файла', many: 'В Корзину перемещено {count} файлов', other: 'В Корзину перемещено {count} файла'},
  'activity.trashedItems': {one: 'В Корзину перемещён {count} объект', few: 'В Корзину перемещено {count} объекта', many: 'В Корзину перемещено {count} объектов', other: 'В Корзину перемещено {count} объекта'},
  'activity.registryFixed': {one: 'Исправлена {count} проблема в реестре', few: 'Исправлено {count} проблемы в реестре', many: 'Исправлено {count} проблем в реестре', other: 'Исправлено {count} проблемы в реестре'},
  'activity.regSetValue': 'Изменён параметр «{name}»',
  'activity.regDeleteValue': 'Удалён параметр «{name}»',
  'activity.regCreateKey': 'Создан раздел «{name}»',
  'activity.regDeleteKey': 'Удалён раздел',
  'activity.regRenameValue': 'Параметр «{name}» переименован в «{newName}»',
  'activity.regImported': 'Импортирован файл реестра',
  'activity.macLeftovers': {one: 'В Корзину перемещён {count} остаточный объект', few: 'В Корзину перемещено {count} остаточных объекта', many: 'В Корзину перемещено {count} остаточных объектов', other: 'В Корзину перемещено {count} остаточного объекта'},
  'activity.macAppTrashed': 'Приложение {name} перемещено в Корзину',
  'activity.macLeftoversOf': {one: 'В Корзину перемещён {count} остаточный объект приложения {name}', few: 'В Корзину перемещено {count} остаточных объекта приложения {name}', many: 'В Корзину перемещено {count} остаточных объектов приложения {name}', other: 'В Корзину перемещено {count} остаточного объекта приложения {name}'},
  'activity.macLeftoversOfApp': {one: 'В Корзину перемещён {count} остаточный объект приложения', few: 'В Корзину перемещено {count} остаточных объекта приложения', many: 'В Корзину перемещено {count} остаточных объектов приложения', other: 'В Корзину перемещено {count} остаточного объекта приложения'},
  'activity.uninstalled': 'Удалена программа {name}',
  'activity.entryRemoved': 'Удалена запись о программе {name}',
  'activity.leftoversOf': {one: 'Удалён {count} остаточный объект программы {name}', few: 'Удалено {count} остаточных объекта программы {name}', many: 'Удалено {count} остаточных объектов программы {name}', other: 'Удалено {count} остаточного объекта программы {name}'},
  'activity.leftoversOfProgram': {one: 'Удалён {count} остаточный объект программы', few: 'Удалено {count} остаточных объекта программы', many: 'Удалено {count} остаточных объектов программы', other: 'Удалено {count} остаточного объекта программы'},
  'activity.startupEnabled': 'Включена автозагрузка: {name}',
  'activity.startupDisabled': 'Отключена автозагрузка: {name}',
  'activity.startupRemoved': 'Удалено из автозагрузки: {name}',
  'activity.startupAdded': 'Добавлено в автозагрузку: {name}',
  'activity.loginItemAdded': 'Добавлено в объекты входа: {name}',
  'activity.updated': '{name}: обновлено до версии {version}',
  'activity.updatingAster': 'Обновление Aster до версии {version}',
  'activity.display': 'Режим экрана: {w}×{h}, {f} Гц',
  'activity.powerPlan': 'Изменена схема электропитания',
  'activity.highPerformance': 'Добавлена и включена схема электропитания «Высокая производительность»',
  'activity.screenAfter': 'Отключать экран через {count} мин',
  'activity.screenNever': 'Не отключать экран',
  'activity.displayAfter': 'Отключать дисплей через {count} мин',
  'activity.displayNever': 'Не отключать дисплей',
  'activity.sleepAfter': 'Переходить в режим сна через {count} мин',
  'activity.sleepNever': 'Не переходить в режим сна',
  'activity.processClosed': 'Закрыто: {name}',
  'activity.appQuit': 'Завершено: {name}',
  'activity.dnsFlushed': 'Очищен кэш DNS',
  'activity.restorePoint': 'Создана точка восстановления системы',
  'activity.snapshot': 'Создан локальный снимок Time Machine',
  'activity.snapshotsRemoved': 'Удалены локальные снимки Time Machine',
  'activity.spotlight': 'Запущена переиндексация Spotlight',
  'activity.purge': 'Освобождена неактивная память',
  'activity.trashEmptied': 'Корзина очищена',
  'activity.launchServices': 'Перестроена база данных Launch Services',
  'activity.tweak': '{title}: {before} → {after}',

  // ---------- Диалоговые окна ----------
  'dialog.exclusion': 'Выберите папку, которую Aster никогда не будет очищать',
  'dialog.exportKey': 'Экспорт раздела реестра',
  'dialog.importReg': 'Импорт файла реестра',
  'dialog.regFile': 'Файлы реестра',
  'dialog.loginApp': 'Выберите приложение, которое будет открываться при входе',
  'dialog.applications': 'Приложения',
  'dialog.startupProgram': 'Выберите программу для запуска при входе в систему',
  'dialog.programs': 'Программы',
  'dialog.analyzeFolder': 'Выберите папку для анализа',
  'main.elevationCancelled': 'Повышение прав отменено.',
  'main.unknownScan': 'Неизвестный тип сканирования',

  // ---------- Меню приложения macOS ----------
  'menu.about': 'О программе {name}',
  'menu.services': 'Службы',
  'menu.hide': 'Скрыть {name}',
  'menu.hideOthers': 'Скрыть остальные',
  'menu.showAll': 'Показать все',
  'menu.quit': 'Завершить {name}',
  'menu.edit': 'Правка',
  'menu.undo': 'Отменить',
  'menu.redo': 'Повторить',
  'menu.cut': 'Вырезать',
  'menu.copy': 'Скопировать',
  'menu.paste': 'Вставить',
  'menu.pasteAndMatchStyle': 'Вставить и согласовать стиль',
  'menu.delete': 'Удалить',
  'menu.selectAll': 'Выбрать все',
  'menu.view': 'Вид',
  'menu.resetZoom': 'Фактический размер',
  'menu.zoomIn': 'Увеличить',
  'menu.zoomOut': 'Уменьшить',
  'menu.fullScreen': 'Включить/выключить полноэкранный режим',
  'menu.window': 'Окно',
  'menu.minimize': 'Свернуть',
  'menu.zoom': 'Изменить масштаб',
  'menu.front': 'Все окна — на передний план',

  // ---------- Очистка ----------
  'cleaner.profileN': 'профиль {n}',
  'cleaner.appRunning': '{app}: приложение запущено',
  'cleaner.analyzeAgain': 'Запустите анализ ещё раз и повторите попытку.',
  'cleaner.notPartOfItem': 'Файл не относится к этому пункту.',
  'cleaner.notAFile': 'Это не файл.',
  'cleaner.recycleBinOn': 'Корзина на диске {drive}',

  // ---------- Настройки и резервные копии ----------
  'store.unknownBackup': 'Резервная копия не найдена',
  'store.restoreDenied': 'Доступ запрещён. Чтобы восстановить системные разделы, перезапустите Aster от имени администратора.',
  'store.restoreFailed': 'Не удалось импортировать резервную копию.',

  // ---------- store ----------
  'ps.requiresWindows': 'Эта функция работает только в Windows.',
  'ps.timedOut': 'Превышено время ожидания операции.',
  'ps.exitCode': 'PowerShell завершил работу с кодом {code}',
  'disk.analyzeAgain': 'Проанализируйте это расположение ещё раз.',
  'disk.chooseFolderOrDrive': 'Выберите папку или диск.',
  'disk.locationMissing': 'Это расположение не существует.',

  // ---------- updater ----------
  'updater.githubStatus': 'GitHub ответил с кодом {status}. Повторите попытку позже.',
  'updater.sumsFailed': 'Не удалось загрузить контрольные суммы ({status}).',
  'updater.sumsMissing': 'В списке контрольных сумм нет файла {name}.',
  'updater.downloadFailed': 'Не удалось загрузить файл ({status}).',
  'updater.installing': 'Устанавливается Aster {version}. Через несколько секунд Aster откроется снова.',
  'updater.portableOpened': 'Открывается Aster {version}. Новая версия сохранена рядом со старой под именем {name}; старую можно удалить.',
  'updater.macOpened': 'Aster {version} открыт в Finder. Завершите Aster, перетащите новую версию в папку «Программы» и выберите «Заменить».',
  'updater.installerOpened': 'Открыт установщик Aster {version}. Следуйте его инструкциям — он сам закроет эту копию Aster.',

  // ---------- programs-main ----------
  'programs.leftoverValues': {one: '{count} параметр', few: '{count} параметра', many: '{count} параметров', other: '{count} параметра'},
  'programs.leftoverSubkeys': {one: '{count} подраздел', few: '{count} подраздела', many: '{count} подразделов', other: '{count} подраздела'},

  // ---------- tools-main ----------
  'tools.msinfo': 'Сведения о системе',

  // ---------- mac ----------
  'mac.snapshotsRemoved': {one: 'Удалено локальных снимков: до {count}', few: 'Удалено локальных снимков: до {count}', many: 'Удалено локальных снимков: до {count}', other: 'Удалено локальных снимков: до {count}'}
};
