package vn.fpt.campusstay.req;

/**
 * The Block Manager handed an escalated request to a staff member (NTF: "Escalated request assigned to you").
 *
 * @param code the request's code ({@code MR-000321}, {@code RC-SP27-000012})
 * @param link the staff screen of the request
 */
public record EscalationAssigned(long escalationId, long assigneeId, String code, String title, String link) {
}
