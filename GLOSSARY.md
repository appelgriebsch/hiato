# Hiato

Hiato is a mobile web app where a learner plays a daily word in one language and one CEFR level.

## Release

**Staging**:
The site used to check a commit before learners receive it.
_Avoid_: Preview, when that word means Staging

**Production**:
The site learners use.
_Avoid_: Prod, live

**Promote**:
The decision that a staged commit becomes Production.
_Avoid_: Rollout, release, ship

**Deny**:
The decision that a staged commit does not become Production.
_Avoid_: Rollback. A rollback returns Production to an earlier Production deployment.

## Product

**Daily**:
Today’s word for one language and CEFR level; it resets at local midnight.

**Practice**:
Rounds that never use today’s Daily word and never change the streak.
_Avoid_: endless

**Pocket**:
Up to five missed Daily words per language and level, kept on the device for a retry.

**Save / Retry / Remove**:
“Practice this word” adds a lost Daily word to the Pocket; Retry plays a Pocket word again; Remove takes it out.

**EndCard**:
The card after a round, with the word, its gloss, synonym chips, and speech.

**Lives**:
Six misses allowed in a round. Lives left is what remains (shown in Play and Stats); lives used = 6 − lives left.

**Streak**:
Consecutive Daily wins for one language and level.

**Pack**:
The word list for one language and one CEFR level.

**CEFR level**:
A1 to C2, chosen with the language on Choose language & level.

**Level check**:
The optional six-question check on Choose language & level that suggests a CEFR level from one Pack word per level. It stores nothing and never changes the Streak.

**Gloss**:
The meaning of the word, always written in the Pack language.

**Synonym chips**:
Same-language synonyms shown as hints, up to three.

**Hint strip**:
Learner hints under the puzzle during the round.

**Accent hint**:
The button that reveals one accent after two accent or base-letter misses while a diacritic remains.

**Share card**:
The spoiler-free result image and link; the answer never appears on the card.

**Offline ready**:
The chip shown when the selected Pack is cached for offline play.

**Streak freeze**:
A guest-local pass, capped at 2: a Daily win that lands the streak on a multiple of 7 earns one, and one missed day spends one and sets lastWinDate to yesterday.

**Due**:
A Pocket word whose review day has come (`dueAt`): the ladder is +1 / +3 / +7 local calendar days (clock time kept), due-first in the sheet with a Due badge, on Home as “Pocket (n · k due)”, and on the Practice EndCard as an offer to review.

**Stats**:
Results history per language and level: the last 50 rounds kept on the device for that slot. It shows win rate, average lives left on wins, and the lives-left grid; Pocket rounds are excluded.

**Lost**:
A recorded round that was not won. It covers both EndCard outcomes “Out of lives” and “Word revealed” (Practice Reveal).
