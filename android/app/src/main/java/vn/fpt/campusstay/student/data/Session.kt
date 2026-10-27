package vn.fpt.campusstay.student.data

import android.content.Context
import org.json.JSONObject

/**
 * The signed-in student: the token and the `user` of `POST /auth/sign-in` or `/auth/google`.
 *
 * @param passwordSet false for a Google sign-up that has not set its CampusStay password yet (spec §6.1)
 * @param verification `Verified`, `Pending verification` or `Profile needed`
 */
data class Session(val token: String, val name: String, val email: String, val studentCode: String?,
    val passwordSet: Boolean, val verification: String?)

/** Keeps the session in the app's private preferences, so the student stays signed in. */
class SessionStore(context: Context) {

    private val prefs = context.getSharedPreferences("session", Context.MODE_PRIVATE)

    fun load(): Session? {
        val token = prefs.getString("token", null) ?: return null
        return Session(token, prefs.getString("name", "").orEmpty(), prefs.getString("email", "").orEmpty(),
            prefs.getString("studentCode", null), prefs.getBoolean("passwordSet", true),
            prefs.getString("verification", null))
    }

    fun save(token: String, user: JSONObject): Session {
        val session = Session(token, user.optString("name"), user.optString("email"),
            user.optString("studentCode").ifBlank { null }, user.optBoolean("passwordSet", true),
            user.optString("verification").ifBlank { null })
        prefs.edit().putString("token", token).putString("name", session.name).putString("email", session.email)
            .putString("studentCode", session.studentCode).putBoolean("passwordSet", session.passwordSet)
            .putString("verification", session.verification).apply()
        return session
    }

    fun passwordSet(): Session? {
        prefs.edit().putBoolean("passwordSet", true).apply()
        return load()
    }

    fun clear() {
        prefs.edit().clear().apply()
    }
}
