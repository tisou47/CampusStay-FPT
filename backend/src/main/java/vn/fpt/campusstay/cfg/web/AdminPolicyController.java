package vn.fpt.campusstay.cfg.web;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.cfg.MatchingPreviewer;
import vn.fpt.campusstay.cfg.internal.AdminPolicyService;
import vn.fpt.campusstay.cfg.internal.MatchingService;
import vn.fpt.campusstay.cfg.internal.SystemParameterService;

/**
 * Admin configuration screens that load and save one document each
 * ({@code GET|PUT}, the PUT body has the GET shape): fees, eligibility,
 * matching criteria and system parameters. The services validate the values.
 */
@RestController
@RequestMapping("/admin")
class AdminPolicyController {

    private final AdminPolicyService policies;
    private final MatchingService matching;
    private final SystemParameterService parameters;

    AdminPolicyController(AdminPolicyService policies, MatchingService matching, SystemParameterService parameters) {
        this.policies = policies;
        this.matching = matching;
        this.parameters = parameters;
    }

    @GetMapping("/fees")
    AdminPolicyService.Fees fees() {
        return policies.fees();
    }

    @PutMapping("/fees")
    AdminPolicyService.Fees saveFees(@RequestBody AdminPolicyService.Fees body) {
        return policies.saveFees(body);
    }

    @GetMapping("/eligibility")
    AdminPolicyService.Eligibility eligibility() {
        return policies.eligibility();
    }

    @PutMapping("/eligibility")
    AdminPolicyService.Eligibility saveEligibility(@RequestBody AdminPolicyService.Eligibility body) {
        return policies.saveEligibility(body);
    }

    @GetMapping("/matching")
    MatchingService.Matching matching() {
        return matching.get();
    }

    @PutMapping("/matching")
    MatchingService.Saved saveMatching(@RequestBody MatchingService.Matching body) {
        return matching.save(body);
    }

    @PostMapping("/matching/preview")
    MatchingPreviewer.Preview previewMatching(@RequestBody MatchingService.Matching body) {
        return matching.preview(body);
    }

    @GetMapping("/system-parameters")
    SystemParameterService.SystemParameters systemParameters() {
        return parameters.get();
    }

    @PutMapping("/system-parameters")
    SystemParameterService.SystemParameters saveSystemParameters(
            @RequestBody SystemParameterService.SystemParameters body) {
        return parameters.save(body);
    }
}
