'use strict';
// Russian phrasebook for text that is written in English next to the logic it explains: cleaner rules,
// registry categories, tweaks, file identification, tool catalogs, PowerShell error messages.
// Each file maps the exact English text (or template with {placeholders}) to its Russian translation.
// When you add or change an English explanation, add or update its translation here — test/i18n.test.cjs
// fails for English rule, category and tweak text that has no translation.
const FILES = ['common', 'cleaner-win', 'cleaner-mac', 'registry', 'tweaks-win', 'tweaks-mac', 'identify-win', 'identify-mac', 'system', 'mac'];

const merged = Object.create(null);
for (const name of FILES) Object.assign(merged, require(`./${name}.cjs`));

module.exports = merged;
Object.defineProperty(merged, 'FILES', {value: FILES}); // not a phrase: lets the test check each file
