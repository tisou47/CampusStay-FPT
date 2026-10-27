package vn.fpt.campusstay.student

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExitToApp
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.launch
import vn.fpt.campusstay.student.data.Api
import vn.fpt.campusstay.student.data.Session
import vn.fpt.campusstay.student.data.SessionStore
import vn.fpt.campusstay.student.push.Push
import vn.fpt.campusstay.student.ui.ActivityScreen
import vn.fpt.campusstay.student.ui.CampusStayTheme
import vn.fpt.campusstay.student.ui.HomeScreen
import vn.fpt.campusstay.student.ui.InvoiceScreen
import vn.fpt.campusstay.student.ui.NewMaintenanceScreen
import vn.fpt.campusstay.student.ui.PaymentsScreen
import vn.fpt.campusstay.student.ui.RoomScreen
import vn.fpt.campusstay.student.ui.SetPasswordScreen
import vn.fpt.campusstay.student.ui.SignInScreen
import vn.fpt.campusstay.student.ui.T

/**
 * The CampusStay student app (Change Specification v2 §11.2, phone menu: Home · My Room · Payments · Activity).
 * It follows the web's student portal and calls the same API; students sign in with their CampusStay password or
 * with Google (a Google sign-up first sets its password), and the app registers for push once signed in.
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val store = SessionStore(this)
        setContent {
            CampusStayTheme {
                var session by remember { mutableStateOf(store.load()) }
                Api.token = session?.token
                Api.onSignedOut = {
                    store.clear()
                    runOnUiThread { session = null }
                }
                val current = session
                val signOut = {
                    store.clear()
                    Api.token = null
                    session = null
                }
                when {
                    current == null -> SignInScreen(onSignedIn = { token, user ->
                        Api.token = token
                        session = store.save(token, user)
                    })
                    !current.passwordSet -> SetPasswordScreen(current.email, onDone = { session = store.passwordSet() },
                        onSignOut = signOut)
                    else -> App(current, onSignOut = signOut)
                }
            }
        }
    }
}

/** A screen opened on top of a tab. */
sealed interface Detail {
    data class Invoice(val id: String) : Detail
    data object NewMaintenance : Detail
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun App(session: Session, onSignOut: () -> Unit) {
    var tab by rememberSaveable { mutableStateOf(0) }
    var detail by remember { mutableStateOf<Detail?>(null) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    // Push (A-05): ask for the notification permission (Android 13+), then send the FCM token to the API.
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    LaunchedEffect(session.token) {
        Push.createChannel(context)
        if (Build.VERSION.SDK_INT >= 33) permission.launch(Manifest.permission.POST_NOTIFICATIONS)
        Push.register(context)
    }
    BackHandler(enabled = detail != null) { detail = null }
    val tabs = listOf(
        T("Home", "Trang chủ") to Icons.Filled.Home,
        T("My Room", "Phòng của tôi") to Icons.Filled.Place,
        T("Payments", "Thanh toán") to Icons.Filled.ShoppingCart,
        T("Activity", "Hoạt động") to Icons.Filled.List,
    )
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (detail == null) tabs[tab].first else "CampusStay") },
                navigationIcon = {
                    if (detail != null) {
                        IconButton(onClick = { detail = null }) { Text("←") }
                    }
                },
                actions = {
                    IconButton(onClick = {
                        scope.launch {
                            Push.unregister(context)
                            runCatching { Api.post("/auth/sign-out") }
                            onSignOut()
                        }
                    }) { Icon(Icons.Filled.ExitToApp, contentDescription = T("Sign out", "Đăng xuất")) }
                },
            )
        },
        bottomBar = {
            if (detail == null) {
                NavigationBar {
                    tabs.forEachIndexed { i, (name, icon) ->
                        NavigationBarItem(selected = tab == i, onClick = { tab = i },
                            icon = { Icon(icon, contentDescription = null) }, label = { Text(name) })
                    }
                }
            }
        },
    ) { padding ->
        val modifier = Modifier.padding(padding)
        when (val d = detail) {
            is Detail.Invoice -> InvoiceScreen(d.id, modifier)
            Detail.NewMaintenance -> NewMaintenanceScreen(modifier, onDone = { detail = null })
            null -> when (tab) {
                0 -> HomeScreen(session, modifier, openPayments = { tab = 2 }, openRoom = { tab = 1 })
                1 -> RoomScreen(modifier)
                2 -> PaymentsScreen(modifier, open = { detail = Detail.Invoice(it) })
                else -> ActivityScreen(modifier, newRequest = { detail = Detail.NewMaintenance })
            }
        }
    }
}
