package vn.fpt.campusstay.controller.auth;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.service.auth.StaffAccountService;

/** Manager › Staff accounts: create, edit, disable Staff and choose their Blocks (spec §3; contract change A-21). */
@RestController
@RequestMapping("/staff-accounts")
class StaffAccountController {

    record CreateRequest(@Size(max = 150, message = "Use at most 150 characters.") String name,
            @Size(max = 254) String email, @Size(max = 100, message = "Use at most 100 characters.") String title,
            @Size(max = 20) List<@Size(max = 20) String> blocks) {
    }

    record UpdateRequest(@Size(max = 150, message = "Use at most 150 characters.") String name,
            @Size(max = 100, message = "Use at most 100 characters.") String title,
            @Size(max = 20) List<@Size(max = 20) String> blocks, @Size(max = 20) String status) {
    }

    private final StaffAccountService staff;

    StaffAccountController(StaffAccountService staff) {
        this.staff = staff;
    }

    @GetMapping
    StaffAccountService.Page list(@RequestParam(required = false) String q, @RequestParam(required = false) String block,
            @RequestParam(required = false) String status, @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize) {
        return staff.list(q, block, status, PageQuery.of(page, pageSize));
    }

    @PostMapping
    StaffAccountService.Created create(@Valid @RequestBody CreateRequest body) {
        return staff.create(new StaffAccountService.Create(body.name(), body.email(), body.title(), body.blocks()));
    }

    @PutMapping("/{id}")
    StaffAccountService.Item update(@PathVariable String id, @Valid @RequestBody UpdateRequest body) {
        return staff.update(id, new StaffAccountService.Update(body.name(), body.title(), body.blocks(), body.status()));
    }

    @PostMapping("/{id}/invitation")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void resendInvitation(@PathVariable String id) {
        staff.resendInvitation(id);
    }
}
