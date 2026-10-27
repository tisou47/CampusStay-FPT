package vn.fpt.campusstay.student.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine
import org.json.JSONObject
import vn.fpt.campusstay.student.data.Api
import vn.fpt.campusstay.student.ui.T

/**
 * Push notifications (contract A-05, A-06, C-25): after sign-in the app sends its FCM token to `POST /devices`, and
 * takes it back with `POST /devices/unregister` before signing out. Without the Firebase project file nothing
 * happens; the in-app notifications still work.
 */
object Push {

    const val CHANNEL = "campusstay"

    fun available(context: Context): Boolean = FirebaseApp.getApps(context).isNotEmpty()

    fun createChannel(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, T("Notifications", "Thông báo"),
            NotificationManager.IMPORTANCE_DEFAULT))
    }

    /** The current FCM token, or null when push is not set up or Google Play services cannot give one. */
    suspend fun token(context: Context): String? {
        if (!available(context)) return null
        return suspendCancellableCoroutine { cont ->
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                cont.resume(if (task.isSuccessful) task.result else null)
            }
        }
    }

    suspend fun register(context: Context) {
        val token = token(context) ?: return
        runCatching { Api.post("/devices", JSONObject().put("token", token).put("platform", "android")) }
    }

    suspend fun unregister(context: Context) {
        val token = token(context) ?: return
        runCatching { Api.post("/devices/unregister", JSONObject().put("token", token)) }
    }
}
