# Maximize

Persönliche Alltags-App als PWA (Web-App, installierbar auf Android): **Habits** und **Gym**.
Alle Daten bleiben auf dem Gerät (Browser-Speicher). Es gibt keinen Server und kein Konto.

## Aufbau

```
index.html          Gerüst der Seite: Kopfzeile, Bereiche, Fenster (Dialoge), untere Leiste
css/style.css       Aussehen (Farben und Maße oben unter :root)
js/core.js          Version, Speicher-Hilfen (readJson), Datums-Hilfen, escapeHtml
js/habits.js        Habits: Plan, Serie, Anzeige, Abhaken, Bearbeiten-Fenster
js/settings.js      Einstellungen, Schalter, Reihenfolge per Drag and drop
js/stats.js         Habits: Statistik
js/gym-data.js      Gym: Datenmodell, Prüfung (sanitizeGym), Zusammenführen, CSV-Import
js/gym-records.js   Gym: Rekorde (PRs): Gesamt und aktuell, geschätztes 1RM
js/timepick.js      Uhrzeit-Auswahl (24 Stunden, Uhrenrad)
js/sleep-data.js    Schlaf: Datenmodell, Prüfung, Zusammenführen
js/sleep-view.js    Schlaf: Gute-Nacht-Ablauf, Morgenfrage, Statistik
js/gym-view.js      Gym: Startseite, Übungsseiten, Verlauf
js/gym-workout.js   Gym: laufendes Training, Pausen-Timer, Routinen-Editor
js/backup.js        Datensicherung (Export und Import als JSON)
js/nav.js           Bereiche der unteren Leiste, Zurück-Geste, Eingabefelder
js/main.js          Start der App
sw.js               Service Worker (Offline-Betrieb, Updates)
manifest.json       Name, Farben und Icons für die Installation
```

Die Skripte werden in der Reihenfolge aus `index.html` geladen und teilen sich Funktionen
und Variablen. Eine neue Datei muss in `index.html` (Skript-Zeile) **und** in `sw.js` (APP_FILES) stehen.

## Gespeicherte Daten (localStorage)

| Schlüssel | Inhalt |
|---|---|
| `maximize-habits` | Liste der Gewohnheiten |
| `maximize-gym` | Übungen, Routinen, Trainings |
| `maximize-gym-active` | gerade laufendes Training (Autosave) |
| `maximize-sleep` | Nächte, Notizen-Auswahl, Schlafziel, Weckzeiten pro Wochentag |
| `maximize-sleep-active` | laufende Nacht (bis du morgens antwortest) |
| `maximize-settings` | Einstellungen |
| `maximize-view` | zuletzt geöffneter Bereich |
| `maximize-schema` | Version des Datenaufbaus (siehe `migrate()` in `main.js`) |
| `maximize-defekt-…` | Kopie beschädigter Daten (die drei neuesten bleiben erhalten) |

Gym-Daten sind etwa 1 KB pro Training. Der Browser erlaubt rund 5 MB, das reicht für mehrere
tausend Trainings. Wird es später eng, lässt sich die Speicherschicht (`loadGym`/`saveGym`)
auf IndexedDB umstellen, ohne den Rest zu ändern.

## Neuen Bereich ergänzen

1. In `index.html`: Abschnitt `<section id="view-NAME" hidden>` und einen Knopf in der unteren Leiste.
2. In `js/nav.js`: Eintrag in `VIEWS`.
3. Neue Datei `js/NAME.js` anlegen, in `index.html` und `sw.js` eintragen.
4. Daten: eigenen Schlüssel `maximize-NAME`, Einlesen über `readJson`, Prüfung wie `sanitizeGym`,
   und in `backup.js` in Export und Import aufnehmen.

## Veröffentlichen

Versionsnummer (1.x.y): Die erste Zahl steigt nur bei einem Meilenstein, zum Beispiel einem neuen Bereich
(gemeinsam entschieden). Die mittlere Zahl steigt mit dem Arbeitstag: Am ersten Tag ist es 1.1.x, am nächsten
Arbeitstag 1.2.x usw. (1.4.x = Sonntag, 25.10.2026). Die letzte Zahl zählt die Veröffentlichungen innerhalb des Tages.

1. `APP_VERSION` in `js/core.js`, `CACHE` in `sw.js` und `?v=` an den Dateien in `index.html` erhöhen.
2. In GitHub Desktop: Commit, Push. Nach ca. einer Minute ist die neue Version unter GitHub Pages erreichbar.
3. App auf dem Handy komplett schließen und neu öffnen. Die Versionsnummer steht unten in den Einstellungen.

## Wichtig

Das Repository ist öffentlich. Keine persönlichen Daten einchecken (zum Beispiel Sicherungsdateien
oder Trainings-CSV).
