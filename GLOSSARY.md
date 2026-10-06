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
