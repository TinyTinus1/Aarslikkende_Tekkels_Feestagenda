# Groepsagenda — GitHub Pages + Supabase

Een eenvoudige Nederlandstalige agenda voor één besloten groep. Geen buildstap, npm of eigen server nodig. De front-end bestaat uit HTML, CSS en JavaScript. Supabase bewaart activiteiten en regelt inloggen per e-mail. De kalender toont tijden in de tijdzone van de browser; de database bewaart tijdstippen met tijdzone.

## Status van deze levering

Het Supabase-project **OnlineGroepsagenda** is gekoppeld via `config.js`. De database en toegangsregels zijn al aangemaakt, en het eerste lid is toegevoegd. **Voer schema.sql voor dit project niet opnieuw uit.** Het bestand is bedoeld als referentie en voor een nieuw, leeg project.

De database is getest met tijdelijke testaccounts en transacties: groepsleden kunnen activiteiten lezen, alleen hun eigen activiteiten wijzigen, geen andere leden toevoegen en geen auteur of eigenaar vervalsen. Niet-leden en bezoekers zonder login hebben geen toegang. Alle testgegevens zijn teruggedraaid. De Supabase-securityadviseur gaf geen meldingen.

**Nog te doen:** de bestanden naar GitHub uploaden (stap 3), GitHub Pages activeren en in Supabase het website-adres en de mailprovider instellen (stap 4). Een echte e-mail-login en opslag via de gepubliceerde website moeten daarna nog worden getest (stap 5).

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
- `config.js`
- `.nojekyll`
- `README.md`
- `supabase/schema.sql` (in de submap `supabase`)

Dus niet een extra map `groepsagenda` om de hele website heen. Als er al bestanden in de repository staan, controleer eerst of je die wilt vervangen.

Commit de bestanden. Open de repository-instellingen → **Pages** → **Build and deployment** → **Deploy from a branch**. Kies de branch waar je de bestanden hebt geplaatst, meestal `main`, en de map **/(root)**. Klik Save. Zodra GitHub klaar is, staat de website normaal op:

https://TinyTinus1.github.io/Aarslikkende_Tekkels_Feestagenda/

Dit is het verwachte adres, geen bevestiging dat de website al is gepubliceerd. Een eigen domein of andere Pages-instelling kan het adres veranderen. Gebruik uiteindelijk het adres dat GitHub Pages zelf toont. Voor een private repository hangt Pages-beschikbaarheid af van je GitHub-plan.

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

De inlog-, opslag- en toegangsregels kunnen pas volledig worden getest met een geconfigureerd Supabase-project. Deze bestanden bevatten geen echte accounts of projectgegevens.

## Voorbeeld bekijken

Open de website met `?demo=1` achter het adres. De voorbeeldagenda gebruikt fictieve activiteiten en tijdelijke gegevens in het geheugen. Je kunt toevoegen, bewerken en verwijderen uitproberen. Herladen wist alle demowijzigingen; de demo maakt geen verbinding met Supabase en geeft geen toegang tot echte activiteiten.

Je kunt `index.html` lokaal openen en op **Bekijk de voorbeeldagenda** klikken. Voor de echte inlogflow gebruik je de HTTPS-website op GitHub Pages of een lokale HTTP-server met een toegestane Supabase redirect-URL.

## Leden beheren

Je beheert leden via Supabase; een aparte beheerderspagina is niet nodig voor deze eerste versie. Voeg een lid toe met de query uit stap 1. Verwijder toegang met:

```sql
delete from public.members where email = 'vriend@voorbeeld.nl';
```

Activiteiten blijven dan bewaard. Alleen de maker kan ze via de website aanpassen; als beheerder kun je ze in de Supabase Table Editor beheren. Als je het hele Supabase-account van een gebruiker verwijdert, worden diens activiteiten door de database ook verwijderd.

Een ingetrokken lid kan geen nieuwe gegevens ophalen of schrijven. Gegevens die eerder op diens scherm stonden kunnen blijven staan tot het vernieuwen; reeds bekeken gegevens kunnen uiteraard niet worden teruggenomen.

## Onderhoud en bronnen

Nieuwe commits in de gekozen Pages-branch publiceren wijzigingen. Er zijn geen secrets of aparte GitHub Actions nodig voor deze eenvoudige opzet. JavaScript gebruikt Supabase JS 2.49.8 via jsDelivr; het ontwerp gebruikt Google Fonts met een lokale fallback. Als die diensten niet bereikbaar zijn, blijft de demo werken met een standaardlettertype; de echte agenda heeft de Supabase-library nodig.

- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- Pages aanmaken: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- Supabase API keys: https://supabase.com/docs/guides/api/api-keys
- Supabase toegangsregels: https://supabase.com/docs/guides/database/postgres/row-level-security
- Redirect URLs: https://supabase.com/docs/guides/auth/redirect-urls
- SMTP instellen: https://supabase.com/docs/guides/auth/auth-smtp
