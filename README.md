# Groepsagenda — GitHub Pages + Supabase

Een eenvoudige Nederlandstalige agenda voor één besloten groep. Geen buildstap, npm of eigen server nodig. De front-end bestaat uit HTML, CSS en JavaScript. Supabase bewaart activiteiten en regelt inloggen per e-mail. De kalender toont tijden in de tijdzone van de browser; de database bewaart tijdstippen met tijdzone.

## Status van deze levering

De naam is Agenda Aarslikkende tekkels. Nieuwe gebruikers bevestigen eerst hun e-mailadres met een inloglink en vragen daarna toegang aan. Totdat een beheerder goedkeurt, kunnen ze geen activiteiten lezen of schrijven. Tinus beoordeelt aanvragen op de website met het bestaande beheerdersaccount; de mailbox zelf verleent geen beheerrechten. Bestaande leden behouden hun toegang.

De aanvraagmelding gaat uitsluitend naar aarslikkendetekkels@gmail.com. De Edge Function notify-membership is gedeployd, de Gmail-secrets zijn ingesteld en de testmail is op 2 oktober 2026 succesvol via het ingelogde beheerdersaccount verstuurd. Goedkeuren gebeurt ingelogd op de website, niet door een e-maillink alleen te openen. Aanvragen blijven ook zichtbaar wanneer mailverzending mislukt.

Bovenaan staat voor beheerders .ICS importeren. Kies maximaal 200 activiteiten in een bestand van maximaal 1 MB, controleer het voorbeeld en bevestig de import. De import is atomair; opnieuw importeren met hetzelfde beheerdersaccount slaat bestaande UID’s over. Losse afspraken en meegestuurde tijdzones worden ondersteund. Terugkerende afspraken, geannuleerde items, ontbrekende tijdzonedefinities en ongeldige velden worden met reden overgeslagen. Zonder eindtijd krijgt een afspraak één uur; een hele dag loopt tot de volgende lokale middernacht. Het geïmporteerde item heeft de beheerder als maker.

De vormgeving heeft oranje knoppen en accenten. Het donkere thema gebruikt een zwarte achtergrond met een iets lichtere kalender. De groepsnaam en maandtekst zijn aangepast; Activiteit toevoegen staat direct onder Op de planning. Onder Waar? staat een gratis Google Maps-zoeklink: typ een adres of locatienaam, open Google Maps en neem het gevonden adres handmatig over. Er is geen API-sleutel nodig en er worden geen adresvoorstellen in het formulier opgehaald.

De versie met beheerrechten, aanwezigheidsregistratie, een donker thema en `.ics`-export is toegevoegd. Tinus heeft beheerrechten in Supabase. Leden kunnen alleen hun eigen activiteiten bewerken en verwijderen; de beheerder kan dat bij alle activiteiten. Elke nieuwe activiteit is zichtbaar voor de hele groep. Je aanwezigheid kun je zelf aan- en uitzetten; anderen zien de namen van aanwezige leden.

De themakeuze wordt alleen op je eigen apparaat onthouden. Via **Voeg toe aan persoonlijke agenda** download je één activiteit; de knop onder de kalender exporteert alle activiteiten, ook buiten de geselecteerde maand. Dit is een eenmalige import, geen abonnement: wijzigingen en verwijderingen worden niet automatisch in je persoonlijke agenda doorgevoerd. De daadwerkelijke import op een fysieke iPhone moet nog worden gecontroleerd; de .ics-export is getest op UTC-tijden, escaping en UTF-8-regelvouwen.

`supabase/admin-attendance.sql` is al uitgevoerd op dit project; voer het niet opnieuw uit. Voor een geheel nieuw project voer je eerst schema.sql uit en daarna admin-attendance.sql. Beheerrechten staan in `public.members.is_admin` en kunnen uitsluitend via Supabase worden toegekend, niet vanuit de website.

Het Supabase-project **OnlineGroepsagenda** is gekoppeld via `config.js`. De database en toegangsregels zijn al aangemaakt, en het eerste lid is toegevoegd. **Voer schema.sql voor dit project niet opnieuw uit.** Het bestand is bedoeld als referentie en voor een nieuw, leeg project.

De database is getest met tijdelijke testaccounts en transacties: groepsleden kunnen activiteiten lezen, alleen hun eigen activiteiten wijzigen, geen andere leden toevoegen en geen auteur of eigenaar vervalsen. Niet-leden en bezoekers zonder login hebben geen toegang. Alle testgegevens zijn teruggedraaid. De laatste Supabase-securitycontrole gaf geen databasewaarschuwingen. De bestaande Auth-waarschuwing over bescherming tegen gelekte wachtwoorden staat nog aan; deze agenda gebruikt inloglinks.

**Publicatie:** GitHub Pages is actief. Tinus is succesvol ingelogd via e-mail en de opgeslagen activiteit is zichtbaar op de gepubliceerde website. De beheerdermail is succesvol verstuurd. Goedkeuring, afgeschermde toegang en atomaire import zijn met database-transacties getest; importvoorbeelden en het overslaan van dubbelen zijn in de browser gecontroleerd.

## 1. Maak een Supabase-project

Maak op https://supabase.com/dashboard een project onder je eigen account. Kies bij voorkeur een EU-regio. Het databasewachtwoord hoort niet in deze website.

Open de SQL Editor, plak de inhoud van `supabase/schema.sql` en voer die één keer uit. Het script maakt de tabellen, validatie en toegangsregels. Bij een fout wordt de transactie teruggedraaid. Voer het script niet opnieuw uit wanneer de tabellen al bestaan.

Voeg daarna jezelf en je groepsleden toe via de SQL Editor:

```sql
insert into public.members (email, display_name) values
  ('jouw-e-mailadres@voorbeeld.nl', 'Jouw naam'),
  ('vriend@voorbeeld.nl', 'Naam vriend')
on conflict (email) do update set display_name = excluded.display_name;
```

Vervang deze voorbeelden door de echte e-mailadressen. Gebruik kleine letters en precies het adres waarmee het lid gaat inloggen. Je kunt leden vooraf toevoegen; ze hoeven nog geen account te hebben.

**Zet deze echte ledenlijst nooit in de GitHub-repository.** Beheer hem uitsluitend in Supabase.

## 2. Vul config.js in

Kopieer de Project URL en de **publishable key** uit het Supabase-dashboard (Project Settings / API Keys; de URL staat bij de API-instellingen of Connect). Een bestaande `anon`-key werkt ook.

```js
window.AGENDA_CONFIG = Object.freeze({
  supabaseUrl: 'https://JOUW-PROJECT.supabase.co',
  supabasePublishableKey: 'sb_publishable_JOUW_WAARDE'
});
```

Deze twee waarden mogen openbaar in GitHub staan. Gebruik **nooit** een `sb_secret_...`-key, `service_role`-key, databasewachtwoord of toegangstoken. De database policies bepalen wie gegevens mag lezen en wijzigen.

## 3. Publiceer via jouw repository

Je repository: https://github.com/TinyTinus1/Aarslikkende_Tekkels_Feestagenda

Plaats de bestanden **uit deze map** in de hoofdmap van de repository:

- `index.html`
- `style.css`
- `app.js`
- `calendar-export.js`
- `calendar-import.js`
- `calendar-recurrence.js`
- `config.js`
- `.nojekyll`
- `README.md`
- `supabase/schema.sql` en `supabase/admin-attendance.sql` (in de submap `supabase`; bij een browserupload mag de migratie ook als admin-attendance.sql in de hoofdmap staan)

Dus niet een extra map `groepsagenda` om de hele website heen. Als er al bestanden in de repository staan, controleer eerst of je die wilt vervangen.

Commit de bestanden. Open de repository-instellingen → **Pages** → **Build and deployment** → **Deploy from a branch**. Kies de branch waar je de bestanden hebt geplaatst, meestal `main`, en de map **/(root)**. Klik Save. Zodra GitHub klaar is, staat de website normaal op:

https://TinyTinus1.github.io/Aarslikkende_Tekkels_Feestagenda/

GitHub Pages heeft dit adres als live website bevestigd. Een eigen domein of andere Pages-instelling kan het adres veranderen. Gebruik uiteindelijk het adres dat GitHub Pages zelf toont. Voor een private repository hangt Pages-beschikbaarheid af van je GitHub-plan.

## 4. Stel de e-mail-login in

Ga in Supabase naar **Authentication → URL Configuration**. Zet als **Site URL** én als toegestane **Redirect URL** het volledige Pages-adres, inclusief de repositorynaam en afsluitende slash:

```text
https://TinyTinus1.github.io/Aarslikkende_Tekkels_Feestagenda/
```

Laat de e-mailprovider en het aanmaken van accounts ingeschakeld. Nieuwe accounts krijgen alleen toegang tot de agenda als hun geverifieerde e-mailadres in `members` staat. Onbekende personen kunnen eventueel een account aanmaken, maar kunnen geen activiteiten lezen of schrijven. Laat e-mailwijzigingen bevestigen via de veilige standaardinstellingen van Supabase.

Controleer bij **Authentication → Email Templates → Magic Link** dat de inloglink `{{ .ConfirmationURL }}` gebruikt. Open een inloglink via het adres waarop de agenda wordt gehost.

**Voor echt gebruik door je groep:** configureer een eigen SMTP-provider bij Supabase Authentication. De ingebouwde testmaildienst heeft beperkingen en kan verzending naar gewone groepsleden weigeren. Controleer je SMTP-instellingen, afzenderadres en verzendlimieten voordat je de groep uitnodigt.

## 5. Controleer de live versie

1. Log in met je eigen toegevoegde e-mailadres en maak een activiteit aan.
2. Herlaad de pagina: de activiteit moet blijven staan.
3. Log op een ander apparaat in met een tweede groepslid: dezelfde activiteit moet zichtbaar zijn. De agenda wordt elke 30 seconden vernieuwd; er is ook een knop om dit direct te doen.
4. Het tweede groepslid mag de activiteit van het eerste lid niet bewerken of verwijderen, maar kan wel zelf een activiteit toevoegen.
5. Log in met een e-mailadres dat niet in `members` staat: de agenda moet afgeschermd blijven.
6. Trek de toegang van een lid in via Supabase; vernieuw de agenda op diens apparaat en controleer dat er geen toegang meer is.

De inlog-, opslag- en toegangsregels kunnen pas volledig worden getest met een geconfigureerd Supabase-project. config.js bevat de openbare projectinstellingen; leden en inloggegevens worden uitsluitend in Supabase beheerd.

## Voorbeeld bekijken

Open de website met `?demo=1` achter het adres. De voorbeeldagenda gebruikt fictieve activiteiten en tijdelijke gegevens in het geheugen. Je kunt toevoegen, bewerken en verwijderen uitproberen. Herladen wist alle demowijzigingen; de demo maakt geen verbinding met Supabase en geeft geen toegang tot echte activiteiten.

Je kunt `index.html` lokaal openen en op **Bekijk de voorbeeldagenda** klikken. Voor de echte inlogflow gebruik je de HTTPS-website op GitHub Pages of een lokale HTTP-server met een toegestane Supabase redirect-URL.

## Leden beheren

Nieuwe leden vragen toegang aan op de website. Als beheerder beoordeel je ze bij Aanmeldingsaanvragen. Je kunt leden ook vooraf toevoegen via Supabase met de query uit stap 1. Verwijder toegang met:

```sql
delete from public.members where email = 'vriend@voorbeeld.nl';
```

Activiteiten blijven dan bewaard. De maker en een groepsbeheerder kunnen ze via de website aanpassen. Als je het hele Supabase-account van een gebruiker verwijdert, worden diens activiteiten door de database ook verwijderd.

Een ingetrokken lid kan geen nieuwe gegevens ophalen of schrijven. Gegevens die eerder op diens scherm stonden kunnen blijven staan tot het vernieuwen; reeds bekeken gegevens kunnen uiteraard niet worden teruggenomen.

## Onderhoud en bronnen

Nieuwe commits in de gekozen Pages-branch publiceren wijzigingen. Er zijn geen secrets of aparte GitHub Actions nodig voor deze eenvoudige opzet. JavaScript gebruikt Supabase JS 2.49.8 via jsDelivr; het ontwerp gebruikt Google Fonts met een lokale fallback. Als die diensten niet bereikbaar zijn, blijft de demo werken met een standaardlettertype; de echte agenda heeft de Supabase-library nodig.

- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- Pages aanmaken: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- Supabase API keys: https://supabase.com/docs/guides/api/api-keys
- Supabase toegangsregels: https://supabase.com/docs/guides/database/postgres/row-level-security
- Redirect URLs: https://supabase.com/docs/guides/auth/redirect-urls
- SMTP instellen: https://supabase.com/docs/guides/auth/auth-smtp

Google Maps URLs: https://developers.google.com/maps/documentation/urls/get-started

## E-mailmeldingen voor nieuwe aanmeldingen activeren

Supabase → Edge Functions → Secrets:

- AGENDA_SMTP_USER: het Gmail-adres waarmee wordt verstuurd.
- AGENDA_SMTP_PASSWORD: een geldig appwachtwoord voor dat Gmail-account, uitsluitend hier invoeren.

Het SMTP-wachtwoord van Authentication is niet beschikbaar voor Edge Functions. Deze functie gebruikt smtp.gmail.com, TLS op poort 465, en leest alleen bovenstaande serversecrets. Zet geen wachtwoorden in config.js, GitHub of deze handleiding. Log daarna in als Tinus en klik Test beheerdermail. De bestemming staat vast op aarslikkendetekkels@gmail.com.

De functie accepteert uitsluitend door Supabase geverifieerde gebruikers. Per aanvraag maximaal één geslaagde melding; bij een verzendfout kan na één uur opnieuw worden geprobeerd, maximaal 10 aanvraagmeldingen per uur voor de hele groep. De gebruiker kan Stuur melding opnieuw kiezen. De functie heeft een eigen getUser-authenticatiecontrole; verify_jwt=false schakelt die controle niet uit.

Nieuwe SQL-referenties: supabase/membership-approval.sql en supabase/calendar-import.sql. Beide zijn al op het bestaande project toegepast; niet opnieuw uitvoeren. Bron mailfunctie: supabase/functions/notify-membership/index.ts. Bij browseruploads mogen deze bestanden als referentie in de repositoryroot staan.

ICS-parser: ICAL.js 2.2.1, https://github.com/kewisch/ical.js
Edge Function secrets: https://supabase.com/docs/guides/functions/secrets


## Geboortedatum, herhaling en activiteitenmeldingen

Nieuwe toegangsaanvragen moeten een geldige geboortedatum bevatten. Na goedkeuring maakt de database één jaarlijkse verjaardag als hele dag. Het geboortejaar staat niet in de gedeelde activiteit; de volledige datum is alleen beschikbaar voor de aanvrager en de beheerder in de aanvraag, en wordt verder privé bewaard. Bestaande leden krijgen geen willekeurige geboortedatum toegewezen.

Activiteiten kunnen dagelijks, wekelijks of jaarlijks herhalen, zonder einddatum. Eén rij bewaart de reeks; alleen de zichtbare periode wordt berekend. Herhaling volgt Europe/Amsterdam en behoudt de lokale tijd bij zomer-/wintertijd. 29 februari wordt in andere jaren 28 februari. Bewerken en verwijderen gelden voor de hele reeks. Aanwezigheid is per afzonderlijke datum; wijzigen van tijd, datum of herhaling wist eerdere aanmeldingen voor de reeks. Een herhaalactiviteit mag per keer maximaal 31 dagen duren. Export ondersteunt RRULE, verjaardagen als hele dag en de Nederlandse tijdzone. ICS-import van externe reeksen wordt nog steeds overgeslagen.

Nieuwe gewone activiteiten krijgen automatisch een mailwachtrij voor andere goedgekeurde leden met een bevestigd e-mailadres. De maker, niet-leden en afgewezen aanvragers krijgen geen mail. Verjaardagen en bewerkingen veroorzaken geen nieuw-activiteitmail. Bulkimports worden binnen één transactie tot één mail per ontvanger gebundeld. Elke minuut controleert Supabase Cron of er mail klaarstaat; de browser mag worden gesloten. Alleen de database bepaalt ontvangers en inhoud. De worker notify-activities heeft JWT-controle aan; de cron gebruikt een openbare anon-projectkey uitsluitend om de worker te wekken. Mailwachtrij en service-RPCs zijn niet toegankelijk voor bezoekers of groepsleden. Per project maximaal 100 mailjobs per dag, vijf automatische pogingen per job bij tijdelijke fouten. Gmail heeft daarnaast eigen verzendlimieten.

SQL-referenties birthdays-recurrence.sql en activity-notifications.sql zijn al toegepast op dit project. Workerbron: supabase/functions/notify-activities/index.ts. De bestaande AGENDA_SMTP_USER en AGENDA_SMTP_PASSWORD worden gebruikt. Geen extra wachtwoorden nodig. Geboortedata horen nooit in de openbare GitHub-repository.

Verificatie op 2 oktober 2026: tests voor verplichte geboortedatum, goedkeuring met verjaardagsaanmaak, privacy, jaarlijkse schrikkeldag, wekelijkse zomer-/wintertijd en aanwezigheid per datum zijn geslaagd en teruggedraaid. Mailwachtrijtests voor bundelen, uitsluiten van de maker en dubbele claims zijn geslaagd. Supabase Cron heeft de gemarkeerde testmelding naar het beheerders-inlogadres in één poging succesvol verstuurd.


## Bevestigingsmail na goedkeuring

Vanaf 2 oktober 2026 zet goedkeuren van een nieuwe toegangsaanvraag automatisch één welkomstmail klaar voor het bevestigde e-mailadres van die gebruiker. De mail bevat de tekst Je bent toegelaten tot de groep en een oranje Open de agenda-knop. Die link verleent geen toegang zonder de bestaande inlogflow. Afwijzen verstuurt geen welkomstmail. De bestaande serverwachtrij, retry-logica, JWT-beveiligde worker en Cron-taak worden gebruikt. Als toegang vóór verzending is ingetrokken, wordt de mail overgeslagen. Er is geen backfill naar eerder goedgekeurde leden. De migratie approval-notifications.sql is al toegepast; notify-activities is bijgewerkt naar versie 2. Database-tests zijn teruggedraaid; mailinhoud, HTML-escaping, activiteitenmail en afleveringregistratie zijn met een gemockte SMTP-transport getest.


### Eerste aanmelding met code
Nieuwe, nog niet bevestigde Auth-accounts krijgen in de Supabase-mail **Confirm sign up** alleen `{{ .Token }}` en een gewone link naar de agenda, zonder bevestigingstoken in de link. Het sjabloon staat in `supabase/signup-email.html`. De mail **Magic link or OTP** blijft een inloglink bevatten voor al bevestigde accounts. Na verificatie via `verifyOtp({ email, token, type: "email" })` volgt het bestaande formulier voor naam/geboortedatum en de beheerdersgoedkeuring. Bestaande accounts hoeven hun adres niet opnieuw te bevestigen.

Bij terugkeer uit Google Maps negeert de app herhaalde `SIGNED_IN`-meldingen voor dezelfde ingelogde gebruiker, zodat het open formulier en niet opgeslagen invoer behouden blijven. Een echte uitlog of accountwisseling sluit het formulier wel.
