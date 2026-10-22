package vn.fpt.campusstay.common.audit;

/** Who performed an action. {@code id == null} means a scheduled system job. */
public record Actor(Long id, String label) {

    public static final Actor SYSTEM = new Actor(null, "System");

    public static Actor anonymous(String label) {
        return new Actor(null, label);
    }
}
