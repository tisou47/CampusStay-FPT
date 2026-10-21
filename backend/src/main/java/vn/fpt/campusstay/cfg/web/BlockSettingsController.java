package vn.fpt.campusstay.cfg.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.cfg.internal.BlockSettingsService;

/** Block Manager › Block settings: desk, visitor and quiet hours and the house rules. */
@RestController
class BlockSettingsController {

    record SaveRequest(@Size(max = 20) String block, @Size(max = 5) String deskOpens, @Size(max = 5) String deskCloses,
            @Size(max = 5) String visitFrom, @Size(max = 5) String visitUntil, @Size(max = 5) String quiet,
            @Size(max = 4000, message = "Keep the house rules under 4,000 characters.") String houseRules) {
    }

    private final BlockSettingsService settings;

    BlockSettingsController(BlockSettingsService settings) {
        this.settings = settings;
    }

    @GetMapping("/block-settings")
    BlockSettingsService.View get(@RequestParam(required = false) String block) {
        return settings.get(block);
    }

    @PutMapping("/block-settings")
    BlockSettingsService.View save(@Valid @RequestBody SaveRequest body) {
        return settings.save(new BlockSettingsService.SaveCommand(body.block(), body.deskOpens(), body.deskCloses(),
                body.visitFrom(), body.visitUntil(), body.quiet(), body.houseRules()));
    }
}
