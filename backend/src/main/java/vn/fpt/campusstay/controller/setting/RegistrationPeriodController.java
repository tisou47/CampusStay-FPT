package vn.fpt.campusstay.controller.setting;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.service.setting.RegistrationPeriodService;

/**
 * {@code /registration-periods} — every signed-in role (A-29, spec §6.5): the registration period card of the
 * dormitory board and the details of a published Term.
 */
@RestController
@RequestMapping("/registration-periods")
class RegistrationPeriodController {

    private final RegistrationPeriodService periods;

    RegistrationPeriodController(RegistrationPeriodService periods) {
        this.periods = periods;
    }

    @GetMapping("/current")
    RegistrationPeriodService.Current current() {
        return periods.current();
    }

    @GetMapping("/{termId}")
    RegistrationPeriodService.Details details(@PathVariable long termId) {
        return periods.details(termId);
    }
}
