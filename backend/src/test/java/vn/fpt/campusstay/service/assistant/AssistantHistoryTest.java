package vn.fpt.campusstay.service.assistant;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import vn.fpt.campusstay.service.assistant.AssistantService.Turn;

/** TC-AST-013 (BE-PLT-03): the history sent to the model is capped; the oldest turns go first, the question stays. */
class AssistantHistoryTest {

    private static Turn turn(String role, int chars) {
        return new Turn(role, "x".repeat(chars), null);
    }

    @Test
    void dropsTheOldestTurnsAboveTheCap() {
        List<Turn> turns = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            turns.add(turn(i % 2 == 0 ? "user" : "assistant", 1500));
        }
        List<Turn> kept = AssistantService.history(turns);
        assertThat(kept.stream().mapToInt(t -> t.content().length()).sum()).isLessThanOrEqualTo(6000);
        assertThat(kept).hasSize(4).last().isSameAs(turns.getLast());
        assertThat(kept.getFirst()).isSameAs(turns.get(2));
    }

    @Test
    void keepsAShortConversationAndAtMostTwelveTurns() {
        List<Turn> turns = new ArrayList<>();
        for (int i = 0; i < 15; i++) {
            turns.add(turn(i % 2 == 0 ? "user" : "assistant", 10));
        }
        assertThat(AssistantService.history(turns)).hasSize(12).last().isSameAs(turns.getLast());
        assertThat(AssistantService.history(turns.subList(14, 15))).hasSize(1);
    }

    @Test
    void alwaysKeepsTheQuestion() {
        assertThat(AssistantService.history(List.of(turn("user", 9000)))).hasSize(1);
    }
}
