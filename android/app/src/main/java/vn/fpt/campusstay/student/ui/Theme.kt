package vn.fpt.campusstay.student.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/** The web's student portal colours: FPT orange on a light grey canvas. */
private val colors = lightColorScheme(
    primary = Color(0xFFF26F21),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFE6D6),
    onPrimaryContainer = Color(0xFF6B2A00),
    background = Color(0xFFF7F7F8),
    surface = Color.White,
)

@Composable
fun CampusStayTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors, content = content)
}
