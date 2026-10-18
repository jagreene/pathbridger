# Pathbridger privacy

Pathbridger stores character data, imported and synchronized saves, manual
actions, buffs, settings, and cached rules locally in your browser profile. It
does not operate a server or send analytics, crash reports, or advertising data.

When you import a character with **Look up abilities, feats, spells, and weapon
traits on Archives of Nethys** enabled, the extension sends those rule names as
search queries to `https://elasticsearch.aonprd.com`. **Read buff from link**
sends the selected rule's identifier to the same service. These requests omit
cookies and credentials. As with any network request, the receiving service sees
your IP address and ordinary connection metadata. Rule names come from your
import, so any custom text in those fields is included in the queries.

This is why Firefox's installation prompt declares **Search terms**. The
extension does not send your full character sheet or its character-name field to
Nethys. To avoid import queries, uncheck the Nethys option before reading a
character. Manual buff entry works without fetching a link. Automatic Pathbuilder
save refresh uses already cached rules and does not start Nethys queries.

Pathbuilder synchronization copies successful character saves into this browser
profile. It does not independently access your Google Drive account or upload
the automatic calculated-roll exports. Pathbuilder's own local/Drive saving and
ordinary manual export behavior remain controlled by Pathbuilder.

Paizo editing happens locally. Pathbridger never submits posts; posting or
previewing through Paizo's own controls sends your draft to Paizo normally.
Opening a rules link navigates to that external website normally.

While a supported Paizo forum tab is open, forum monitoring fetches that page's
advertised RSS/Atom feed from Paizo about once a minute using your existing Paizo
session. Paizo receives the feed URL, ordinary connection metadata, and applicable
Paizo cookies. Feed post identifiers and notification destinations are retained in
extension session storage to suppress duplicate desktop alerts, and disappear
when the browser session ends. Notification preferences remain in local storage.
Notifications display the forum/thread name through the browser and operating
system. Disable monitoring or desktop alerts in **Forum notifications** settings.

Each browser profile has separate extension data. Uninstalling the extension
removes its local extension storage; files you downloaded separately remain on
your computer. Third-party websites govern their own handling of requests and
account data.
