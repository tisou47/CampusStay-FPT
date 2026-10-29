| ID | Entity | From → To | Trigger | FR | Test | Result |
|---|---|---|---|---|---|---|
| TC-ST-01 | Application | (new) → Awaiting Deposit | Student submits the wizard | FR-APP-02 | TC-APP-002 | Passed |
| TC-ST-02 | Application | Awaiting Deposit → Awaiting Roommate | Deposit confirmed, invited roommate not ready | FR-APP-03 | TC-APP-005 | Passed |
| TC-ST-03 | Application | Awaiting Roommate → Submitted | Roommate's Deposit confirmed, or the roommate declines | FR-APP-03 | TC-APP-006 | Passed |
| TC-ST-04 | Application | Awaiting Deposit → Submitted | Manager confirms the Deposit claim | FR-BIL-03 | TC-BIL-032 | Passed |
| TC-ST-05 | Application | Awaiting Deposit → Expired | Deposit window ends without a claim | FR-APP-04 | TC-APP-008 | Passed |
| TC-ST-06 | Application | Awaiting Deposit → Expired | Second claim rejected | FR-BIL-03 | TC-BIL-033 | Passed |
| TC-ST-07 | Application | Submitted → Under Review | Manager opens the review | FR-APP-05 | TC-APP-010 | Passed |
| TC-ST-08 | Application | Submitted → Approved | Manager approves (bulk) | FR-APP-05 | TC-ASG-010 | Passed |
| TC-ST-09 | Application | Under Review → Approved | Manager approves after opening the review | FR-APP-05 | Manual | Not run |
| TC-ST-10 | Application | Under Review → Rejected | Manager rejects with a note | FR-APP-05 | TC-APP-010 | Passed |
| TC-ST-11 | Application | Submitted → Rejected | Manager rejects from the queue without opening it | FR-APP-05 | Manual | Not run |
| TC-ST-12 | Application | Live state → Cancelled | Student cancels before the cancel deadline | FR-APP-04 | TC-APP-007 | Passed |
| TC-ST-13 | Application | Live state → Rejected | Student not enrolled (leavers list) | FR-AUTH-08 | TC-AUTH-055 | Passed |
| TC-ST-14 | Application | Approved → Waitlisted | No matching Bed left in the assignment | FR-ASG-03 | TC-ASG-010 | Passed |
| TC-ST-15 | Application | Approved → Allocated | Assignment approved for the Block | FR-ASG-03 | TC-ASG-010 | Passed |
| TC-ST-16 | Application | Waitlisted → Allocated | Round-2 offer accepted | FR-APP-07 | TC-APP-020 | Passed |
| TC-ST-17 | Application | Waitlisted → Cancelled | Round-2 offer declined or expired | FR-APP-07 | TC-APP-021 | Passed |
| TC-ST-18 | Application | Waitlisted → Cancelled | Student withdraws from the waitlist (whole Deposit refunded) | FR-APP-07 | TC-APP-025 | Passed |
| TC-ST-19 | Application | Waitlisted → Cancelled | Check-in starts with no open offer (waitlist ends, Deposit refunded) | FR-APP-07 | TC-APP-026 | Passed |
| TC-ST-20 | Application | Allocated → Forfeited | Balance not paid by its deadline | FR-ASG-11 | TC-ASG-033 | Passed |
| TC-ST-21 | Application | Allocated → Rejected | Not enrolled before moving in | FR-AUTH-08 | Manual | Not run |
| TC-ST-22 | Allocation | (new) → Assigned – unpaid | Assignment approved | FR-ASG-03 | TC-ASG-010 | Passed |
| TC-ST-23 | Allocation | Assigned – unpaid → Paid – waiting for the code | Balance claim confirmed | FR-BIL-03 | TC-ASG-032 | Passed |
| TC-ST-24 | Allocation | Assigned – unpaid → Cancelled | Balance past its deadline (forfeit) | FR-ASG-11 | TC-ASG-033 | Passed |
| TC-ST-25 | Allocation | Assigned – unpaid → Cancelled | Balance claim rejected twice | FR-BIL-03 | TC-ASG-034 | Passed |
| TC-ST-26 | Allocation | Paid – waiting for the code → Cancelled | Not enrolled before moving in | FR-AUTH-08 | Manual | Not run |
| TC-ST-27 | Allocation | Paid – waiting for the code → Resident | Check-in start reached and the Room code confirmed (job) | FR-ASG-04 | TC-INV-023 | Passed |
| TC-ST-28 | Allocation | Paid – waiting for the code → Resident | Checked in at the desk | FR-ASG-04 | TC-ASG-020 | Passed |
| TC-ST-29 | Allocation | Resident → Ended | Checked out at the desk | FR-ASG-06 | TC-ASG-022 | Passed |
| TC-ST-30 | Allocation | Resident → Ended | Moved to another Bed | FR-ASG-10 | TC-ASG-043 | Passed |
| TC-ST-31 | Allocation | Resident → Ended | The next Term starts for a continuing resident | FR-ASG-10 | TC-ASG-042 | Passed |
| TC-ST-32 | Next-Term Allocation | (new) → Continuing | M2 opens the window, Terms left in the Stay | FR-ASG-07 | TC-ASG-038 | Passed |
| TC-ST-33 | Next-Term Allocation | (new) → Awaiting extension | M2 opens the window, last Term of the Stay | FR-ASG-07 | TC-ASG-038 | Passed |
| TC-ST-34 | Next-Term Allocation | Awaiting extension → Continuing | Extension approved | FR-REQ-04 | TC-REQ-019 | Passed |
| TC-ST-35 | Next-Term Allocation | Awaiting extension → Cancelled | Not extended by M3 | FR-ASG-07 | TC-ASG-039 | Passed |
| TC-ST-36 | Next-Term Allocation | Continuing → Continuing (other Bed) | Room change or swap approved | FR-REQ-01, 02 | TC-REQ-002 | Passed |
| TC-ST-37 | Next-Term Allocation | Continuing → Cancelled | End of stay or not enrolled | FR-REQ-04, FR-AUTH-08 | TC-AUTH-054 | Passed |
| TC-ST-38 | Next-Term Allocation | Continuing → Cancelled | Next-Term fee unpaid at M7 | FR-ASG-08 | TC-ASG-041 | Passed |
| TC-ST-39 | Next-Term Allocation | Continuing → Resident | Fee paid and the new Term starts | FR-ASG-08 | TC-ASG-042 | Passed |
| TC-ST-40 | Invoice | (new) → Unpaid | Issued (Deposit, Balance, next-Term fee, Utility) | FR-APP-02, FR-BIL-04 | TC-BIL-026 | Passed |
| TC-ST-41 | Invoice | Unpaid → Awaiting confirmation | Student claims the transfer | FR-BIL-02 | TC-BIL-032 | Passed |
| TC-ST-42 | Invoice | Overdue → Awaiting confirmation | Student claims an overdue debt | FR-BIL-02 | TC-BIL-035 | Passed |
| TC-ST-43 | Invoice | Awaiting confirmation → Paid | Manager confirms the claim | FR-BIL-03 | TC-BIL-011 | Passed |
| TC-ST-44 | Invoice | Unpaid → Paid | Manager confirms a transfer the student did not claim | FR-BIL-03 | TC-BIL-011 | Passed |
| TC-ST-45 | Invoice | Overdue → Paid | Manager confirms an overdue debt the student did not claim | FR-BIL-03 | Manual | Not run |
| TC-ST-46 | Invoice | Awaiting confirmation → Unpaid | Manager rejects the claim, time left continues | FR-BIL-03 | TC-BIL-033 | Passed |
| TC-ST-47 | Invoice | Awaiting confirmation → Overdue | Rejected claim of a debt already past due | FR-BIL-03 | TC-BIL-035 | Passed |
| TC-ST-48 | Invoice | Awaiting confirmation → Void | Second rejection of a Deposit or Balance claim | FR-BIL-03 | TC-ASG-034 | Passed |
| TC-ST-49 | Invoice | Unpaid → Overdue | Due date passes (Utility, charges) | FR-BIL-05 | TC-BIL-020 | Passed |
| TC-ST-50 | Invoice | Unpaid → Void | Forfeit or cancelled Application | FR-ASG-11, FR-APP-04 | TC-APP-007 | Passed |
| TC-ST-51 | Invoice | Overdue → Void | Overdue Utility settled from the Utility Deposit at check-out | FR-ASG-06 | Manual | Not run |
| TC-ST-52 | Payment claim | (new) → Claimed | Student presses "I have transferred" | FR-BIL-02 | TC-BIL-032 | Passed |
| TC-ST-53 | Payment claim | Claimed → Confirmed | Manager confirms | FR-BIL-03 | TC-BIL-011 | Passed |
| TC-ST-54 | Payment claim | (new) → Confirmed | Manager confirms a transfer the student did not claim (claim in the Manager's name) | FR-BIL-03 | TC-BIL-011 | Passed |
| TC-ST-55 | Payment claim | Claimed → Rejected | Manager rejects with a reason | FR-BIL-03 | TC-BIL-033 | Passed |
| TC-ST-56 | Maintenance Request | (new) → Submitted | Resident reports a problem | FR-MNT-01 | TC-MNT-001 | Passed |
| TC-ST-57 | Maintenance Request | Submitted → Assigned | Routing rule or Staff assigns, deadline set | FR-REQ-06 | TC-REQ-014 | Passed |
| TC-ST-58 | Maintenance Request | Assigned → Submitted | Assignee removed | FR-MNT-02 | Manual | Not run |
| TC-ST-59 | Maintenance Request | Assigned → In Progress | Staff starts the work | FR-MNT-02 | TC-MNT-002 | Passed |
| TC-ST-60 | Maintenance Request | In Progress → Resolved | Staff marks it fixed | FR-MNT-02 | TC-MNT-002 | Passed |
| TC-ST-61 | Maintenance Request | Assigned → Resolved | Staff fixes it without starting it first | FR-MNT-02 | Manual | Not run |
| TC-ST-62 | Maintenance Request | Resolved → Closed | Reporter confirms the fix | FR-MNT-02 | TC-MNT-002 | Passed |
| TC-ST-63 | Maintenance Request | Resolved → Assigned | Reporter reopens (once) | FR-MNT-02 | TC-MNT-002 | Passed |
| TC-ST-64 | Maintenance Request | Submitted → Closed | Staff closes a duplicate | FR-MNT-02 | Manual | Not run |
| TC-ST-65 | Maintenance Request | Assigned → Closed | Staff closes it | FR-MNT-02 | Manual | Not run |
| TC-ST-66 | Maintenance Request | In Progress → Closed | Staff closes it | FR-MNT-02 | Manual | Not run |
| TC-ST-67 | Invoice | Paid / Void → (refused) | Claim a Paid or Void Invoice, or a Deposit past its deadline | FR-BIL-02 | TC-BIL-034 | Passed |
| TC-ST-68 | Invoice | Void → (refused) | Confirm a Void Invoice | FR-BIL-03 | TC-BIL-012 | Passed |
| TC-ST-69 | Invoice | Paid → (refused) | Confirm an Invoice a second time | FR-BIL-03 | TC-BIL-011 | Passed |
| TC-ST-70 | Next-Term Allocation | Continuing (fees issued) → (refused) | Staff move a next-Term Bed after the fees are issued | FR-ASG-10 | TC-ASG-044 | Passed |
