package vn.fpt.campusstay.student

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity
import java.util.Locale

/** The Flutter host. It only creates the push channel that the manifest names for FCM (A-05); the app is Dart. */
class MainActivity : FlutterActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val name = if (Locale.getDefault().language == "vi") "Thông báo" else "Notifications"
        getSystemService(NotificationManager::class.java)
            .createNotificationChannel(NotificationChannel("campusstay", name, NotificationManager.IMPORTANCE_DEFAULT))
    }
}
