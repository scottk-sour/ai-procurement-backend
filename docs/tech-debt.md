# Tech debt log

Known issues worth fixing, not urgent enough to block feature work. Append
new entries below. Keep the format consistent so the file stays greppable.

---

## Fix or delete tests/unit/quoteAcceptanceLogic.test.js

- **Status:** open
- **Priority:** low (does not block any functionality)
- **Details:** Test file imports `services/notificationService.js` which no
  longer exists in the repo. Likely deleted in an earlier refactor. Test has
  been failing to import since commit `3780c28`. Either restore the service
  as a stub or delete the test file. Pre-existing on main — not introduced
  by any recent PR.
