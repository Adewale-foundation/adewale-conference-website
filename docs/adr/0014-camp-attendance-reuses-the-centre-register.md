# Camp Attendance Reuses The Centre Register

Camp is marked the way a zonal hall is (ADR-0011): an admin registers helpers by email against a venue, and they sign in at `/attendance` with no account. The camp becomes one more `exam_centres` row with `kind = 'camp'`, so `centre_leads`, the signed cookie, the staff tab and the staff email all carry over. The register is per **camp day** in Lagos time, in `camp_attendance` (latest mark) and `camp_attendance_events` (append-only), with its own switch, `camp_settings.attendance_open`.

## Considered options

- **Camp as a centre, separate tables (chosen).** Zonal attendance is keyed on a paper exam and a candidate row, and camp has neither: no exam, and educators who exist only as JSON on `camp_confirmations`. Separate tables leave the zonal register untouched. The cost is that every zonal read of `exam_centres` must now say `kind = 'exam'`. If one doesn't, `resolveCentreId`'s town rung can match the camp's town.
- **Admins only, marking in the portal.** Built first and dropped. The admin team is not the only people at camp, and the staff model already existed.
- **Generalise `paper_exam_attendance` to any "session".** Rejected so close to camp: it means migrating the live zonal data, plus the replacement transfer in ADR-0013 that moves it.

## Notes

- **A person is a key, not an FK:** `student:<id>` or `educator:<registration>:primary|second`. The second educator is listed unless an admin declined them, matching the attendee export. `person_name` is snapshotted because a school can rewrite its educator JSON.
- **Staff mark today only.** The register binds the day it rendered, and a tap after Lagos midnight on yesterday's page is refused rather than filed under the wrong day. Before camp starts, the register shows day one; after it ends, the last day. Admins correct any day from the portal.
- **No walk-ins and no allocation:** there is one venue, and the list is every attending school's active students and educators.
