package vn.fpt.campusstay.service.setting;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * Port for Admin › Rules › Roommate matching › Preview, implemented by the assignment engine (ASG): places the
 * approved Applications of the Term open for registration (else the current Term) twice, with the draft and with the
 * rules in use, and allocates nothing (spec §6.17). Until an implementation exists, Settings answers that there is
 * nobody to place.
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
     * One run.
     *
     * @param averageFit      0–100, null when nobody was placed
     * @param priorityPlaced  students of a priority group who got a Bed
     * @param priorityStudents students of a priority group among the Applications
     */
    record Result(int placed, Integer averageFit, int priorityPlaced, int priorityStudents) {
    }

    /** What the occupants of the example Room share: {@code sharing} of them have {@code value}. */
    record Attribute(String key, String label, String value, int sharing) {
    }

    /** One Room of the draft run, to explain its fit. */
    record ExampleRoom(String room, int students, Integer fit, List<Attribute> attributes) {
    }

    /**
     * @param averageFit    the draft's, 0–100, null when nobody was placed
     * @param sameMajorRate fraction of Rooms with 2+ students of the same major, null when nobody was placed
     * @param source        one sentence on the input used, shown under the preview
     * @param moved         students the draft places in another Bed than the rules in use (or not at all)
     */
    record Preview(Integer averageFit, BigDecimal sameMajorRate, int toRound2, String source, Result inUse,
            Result draft, Integer moved, Integer students, ExampleRoom example) {
    }

    Preview preview(Settings draft, Settings inUse);
}
