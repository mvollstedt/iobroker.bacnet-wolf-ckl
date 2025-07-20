const gulp = require('gulp');
const fs = require('fs');
const path = require('path');

// Task zur Generierung von words.js aus jsonConfig.json
gulp.task('admin', function(cb) {
    const jsonConfigPath = path.join(__dirname, 'admin', 'jsonConfig.json');
    const wordsJsPath = path.join(__dirname, 'admin', 'words.js');

    try {
        // jsonConfig.json lesen
        const jsonConfig = JSON.parse(fs.readFileSync(jsonConfigPath, 'utf8'));
        const i18n = jsonConfig.i18n || {}; // Den i18n-Abschnitt extrahieren

        // Inhalt für words.js vorbereiten
        let wordsContent = '/* eslint-disable no-var */\n';
        wordsContent += '/* eslint-disable quotes */\n';
        wordsContent += '/* eslint-disable dot-notation */\n';
        wordsContent += '/* eslint-disable semi */\n';

        wordsContent += '\nvar systemDictionary = {';

        // 'en' (Englisch) als Basis hinzufügen
        if (i18n.en) {
            wordsContent += '\n    "en": ' + JSON.stringify(i18n.en, null, 4) + ',';
        } else {
            wordsContent += '\n    "en": {},';
        }

        // Andere Sprachen hinzufügen
        for (const lang in i18n) {
            if (Object.prototype.hasOwnProperty.call(i18n, lang) && lang !== 'en') {
                wordsContent += '\n    "' + lang + '": ' + JSON.stringify(i18n[lang], null, 4) + ',';
            }
        }
        // Das abschließende Komma des letzten Spracheintrags entfernen
        wordsContent = wordsContent.replace(/,\s*$/, '');

        wordsContent += '\n};\n';

        // words.js schreiben
        fs.writeFileSync(wordsJsPath, wordsContent, 'utf8');
        console.log('admin/words.js wurde erfolgreich generiert.');
        cb(); // Callback, um den Abschluss der Aufgabe zu signalisieren
    } catch (e) {
        console.error('Fehler beim Generieren von words.js:', e.message);
        cb(e); // Callback mit Fehler
    }
});

// Definiert eine Standardaufgabe, die beim Ausführen von 'gulp' die 'admin'-Aufgabe startet
gulp.task('default', gulp.series('admin'));