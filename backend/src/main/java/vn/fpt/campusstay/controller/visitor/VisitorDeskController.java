package vn.fpt.campusstay.controller.visitor;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.service.visitor.VisitorDeskService;

/** The Family Day visitor desk (Staff of the Block, Managers): ADR-29, contract A-69. */
@RestController
class VisitorDeskController {

    /** The pass is sent in the body, never in the URL, so it stays out of access logs. */
    record VerifyRequest(@Size(max = 200) String token) {
    }

    record CheckInRequest(Boolean identityChecked) {
    }

    record CheckOutRequest(@Size(max = 500, message = "Keep the note under 500 characters.") String note) {
    }

    private final VisitorDeskService desk;

    VisitorDeskController(VisitorDeskService desk) {
        this.desk = desk;
    }

    @GetMapping("/family-days/{id}/visitors")
    VisitorDeskService.VisitorPage visitors(@PathVariable String id, @RequestParam(required = false) String slotId,
            @RequestParam(required = false) String status, @RequestParam(required = false) String q,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer pageSize) {
        return desk.visitors(id, slotId, status, q, PageQuery.of(page, pageSize));
    }

    /** Reminds every student whose guests are still inside after their time slot (contract A-70). */
    @PostMapping("/family-days/{id}/overdue-reminders")
    VisitorDeskService.ReminderResult remindOverdue(@PathVariable String id) {
        return desk.remindOverdue(id);
    }

    @PostMapping("/family-day-visitors/verify")
    VisitorDeskService.PassCheck verify(@Valid @RequestBody VerifyRequest body) {
        return desk.verify(body.token());
    }

    @PostMapping("/family-day-visitors/{id}/check-in")
    VisitorDeskService.VisitorItem checkIn(@PathVariable String id, @RequestBody CheckInRequest body) {
        return desk.checkIn(id, body.identityChecked());
    }

    @PostMapping("/family-day-visitors/{id}/check-out")
    VisitorDeskService.VisitorItem checkOut(@PathVariable String id,
            @Valid @RequestBody(required = false) CheckOutRequest body) {
        return desk.checkOut(id, body == null ? null : body.note());
    }
}
