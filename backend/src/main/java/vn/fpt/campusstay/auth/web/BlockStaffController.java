package vn.fpt.campusstay.auth.web;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.auth.internal.BlockStaffService;

/** Block Manager › Staff: handles and duty of the Block's staff, and requests for new accounts. */
@RestController
class BlockStaffController {

    record UpdateRequest(@Size(max = 20) List<@Size(max = 100) String> handles, Boolean onDuty) {
    }

    /** {@code block} may be left out when the Manager has one Block. */
    record AccountRequest(@Size(max = 150, message = "Use at most 150 characters.") String name,
            @Size(max = 254) String email, @Size(max = 20) String role, @Size(max = 20) String block) {
    }

    private final BlockStaffService staff;

    BlockStaffController(BlockStaffService staff) {
        this.staff = staff;
    }

    @GetMapping("/block-staff")
    BlockStaffService.Page list(@RequestParam(required = false) String block) {
        return staff.list(block);
    }

    @PutMapping("/block-staff/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void update(@PathVariable String id, @Valid @RequestBody UpdateRequest body) {
        staff.update(id, body.handles(), body.onDuty());
    }

    @PostMapping("/staff-account-requests")
    BlockStaffService.Created requestAccount(@Valid @RequestBody AccountRequest body) {
        return staff.requestAccount(body.name(), body.email(), body.role(), body.block());
    }
}
