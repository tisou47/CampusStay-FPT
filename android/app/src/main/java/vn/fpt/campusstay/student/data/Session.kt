package vn.fpt.campusstay.student.data

import android.content.Context
import org.json.JSONObject

/** The signed-in student: the token and the `user` of `POST /auth/sign-in`. */
data class Session(val token: String, val name: String, val email: String, val studentCode: String?)

/** Keeps the session in the app's private preferences, so the student stays signed in. */
class SessionStore(context: Context) {

    private val prefs = context.getSharedPreferences("session", Context.MODE_PRIVATE)

    fun load(): Session? {
        val token = prefs.getString("token", null) ?: return null
        return Session(token, prefs.getString("name", "").orEmpty(), prefs.getString("email", "").orEmpty(),
            prefs.getString("studentCode", null))
    }

    fun save(token: String, user: JSONObject): Session {
        val session = Session(token, user.optString("name"), user.optString("email"),
            user.optString("studentCode").ifBlank { null })
        prefs.edit().putString("token", token).putString("name", session.name).putString("email", session.email)
            .putString("studentCode", session.studentCode).apply()
        return session
    }

    fun clear() {
        prefs.edit().clear().apply()
    }
}
