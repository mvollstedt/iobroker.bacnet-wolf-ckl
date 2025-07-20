const gulp = require('gulp');
const fs = require('fs');
const path = require('path');

// Task zur Generierung von words.js aus dem i18n-Ordner
gulp.task('admin', function(cb) {
    const i18nDir = path.join(__dirname, 'admin', 'i18n');
    const wordsJsPath = path.join(__dirname, 'admin', 'words.js');

    let systemDictionary = {};

    try {
        // Alle JSON-Dateien im i18n-Ordner lesen
        const languages = fs.readdirSync(i18nDir).filter(file => file.endsWith('.json'));

        for (const langFile of languages) {
            const langCode = path.basename(langFile, '.json'); // Dateiname ist der Sprachcode (z.B. 'en', 'de')
            const langContent = JSON.parse(fs.readFileSync(path.join(i18nDir, langFile), 'utf8'));
            systemDictionary[langCode] = langContent;
        }

        // Inhalt für words.js vorbereiten (Standard-Header von ioBroker)
        let wordsContent = '/* eslint-disable no-var */\n';
        wordsContent += '/* eslint-disable quotes */\n';
        wordsContent += '/* eslint-disable dot-notation */\n';
        wordsContent += '/* eslint-disable semi */\n';

        // Das systemDictionary-Objekt als JavaScript-Variable schreiben
        wordsContent += '\nvar systemDictionary = ' + JSON.stringify(systemDictionary, null, 4) + ';\n';

        // words.js Datei schreiben
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