const gulp = require('gulp');
const build = require('@iobroker/gulp-build');

// Registriert die Standard ioBroker Admin Build-Aufgabe
// Diese Aufgabe verarbeitet deine i18n-Definitionen (aus io-package.json oder jsonConfig.json)
// und generiert die words.js Datei.
gulp.task('admin', build.admin);

// Definiert eine Standardaufgabe, die beim Ausführen von 'gulp' die 'admin'-Aufgabe startet
gulp.task('default', gulp.series('admin'));