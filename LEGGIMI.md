# Delega FP CGIL Nord Sardegna — modulo online con firma OTP via email (Netlify)

## Come funziona
0. All'apertura il lavoratore sceglie l'**area**: **Sassari** o **Gallura**. L'area decide l'IBAN
   su cui versare la quota (mostrato nella pagina e stampato nel PDF) e chi riceve la delega.
   Link diretti: `https://SITO.netlify.app/?area=sassari` e `https://SITO.netlify.app/?area=gallura`.
1. Il lavoratore compila online la delega (stessi campi del modulo cartaceo MOD.SS),
   legge l'informativa e sceglie i 4 consensi (presto / nego).
2. Nella sezione **Firma** inserisce la sua email → **Invia codice**.
3. Riceve un codice di 6 cifre (valido 10 minuti), lo inserisce → **Firma e invia la delega**.
4. Il server:
   - compila il **PDF originale** della delega (pag. 1 dati, pag. 2 consensi barrati, luogo/data/firma);
   - aggiunge una **pagina 3 di attestazione**: riferimento pratica, email verificata, data/ora della
     verifica OTP e dell'invio, indirizzo IP, browser, impronta SHA-256 dei dati;
   - invia il PDF via email a `NOTIFY_TO` (la segreteria) e all'iscritto;
   - archivia dati e PDF su Netlify Blobs (store `deleghe`).

Controlli: codice fiscale verificato (incluso il carattere di controllo), CAP, date,
4 consensi obbligatori; max 5 tentativi per codice, 60 s tra un invio e l'altro, max 5 codici/ora
per indirizzo, codice monouso, ogni verifica vale per una sola delega (entro 30 minuti).
Tutti i controlli sono ripetuti sul server.

## 1. Account email per l'invio (esempio Gmail)
1. Sull'account Google attiva la **verifica in 2 passaggi**.
2. Vai su https://myaccount.google.com/apppasswords e crea una **password per le app**.
3. Usa quella password (16 caratteri, senza spazi) come `SMTP_PASS`.

Va bene qualsiasi SMTP: Aruba `smtps.aruba.it` porta 465 · Office365 `smtp.office365.com` porta 587.

## 2. Pubblicare su Netlify
⚠️ Il "trascina e rilascia" (Netlify Drop) pubblica solo la pagina: le funzioni che inviano
il codice e generano il PDF **non funzionerebbero**. Usa uno di questi metodi.

### Metodo A — GitHub (consigliato)
1. Crea un repository su GitHub (anche privato) e carica il contenuto di questa cartella.
2. https://app.netlify.com → **Add new site → Import an existing project** → GitHub → scegli il repository.
3. Le impostazioni sono già in `netlify.toml`: lascia tutto com'è → **Deploy**.

### Metodo B — Netlify CLI (dal computer, serve Node.js)
```bash
cd modulo-otp-netlify
npm install
npx netlify-cli login
npx netlify-cli deploy --build --prod
```

## 3. Variabili d'ambiente (obbligatorie)
Netlify: **Site configuration → Environment variables → Add a variable**

| Variabile    | Esempio                                          |
|--------------|--------------------------------------------------|
| `OTP_SECRET` | stringa casuale ≥ 32 caratteri                    |
| `SMTP_HOST`  | `smtp.gmail.com`                                 |
| `SMTP_PORT`  | `465`                                            |
| `SMTP_USER`  | `indirizzo@gmail.com`                            |
| `SMTP_PASS`  | password per le app                              |
| `MAIL_FROM`  | `FP CGIL Nord Sardegna <indirizzo@gmail.com>`    |
| `NOTIFY_TO_SASSARI` | chi riceve le deleghe dell'area di Sassari, es. `fpsassari@cgilsarda.it` |
| `NOTIFY_TO_GALLURA` | chi riceve le deleghe dell'area della Gallura, es. `fpgallura@cgilsarda.it` |
| `NOTIFY_TO`  | (facoltativa) indirizzo di riserva se manca quello dell'area |

Per più destinatari separa gli indirizzi con una virgola.

Per generare `OTP_SECRET`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
(oppure un generatore di password lunghe). **Non cambiarla** dopo la pubblicazione senza motivo.

Dopo aver aggiunto le variabili: **Deploys → Trigger deploy → Deploy site**.

## 4. Dove trovo le deleghe
- Via email a `NOTIFY_TO`, con PDF allegato ("Rispondi" scrive direttamente all'iscritto).
- Archivio: pannello del sito su Netlify → **Blobs** → store `deleghe`. I file si chiamano
  `DEL-SS-....` (Sassari) e `DEL-GA-....` (Gallura), in formato `.pdf` e `.json`.

## Modificare il modulo
- Pagina web: `public/index.html` (testi, campi, elenchi suggeriti di CCNL e tipi di rapporto).
- Regole dei campi: `netlify/lib/fields.mjs`.
- Posizione dei dati sul PDF: `netlify/lib/pdf.mjs`.
- IBAN e intestatario delle aree: `AREE` in `netlify/lib/fields.mjs` **e** in `public/app.js`.
- Modelli PDF: `assets/modulo-delega.pdf` (Sassari) e `assets/modulo-delega-gallura.pdf`
  (lo stesso modulo senza IBAN: quello della Gallura viene scritto dal programma).
  Se sostituisci un PDF esegui `npm run template` e verifica le coordinate in `pdf.mjs`.

## Nota sul valore della firma
La firma con OTP via email è una **firma elettronica semplice** (Reg. UE 910/2014 – eIDAS, art. 20 CAD):
il valore probatorio è valutato caso per caso. Prima di usarla, verificate che le amministrazioni
destinatarie accettino deleghe sottoscritte in questo modo; in caso contrario il PDF generato può
essere stampato e firmato a mano.

## Problemi frequenti
- **"Impossibile inviare l'email"** → credenziali SMTP errate: vedi *Logs → Functions → send-otp*.
- **Errore 500** → manca `OTP_SECRET` o è più corta di 32 caratteri.
- **Il codice non arriva** → controllare lo spam; Gmail ha un limite di circa 500 email/giorno.
