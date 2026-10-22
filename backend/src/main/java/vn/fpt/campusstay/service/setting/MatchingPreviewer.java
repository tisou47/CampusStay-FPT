package vn.fpt.campusstay.service.setting;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * Port for Admin › Matching Criteria › Run dry run, implemented by the
 * assignment engine (Assignment, slice S3): places the approved Applications of the
 * current Term with unsaved settings and allocates nothing. Until an
 * implementation exists, Settings answers that there is nobody to place.
 */
public interface MatchingPreviewer {

    /**
     * @param order   criterion keys in processing order
     * @param weights weight key → fraction (only switched-on weights; they total 1)
     * @param boost   multiplier for matching Roommate preferences (1 = no boost)
     */
    record Settings(List<String> order, Map<String, BigDecimal> weights, BigDecimal boost) {
    }

    /**
     * @param averageFit    0–100, null when nobody was placed
     * @param sameMajorRate fraction of Rooms with 2+ students of the same major, null when nobody was placed
     * @param source        one sentence on the input used, shown under the preview
     */
    record Preview(Integer averageFit, BigDecimal sameMajorRate, int toRound2, String source) {
    }

    Preview preview(Settings settings);
}
