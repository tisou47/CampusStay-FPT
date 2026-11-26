package vn.fpt.campusstay.student

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Bundle
import android.view.WindowManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.util.Locale

/**
 * The Flutter host. It creates the push channel that the manifest names for FCM (A-05), and lets Dart mark the window
 * secure (`FLAG_SECURE`: no screenshots, no recent-apps thumbnail) while the door code is shown (MOB-17).
 */
class MainActivity : FlutterActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val name = if (Locale.getDefault().language == "vi") "Thông báo" else "Notifications"
        getSystemService(NotificationManager::class.java)
            .createNotificationChannel(NotificationChannel("campusstay", name, NotificationManager.IMPORTANCE_DEFAULT))
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "campusstay/secure").setMethodCallHandler { call, result ->
            if (call.method == "setSecure") {
                if (call.arguments == true) {
                    window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                } else {
                    window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                }
                result.success(null)
            } else {
                result.notImplemented()
            }
        }
    }
}
