package vn.fpt.campusstay.student.push

import android.Manifest
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import vn.fpt.campusstay.student.MainActivity
import vn.fpt.campusstay.student.R
import vn.fpt.campusstay.student.data.Api
import vn.fpt.campusstay.student.data.SessionStore

/**
 * FCM: a new token is sent to the API when a student is signed in; a message that arrives while the app is open is
 * shown like the ones Android shows when it is closed (title and body of the API's notification).
 */
class PushService : FirebaseMessagingService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        val session = SessionStore(this).load() ?: return
        Api.token = session.token
        scope.launch { Push.register(this@PushService) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title ?: return
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED && android.os.Build.VERSION.SDK_INT >= 33) {
            return
        }
        Push.createChannel(this)
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notification = NotificationCompat.Builder(this, Push.CHANNEL)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(message.notification?.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message.notification?.body))
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(this).notify(message.messageId.hashCode(), notification)
    }
}
