# Graded vocabularies and defining-vocabulary constraints

Research date: 2026-09-25. Primary sources only (publisher pages, official PDFs, dataset READMEs, Council of Europe). Paywalled or login-gated texts are named and not paraphrased as if read. This note does not implement a checker.

## 1. Question

For English, German, Spanish, and Portuguese, what openly usable graded vocabularies (CEFR A1–C2) exist that could decide whether a learner-dictionary gloss token or a synonym is at or below a given CEFR band? Separately: how do learner dictionaries constrain defining vocabulary relative to the headword (fixed core vs matched to the headword’s level)?

The Council of Europe scale itself does not assign words to bands. Levels are can-do descriptors. Vocabulary is described qualitatively (range and control), not as a lemma list. Reference Level Descriptions are language-specific and are produced outside the Framework text. ([CEFR level descriptions](https://www.coe.int/en/web/common-european-framework-reference-languages/level-descriptions); vocabulary-range scale in the 2001 Framework, [rm.coe.int/1680459f97](https://rm.coe.int/1680459f97.pdf).)

A token lookup can say “this entry is above band X” only when a resource assigns **that** entry a level strictly above X. Absence, an unstated sense, or a frequency smear across levels is not that assertion.

## 2. English resources

### CEFR-J Vocabulary Profile (Tono Laboratory; olp-en-cefrj)

Official current file is **CEFR-J Wordlist Version 1.6** (updated 2020-03-24), A1–B2 only. It was built from English textbook corpora (China, Korea, Taiwan), classified into pseudo-CEFR levels, then supplemented with English Vocabulary Profile items that did not overlap. Entries carry part of speech; the same headword can sit at different levels for different parts of speech. Major nouns also carry thematic tags. Published counts (items / headwords): A1 1166 / 1068, A2 1411 / 1352, B1 2445 / 2353, B2 2779 / 2692, total 7801 / 6868. The project describes it as an indicator of basic vocabulary **including B2 recognition vocabulary**, not a complete lexicon and not C1–C2. ([cefr-j.org/download_eng](http://www.cefr-j.org/download_eng).)

Copyright is Tono Laboratory, Tokyo University of Foreign Studies. The same English page says the list may be used for research and commercial purposes with acknowledgement, that modification is allowed if the source is cited, **and** that “in the case of commercial use, the necessary expenses will be charged after separate consultation.” Those statements are not reconciled on the page. Citation form given there: “The CEFR-J Wordlist Version 1.6. Compiled by Yukio Tono, Tokyo University of Foreign Studies.”

The file Hiato already uses is **not** 1.6. [openlanguageprofiles/olp-en-cefrj](https://github.com/openlanguageprofiles/olp-en-cefrj) hosts **Vocabulary Profile 1.5** (retrieved by that project from cefr-j.org on 2020-01-20) plus the grammar profile. Its README says the CEFR-J vocabulary and grammar datasets “can be used for research and commercial purposes with no charge, provided that you cite the dataset properly.” That “no charge” sentence is the OLP README’s account of the files it hosts, not a resolution of the v1.6 consultation sentence. Repo note: [scripts/data/README.md](scripts/data/README.md); decision: [docs/adr/0029-b2-c2-sources-licenses.md](docs/adr/0029-b2-c2-sources-licenses.md).

**What a lookup can say.** For a listed headword+POS in v1.5/v1.6, the assigned band is a syllabus tag, so that entry is above every band below it and at or below its own band and higher bands. A bare token with two POS levels is not one answer. A token **absent** from A1–B2 is not “above B2”: the list was never a census of English, and it stops at B2.

### Octanove Vocabulary Profile C1/C2 (same GitHub repo)

`octanove-vocabulary-profile-c1c2-1.0.csv` is a headword, POS, CEFR, notes file for C1 and C2, made by Octanove Labs. Licence on the README: **CC-BY-SA-4.0**. The README does **not** say how C1 vs C2 was decided (learner corpus, frequency cutoff, expert judgement, or something else). Some rows repeat a headword+POS with different notes, so the file sometimes splits senses, but the level column is still a single tag. Hiato already treats EN C1–C2 lemmas as this add-on ([scripts/data/README.md](scripts/data/README.md)).

**What a lookup can say.** A listed headword+POS can be reported as tagged C1 or C2. It cannot be reported as “above C2” when missing, and a C1 tag is not evidence the word is unknown below C1 unless the (unstated) method was exclusive banding. Share-alike applies if the list is adapted and redistributed.

### English Vocabulary Profile (Cambridge University Press & Assessment)

The EVP is the English Reference Level Description for vocabulary: words, meanings, phrases, idioms, and collocations, British and American, **A1–C2**, from the Cambridge Learner Corpus and first-language corpus. Polysemous words are split by meaning; different meanings of one form are often at different levels. Cambridge states it is free online for teachers and educationalists, and that it does **not** license the data for commercial purposes. ([englishprofile.org EVP](https://englishprofile.org/?menu=english-vocabulary-profile); [contact / licences](https://englishprofile.org/?menu=contact-us); [compiling C1–C2, journal article, not fully read here](https://www.cambridge.org/core/journals/english-profile-journal/article/completing-the-english-vocabulary-profile-c1-and-c2-vocabulary/418955FC7ED2455E98A499BC40C2C816).)

Terms of use (site text): material may be downloaded, viewed, and printed for personal non-commercial research and teaching, or internal circulation, without removing proprietary notices; extracts and research from the EVP may not be used beyond that without prior written consent; software based on EVP data for sale is given as an example of a commercial publication that needs consent in advance. An acknowledgement is required when research based on the EVP is published. ([Terms](https://englishprofile.org/?menu=evp-terms-of-use).)

**What a lookup can say.** In principle, a **sense** can be at or below a band, which is the right unit for a gloss. A string cannot: an easy sense may be A1 and another C1. The resource is not openly usable inside a product checker. This pass did not download the database; the online tool was not treated as an open dump. Entry counts in secondary papers were not copied.

Cambridge also publishes exam word lists, not a full A1–C2 profile: A2 Key / Key for Schools (© UCLES 2025) and B1 Preliminary / Preliminary for Schools (© CUPA 2025). They are guides for item writers and teachers, drawn from Waystage or Threshold plus high-frequency corpus items, and they mix receptive and productive items. The A2 Key handbook says the list is **not** an exhaustive register of words that could appear on the paper. ([A2 Key list](https://www.cambridgeenglish.org/images/506886-a2-key-2020-vocabulary-list.pdf); [B1 Preliminary list](https://www.cambridgeenglish.org/Images/506887-b1-preliminary-vocabulary-list.pdf).) They cannot score an arbitrary gloss, and they are not an open licence.

### Oxford 3000 and Oxford 5000

Oxford University Press: the Oxford 3000 is 3,000 core words chosen by frequency in the Oxford English Corpus and relevance in an OUP secondary/adult course corpus, **each word aligned to CEFR A1–B2**. The Oxford 5000 is that list plus about 2,000 further words aligned at **B2–C1**. There is no C2 band on these lists. OUP’s own ELT commentary calls the tapering profile deliberate because it is a **core** vocabulary, not a complete one (about 900 A1, 800 A2, 700 B1, 600 B2 on the revised 3000). The public PDF is marked © Oxford University Press and shows one or more CEFR tags per part of speech (for example `back` noun/adverb A1, adjective A2, verb B2). ([About the lists](https://www.oxfordlearnersdictionaries.com/about/wordlists/oxford3000-5000); [PDF](https://www.oxfordlearnersdictionaries.com/external/pdf/wordlists/oxford-3000-5000/The_Oxford_3000.pdf); [OUP on the taper](https://teachingenglishwithoxford.oup.com/2019/11/11/oxford-3000️-eltoc/).)

The position paper is offered as a download from the OUP ELT site after a form; this pass did not submit that form, so its internal method chapter was not read. The FAQ says users may download and print PDFs to study offline. Site terms forbid removing copyright notices and forbid displaying or distributing any part of the Products on a network where people who are not authorised users can access them. ([Terms, updated 25 April 2018](https://www.oxfordlearnersdictionaries.com/terms-and-conditions); [FAQ](https://www.oxfordlearnersdictionaries.com/faq/).)

**What a lookup can say.** A listed POS can be reported as aligned to its printed band, so that entry is above lower bands. Absence is not “above C1” or “above B2”: unlisted words were excluded as less central, not graded. A string with several POS levels is not one band. The list is not licensed here for embedding in an app.

### Longman Defining Vocabulary

Not a CEFR word list. Pearson states that the *Longman Dictionary of Contemporary English* “uses 2000 common words in the definitions to make understanding easy.” Catalogue text for the 6th edition says meanings are explained with definitions written using only 2,000 common words. ([LDOCE About](https://www.ldoceonline.com/about.html); [Pearson ELT Spain, 6th edition](https://www.pearsonelt.es/catalogue/Dictionaries/Longman-Dictionary-of-Contemporary-English-6th-edition.html).) The printed list sits in the dictionary (Google Books tables of contents place “Longman Defining Vocabulary” in the appendices). It is Pearson copyright, not an open dataset, and it has no A1–C2 column. A lookup cannot say “above band X.”

### Other machine-readable English grade file (not a substitute)

EFLLex (UCLouvain CEFRLex) reports normalised frequencies of receptive lemmas across **A1–C1, not C2**, from textbooks and online resources (15,280 lemmas in the NLP4J download, including multi-word expressions). Licence: **CC BY-NC-SA 4.0**. It is a distribution, not one band per word. ([EFLLex](https://cental.uclouvain.be/cefrlex/efllex/); [download](https://cental.uclouvain.be/cefrlex/efllex/download/).) Non-commercial share-alike blocks the use Hiato already rejected for CEFRLex ([docs/adr/0029-b2-c2-sources-licenses.md](docs/adr/0029-b2-c2-sources-licenses.md)).

## 3. German resources

### Profile deutsch

*Profile deutsch* (Glaboniat, Müller, Rusch, Schmitz, Wertenschlag; Langenscheidt) is the German reference-level description associated with the Council of Europe / Goethe-Institut / ÖSD line. The book-and-CD edition covers levels **A1–A2, B1–B2, and C1–C2**, with can-do statements and communicative means, including thematic vocabulary (*thematischer Wortschatz*). It is a published commercial work, not an open lemma file. This pass did not obtain the CD-ROM, so no inventory size or per-band word count is stated here. Goethe exam word lists cite it as a source they compared against, which confirms it is an upstream inventory, not a public dump. ([Langenscheidt contents, publisher extract](https://external.dandelon.com/download/attachments/dandelon/ids/CH00111115C1172E53325C1257AE1004CDD1D.pdf); Goethe A1 Fit in Deutsch 1 Wortliste, comparison list, [PDF](https://www.goethe.de/pro/relaunch/prf/en/Goethe-Zertifikat_A1_Fit1_Wortliste.pdf).)

### Goethe-Institut Wortlisten

Official PDFs on goethe.de, each an extract from a Hueber *Prüfungsziele* volume:

- **A1** Fit in Deutsch 1 Wortliste, © Goethe-Institut 2024. The list is an information and reference overview of the exam’s level, explicitly “less suitable” for drilling vocabulary. It was checked against earlier Start Deutsch 1 lists and against *Profile Deutsch* (Langenscheidt 2005). ([PDF](https://www.goethe.de/pro/relaunch/prf/en/Goethe-Zertifikat_A1_Fit1_Wortliste.pdf).) Start Deutsch 1 *Prüfungsziele* describes its alphabetical list as words learners at A1 should understand **passively**. ([PDF](https://www.goethe.de/pro/relaunch/prf/tr/Pruefungsziele_Testbeschreibung_A1_SD1.pdf).)
- **A2** Wortliste, © Goethe-Institut 2016. “The work and its parts are protected by copyright. Any use other than that permitted by law therefore requires the prior written consent of the Goethe-Institut.” About **1,300** lexical units that learners at A2 should know. ([PDF](https://www.goethe.de/pro/relaunch/prf/de/Goethe-Zertifikat_A2_Wortliste.pdf).)
- **B1** Wortliste, © 2016 Goethe-Institut and ÖSD, same prior-consent sentence (publishers). About **2,400** lexical units that learners at B1 should know, for both the youth and adult exams. ([PDF](https://www.goethe.de/pro/relaunch/prf/zh/Goethe-Zertifikat_B1_Wortliste.pdf).)

These lists are cumulative exam references for one level (“should know at this level”), not six exclusive bands, and not open. **No official Goethe Wortliste for B2, C1, or C2** turned up on the practice-material pages consulted. Those pages offer model papers; C2 adds a literature list, not a graded lemma list. ([B2 model](https://www.goethe.de/pro/relaunch/prf/materialien/B2/b2_modellsatz_erwachsene.pdf); [C2 practice](https://www.goethe.de/ins/de/de/prf/prf/gzc2/ueb.html).)

Third-party GitHub scrapes of these PDFs are not a licence.

### Open graded German file

DAFlex (CEFRLex) is a receptive lexicon: normalised frequencies of lemma+POS (TreeTagger/STTS) across **A1–C2**, estimated on textbooks and simplified readers. Download page: use for research or teaching; **CC BY-NC-SA 4.0**; “reference article forthcoming.” ([DAFlex](https://cental.uclouvain.be/cefrlex/daflex/); [download](https://cental.uclouvain.be/cefrlex/daflex/download/).) The analyser defines a word’s difficulty as **the first level at which the unit is observed**, and treats words missing from the resource as the most difficult because they were not seen in the L2 materials. ([Analyse](https://cental.uclouvain.be/cefrlex/daflex/analyse/).) That is a tool rule, not a claim that an unlisted token is above C2, and a word with mass at A1 and at C2 is not “above A2.” A 2021 project talk said the resource still needed manual checking and was not yet offered as a finished download; the download page now exists, still without a reference article. Entry counts from that talk are not repeated as current.

**Explicit gap.** No open, commercial-use lemma list assigns German gloss tokens to exclusive A1–C2 bands. Goethe A1–B1 lists are copyrighted exam inventories and stop at B1. *Profile deutsch* is not an open file. DAFlex is A1–C2 but non-commercial and distributional. Hiato’s DE B2–C2 packs are frequency-rank bands from wordhoard, not Goethe grades ([scripts/data/README.md](scripts/data/README.md)). A frequency rank cannot say “this gloss token is above band X” on the CEFR.

## 4. Spanish

### Plan curricular del Instituto Cervantes (PCIC)

The PCIC is the Spanish reference-level description: three volumes, A1–A2, B1–B2, C1–C2 (Instituto Cervantes / Biblioteca Nueva, 2006; electronic edition on the Centro Virtual Cervantes). Twelve inventories; lexical material sits mainly in *Nociones generales* and *Nociones específicas*. The specific-notions inventory is twenty themes. The introduction states that entries were chosen to **illustrate the kind** of lexical units a speaker should know at each level, **not as a closed list**; series of exponents are open; the same item can appear under two themes; selection favoured the central-northern Peninsular variety and should be adapted, including the level assignment, for other varieties; criteria were teacher judgement, frequency, and communicative usefulness, informed by ALTE Can Do and the CEFR domains. It “must be considered open” and “should not be understood as closed or final.” ([PCIC home](https://cvc.cervantes.es/ensenanza/biblioteca_ele/plan_curricular/default.htm); [introduction to specific notions](https://cvc.cervantes.es/ensenanza/biblioteca_ele/plan_curricular/niveles/09_nociones_especificas_introduccion.htm).)

Footer on those pages: “Centro Virtual Cervantes © Instituto Cervantes. Reservados todos los derechos.” Free to read is not a right to copy the inventories into a checker. Even with permission, **absence of a token is not “above band X”**, because the inventory says it is not exhaustive. Presence is an orientation that an exponent was placed at that level for Peninsular Spanish, not a unique sense-level.

### Open graded Spanish file

ELELex (CEFRLex) is receptive Spanish, **A1–C1 (no C2 on the download page)**, 14,290 items, FreeLing tags, textbook reading and simplified readers, **CC BY-NC-SA 4.0**. Reference article marked forthcoming. ([Download](https://cental.uclouvain.be/cefrlex/elelex/download/).) Same limits as DAFlex: non-commercial, frequencies rather than one exclusive band, no C2 column.

Hiato’s ES B2–C2 packs are wordhoard frequency bands, not Cervantes grades ([docs/adr/0029-b2-c2-sources-licenses.md](docs/adr/0029-b2-c2-sources-licenses.md)). No open commercial-use list can score a Spanish gloss token as at or below a CEFR band.

## 5. Portuguese

### Camões — Referencial Camões PLE

Camões, Instituto da Cooperação e da Língua, published the *Referencial Camões de Português Língua Estrangeira* (2017; ebook ISBN 978-989-8751-10-2) as descriptors for **A1–C2** plus inventories in three components: pragmatic (functions, text genres), notional (general and specific notions), and linguistic (grammar). The institute’s page says the ebook is free from the Biblioteca Digital Camões and that function, notion, and grammar inventories are interactive, in **pairs of levels**. The news text calls the document open and **not exhaustive**: inventories can be extended; further inventories (phonetics, orthography, cultural referents) were not included. The ebook says it is **not a dictionary**: notion inventories do not describe meaning or use, and users should consult mono- or bilingual dictionaries. The linguistic component in this referential is a **grammar** inventory, not a graded lemma list. Notion tables give example exponents by level (illustrative, in the functional-notional tradition of Waystage / Threshold / Vantage), not a census of Portuguese. ([Camões page](https://www.instituto-camoes.pt/activity/centro-virtual/referencial-camoes-ple-2); [ebook PDF](https://www.instituto-camoes.pt/images/REFERENCIAL_ebook.pdf); [2016 news](https://www.instituto-camoes.pt/sobre/comunicacao/noticias/referencial-camoes-de-portugues-lingua-estrangeira-2).) The edition’s title page, as carried with the ebook, reserves all rights to Camões. A free pedagogical download is not a licence to ship the exponents as a scoring lexicon, and the exponents could not score an arbitrary token anyway.

### CAPLE

CAPLE (Faculdade de Letras, Universidade de Lisboa, with Camões) certifies PLE at A1–C2: ACESSO A1, CIPLE A2, DEPLE B1, DIPLE B2, DAPLE C1, DUPLE C2 (plus school versions and TEJO). Exam pages describe domains, text types, speech acts, themes, and general and specific notions that the level is expected to need. They do **not** publish a downloadable A1–C2 lemma list. The resources page points at ALTE/Council of Europe documents, QuaREPE, and published preparation manuals, not an open word file. ([CAPLE mission](https://caple.letras.ulisboa.pt/pagina/1/caple); [DIPLE](https://caple.letras.ulisboa.pt/exame/4/diple); [recursos](https://caple.letras.ulisboa.pt/pagina/49/recursos).) Commercial “CIPLE word lists” on third-party sites were not treated as CAPLE publications.

### Portal da Língua Portuguesa and related inventories

The Portal (Vocabulário Ortográfico do Português, morphology, terminology, foreignisms) says its content is free to access. Nothing consulted there assigns CEFR bands to lemmas. ([Portal](http://www.portaldalinguaportuguesa.org/).)

The Academia das Ciências de Lisboa *Vocabulário Fundamental* is 2,522 words and 7,229 senses, classified into **three complexity levels** (Muito Fácil, Fácil, Claro) for **native** speakers, from the iRead4Skills lexicons. The Academy explicitly contrasts it with traditional lists for Portuguese as a non-native language. It is not an A1–C2 CEFR scale. ([Vocabulário Fundamental](https://dicionario.acad-ciencias.pt/vocabulario-fundamental/).)

No CEFRLex Portuguese resource is listed on the project’s current language index (French, Swedish, English, Dutch, Spanish, German). ([CEFRLex](https://cental.uclouvain.be/cefrlex/).)

**Hiato.** PT A1–C2 packs are CC-BY-SA frequency material; C-levels are frequency slices, **not CAPLE** ([scripts/data/README.md](scripts/data/README.md); [docs/adr/0009-portuguese-curated.md](docs/adr/0009-portuguese-curated.md); [docs/adr/0029-b2-c2-sources-licenses.md](docs/adr/0029-b2-c2-sources-licenses.md)). No open list found here can assert that a Portuguese gloss token is at or below a CAPLE or CEFR band.

## 6. Pedagogy — fixed core vs matched to the headword

Learner-dictionary defining vocabulary, in the sources below, is **(a) a fixed restricted core**, sometimes with the further demand that the defining words be easier than the word being explained. It is **not (b) a vocabulary matched to the headword’s CEFR band**.

Samuel Johnson, Preface to *A Dictionary of the English Language* (1755): “To explain, requires the use of terms less abstruse than that which is to be explained, and such terms cannot always be found.” The constraint is relative difficulty of the defining terms, not sameness of level. He also notes that many words cannot be explained by synonyms because the idea has only one name. ([Preface, para. 43, Lynch edition of the 1755 text](https://jacklynch.net/Texts/preface.html).)

LDOCE’s published rule is a **fixed list of about 2,000 common words for every definition**, including technical headwords, so that the definition stays easy. ([LDOCE About](https://www.ldoceonline.com/about.html); Pearson 6th-edition catalogue, link in section 2.) That list is not recomputed to the headword’s level. The CEFR did not exist when the 1978 defining vocabulary was introduced; nothing on the current LDOCE about-page ties the 2,000 words to a CEFR band of the headword.

OALD states the same fixed-core policy in CEFR-era wording: “Every definition in the Oxford Advanced Learner's Dictionary is written using words from the Oxford 3000.” The point of learning that list is that the user can then understand **the definition of every word** in the dictionary. ([About the Oxford 3000 and 5000](https://www.oxfordlearnersdictionaries.com/about/wordlists/oxford3000-5000).) The Oxford 3000 itself spans **A1–B2**, and it is used to define the whole dictionary, including headwords that are on the Oxford 5000 at C1 and headwords that are not on either list. The constraint is membership in a fixed core, not “only words at or below this headword’s band,” and not “words at the same band as the headword.”

No primary page read for this note describes a learner dictionary that writes the gloss in vocabulary **of the same CEFR band** as the headword. The product sentence “gloss and synonyms at the same level as the word so an A2 learner can understand the hint” is a different rule:

- Classical defining practice aims **below** the headword (less abstruse; a small core reused even for advanced headwords), on the assumption that the core is already known.
- A synonym or gloss token **at the same band** can be as hard as the headword. Johnson’s point about synonyms is the limiting case: a same-level synonym may not be an explanation at all.
- An A2 reader is not guaranteed to understand an A2 synonym of an A2 headword. The dictionary tradition would try to stay inside a smaller known core, not inside the whole of band A2.
- Sense still matters. EVP’s own design is that one form has several levels. A same-band synonym string can hide a harder sense.

The printed Longman appendix sentence that defining words are “easier than the words being defined” is widely copied from the book. This pass did not open a Pearson-hosted scan of that appendix, so it is not quoted as a fetched Pearson URL. The live Pearson/LDOCE statement actually retrieved is the fixed 2,000-word core.

## 7. Practical implication for a hangman pack

No checker built from the sources above can honestly assert, for every gloss token and synonym, “this word is at or below the headword’s CEFR band.” What it can and cannot say:

**English.** CEFR-J (A1–B2, citation; v1.5 “no charge” on the OLP README vs an unresolved commercial-consultation sentence on the v1.6 page) plus Octanove (C1–C2, CC-BY-SA, method not stated in the README) can support a **narrow** check: if the gloss token matches one listed headword+POS, report that tag and compare it with the headword’s tag. Do not treat a miss as “above the top band.” Do not collapse POS or senses. Do not embed EVP or the Oxford 3000/5000: EVP is not licensed for commercial use; Oxford lists are © OUP, core-only through C1, and the site terms restrict network redistribution. EFLLex is A1–C1 frequencies under CC BY-NC-SA. The Longman list can only support “this token is inside a fixed ~2,000-word defining core,” which is not a CEFR comparison and is not an open file.

**German.** A checker cannot assert a CEFR band for a gloss token from an open commercial-use list. Goethe A1–A2–B1 Wortlisten could answer only “this item is on the copyrighted exam list for level L,” and only with written permission; they do not cover B2–C2 and are not exclusive grades. *Profile deutsch* was not available as data. DAFlex can support a non-commercial research heuristic (“first level observed”), not a product assertion, and not “missing means above C2.” Frequency-rank packs already shipped cannot be redescribed as Goethe bands.

**Spanish.** PCIC can illustrate that an exponent was **placed** at a level in an open-ended Peninsular inventory. It cannot clear or fail an arbitrary token, and the text is all rights reserved. ELELex is A1–C1, non-commercial, distributional, no C2. Wordhoard ranks are not Cervantes levels.

**Portuguese.** Referencial Camões can show example notion exponents by paired levels. It is not a dictionary and not a closed list. CAPLE does not publish the missing lemma file. Portal da Língua Portuguesa and the Academy’s three-level native vocabulary do not score CEFR bands. Frequency slices are not CAPLE. Unknown stays unknown: there is no open A1–C2 Portuguese lemma grading to point at instead.

**Across languages.** Inflection, clitics, compounds, and multi-word glosses are outside a headword lookup unless the resource lists that form. A synonym chip fails the classical defining test twice when it is merely “same band”: it may be no easier than the headword, and its string may have another sense at a higher band. The only pattern these dictionaries actually document is a **fixed easier core used for all headwords**, which would answer a different question (“is the gloss inside the defining core?”) and, for English, still sits behind Pearson/OUP copyright.

## 8. Sources

- Council of Europe, CEFR level descriptions: https://www.coe.int/en/web/common-european-framework-reference-languages/level-descriptions
- Council of Europe, CEFR 2001 (vocabulary range): https://rm.coe.int/1680459f97.pdf
- CEFR-J resources (Wordlist 1.6, licence wording): http://www.cefr-j.org/download_eng
- Open Language Profiles, CEFR-J 1.5 and Octanove C1/C2: https://github.com/openlanguageprofiles/olp-en-cefrj
- Octanove CSV: https://github.com/openlanguageprofiles/olp-en-cefrj/blob/master/octanove-vocabulary-profile-c1c2-1.0.csv
- English Profile, EVP: https://englishprofile.org/?menu=english-vocabulary-profile
- English Profile, terms: https://englishprofile.org/?menu=evp-terms-of-use
- English Profile, licences (no commercial licensing of EVP/EGP data): https://englishprofile.org/?menu=contact-us
- Capel, *Completing the English Vocabulary Profile: C1 and C2 vocabulary*, English Profile Journal (2012), not fully read (Cambridge Core): https://www.cambridge.org/core/journals/english-profile-journal/article/completing-the-english-vocabulary-profile-c1-and-c2-vocabulary/418955FC7ED2455E98A499BC40C2C816
- Cambridge A2 Key vocabulary list (© UCLES 2025): https://www.cambridgeenglish.org/images/506886-a2-key-2020-vocabulary-list.pdf
- Cambridge B1 Preliminary vocabulary list (© CUPA 2025): https://www.cambridgeenglish.org/Images/506887-b1-preliminary-vocabulary-list.pdf
- Oxford 3000 and 5000: https://www.oxfordlearnersdictionaries.com/about/wordlists/oxford3000-5000
- Oxford 3000 PDF (© OUP): https://www.oxfordlearnersdictionaries.com/external/pdf/wordlists/oxford-3000-5000/The_Oxford_3000.pdf
- Oxford Learner’s Dictionaries terms (25 April 2018): https://www.oxfordlearnersdictionaries.com/terms-and-conditions
- Oxford Learner’s Dictionaries FAQ (offline PDF for study): https://www.oxfordlearnersdictionaries.com/faq/
- OUP ELT on the revised Oxford 3000 as a core, not a complete vocabulary: https://teachingenglishwithoxford.oup.com/2019/11/11/oxford-3000️-eltoc/
- LDOCE Online, about (2,000-word definitions): https://www.ldoceonline.com/about.html
- Pearson, LDOCE 6th edition catalogue: https://www.pearsonelt.es/catalogue/Dictionaries/Longman-Dictionary-of-Contemporary-English-6th-edition.html
- Samuel Johnson, Preface (1755), Jack Lynch edition: https://jacklynch.net/Texts/preface.html
- CEFRLex portal: https://cental.uclouvain.be/cefrlex/
- EFLLex: https://cental.uclouvain.be/cefrlex/efllex/ and https://cental.uclouvain.be/cefrlex/efllex/download/
- DAFlex: https://cental.uclouvain.be/cefrlex/daflex/ , https://cental.uclouvain.be/cefrlex/daflex/download/ , https://cental.uclouvain.be/cefrlex/daflex/analyse/
- ELELex download: https://cental.uclouvain.be/cefrlex/elelex/download/
- Goethe-Zertifikat A1 Fit in Deutsch 1 Wortliste: https://www.goethe.de/pro/relaunch/prf/en/Goethe-Zertifikat_A1_Fit1_Wortliste.pdf
- Goethe-Zertifikat A1 Start Deutsch 1 Prüfungsziele: https://www.goethe.de/pro/relaunch/prf/tr/Pruefungsziele_Testbeschreibung_A1_SD1.pdf
- Goethe-Zertifikat A2 Wortliste: https://www.goethe.de/pro/relaunch/prf/de/Goethe-Zertifikat_A2_Wortliste.pdf
- Goethe-Zertifikat B1 Wortliste: https://www.goethe.de/pro/relaunch/prf/zh/Goethe-Zertifikat_B1_Wortliste.pdf
- Goethe-Zertifikat B2 Modellsatz (no Wortliste in this file): https://www.goethe.de/pro/relaunch/prf/materialien/B2/b2_modellsatz_erwachsene.pdf
- Goethe-Zertifikat C2 practice materials: https://www.goethe.de/ins/de/de/prf/prf/gzc2/ueb.html
- *Profile deutsch* contents extract (Langenscheidt): https://external.dandelon.com/download/attachments/dandelon/ids/CH00111115C1172E53325C1257AE1004CDD1D.pdf
- Instituto Cervantes, PCIC: https://cvc.cervantes.es/ensenanza/biblioteca_ele/plan_curricular/default.htm
- PCIC, nociones específicas, introducción: https://cvc.cervantes.es/ensenanza/biblioteca_ele/plan_curricular/niveles/09_nociones_especificas_introduccion.htm
- Camões, Referencial Camões PLE: https://www.instituto-camoes.pt/activity/centro-virtual/referencial-camoes-ple-2
- Referencial ebook: https://www.instituto-camoes.pt/images/REFERENCIAL_ebook.pdf
- Camões news (2016) on the referential: https://www.instituto-camoes.pt/sobre/comunicacao/noticias/referencial-camoes-de-portugues-lingua-estrangeira-2
- CAPLE: https://caple.letras.ulisboa.pt/pagina/1/caple , https://caple.letras.ulisboa.pt/exame/4/diple , https://caple.letras.ulisboa.pt/pagina/49/recursos
- Portal da Língua Portuguesa: http://www.portaldalinguaportuguesa.org/
- Academia das Ciências de Lisboa, Vocabulário Fundamental: https://dicionario.acad-ciencias.pt/vocabulario-fundamental/
- Repo: [scripts/data/README.md](scripts/data/README.md), [docs/adr/0009-portuguese-curated.md](docs/adr/0009-portuguese-curated.md), [docs/adr/0029-b2-c2-sources-licenses.md](docs/adr/0029-b2-c2-sources-licenses.md)
