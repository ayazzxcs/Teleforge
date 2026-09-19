package org.teleforge.client

import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.JsResult
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.util.Base64
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewAssetLoader.AssetsPathHandler

/**
 * TeleForge Android Client Activity.
 *
 * Hosts the TeleForge MTProto client inside a hardened, hardware-accelerated
 * Android WebView with support for:
 *  - Secure local asset serving via WebViewAssetLoader
 *  - Native file and image chooser for profile pictures and media
 *  - Telegram deep linking (tg:// and https://t.me/)
 *  - Edge-to-edge layout with system bar styling
 *  - Hardware back navigation
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var assetLoader: WebViewAssetLoader
    private lateinit var fullscreenContainer: FrameLayout
    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null

    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private val fileChooserLauncher: ActivityResultLauncher<Intent> =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val results: Array<Uri>? = when {
                result.resultCode == RESULT_OK && result.data != null -> {
                    val data = result.data
                    val clipData = data?.clipData
                    if (clipData != null && clipData.itemCount > 0) {
                        Array(clipData.itemCount) { i -> clipData.getItemAt(i).uri }
                    } else if (data?.data != null) {
                        arrayOf(data.data!!)
                    } else null
                }
                else -> null
            }

            // Deliver results to standard HTML file chooser callback
            fileChooserCallback?.onReceiveValue(results)
            fileChooserCallback = null

            // Also broadcast directly to WebView via JavaScript custom event
            val selectedUri = results?.firstOrNull()
            if (selectedUri != null) {
                try {
                    contentResolver.openInputStream(selectedUri)?.use { stream ->
                        val bytes = stream.readBytes()
                        if (bytes.isNotEmpty()) {
                            val mime = contentResolver.getType(selectedUri) ?: "image/jpeg"
                            val b64 = "data:$mime;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
                            val escaped = b64.replace("'", "\\'")
                            webView.post {
                                webView.evaluateJavascript(
                                    "window.dispatchEvent(new CustomEvent('teleforge:photoSelected', { detail: { dataUrl: '$escaped' } }));",
                                    null
                                )
                            }
                        }
                    }
                } catch (e: Exception) {
                    // Ignore read errors
                }
            }
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Enable edge-to-edge layout
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.parseColor("#0C1017")
        window.navigationBarColor = Color.parseColor("#0C1017")

        // Root container
        val rootLayout = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.parseColor("#0C1017"))
        }

        // Configure WebViewAssetLoader for secure HTTPS local asset loading
        assetLoader = WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/assets/", AssetsPathHandler(this))
            .build()

        // Create WebView
        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.parseColor("#0C1017"))
            setLayerType(View.LAYER_TYPE_HARDWARE, null)
        }

        // Loading ProgressBar
        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                dpToPx(3)
            ).apply {
                topMargin = dpToPx(24)
            }
            max = 100
            progressDrawable.setColorFilter(
                Color.parseColor("#8B1E22"),
                android.graphics.PorterDuff.Mode.SRC_IN
            )
            visibility = View.VISIBLE
        }

        fullscreenContainer = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.BLACK)
            visibility = View.GONE
        }

        rootLayout.addView(webView)
        rootLayout.addView(fullscreenContainer)
        rootLayout.addView(progressBar)
        setContentView(rootLayout)

        // Apply system window insets
        ViewCompat.setOnApplyWindowInsetsListener(rootLayout) { view, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(0, systemBars.top, 0, systemBars.bottom)
            insets
        }

        setupWebViewSettings()
        setupWebViewClients()
        setupBackNavigation()
        createNotificationChannel()
        // Load or restore the TeleForge client
        if (savedInstanceState == null) {
            loadTeleForgeClient()
        } else {
            webView.restoreState(savedInstanceState)
        }
        handleIncomingIntent(intent)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebViewSettings() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.setSupportMultipleWindows(false)
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }

        val defaultUa = settings.userAgentString
        settings.userAgentString = "$defaultUa TeleForgeAndroid/1.0.0"

        // Register TeleForge native bridge for downloads and system actions
        webView.addJavascriptInterface(TeleForgeBridge(this), "TeleForgeBridge")
    }

    private fun setupWebViewClients() {
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                val uri = request?.url
                if (uri != null) {
                    // Native Image Proxy: downloads remote images for profile photos / media without CORS restrictions
                    if (uri.host == "appassets.androidplatform.net" && uri.path == "/api/proxy-image") {
                        val targetUrl = uri.getQueryParameter("url")
                        if (!targetUrl.isNullOrBlank()) {
                            try {
                                val urlObj = java.net.URL(targetUrl)
                                val connection = urlObj.openConnection() as java.net.HttpURLConnection
                                connection.instanceFollowRedirects = true
                                connection.connectTimeout = 10000
                                connection.readTimeout = 15000
                                connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Android; TeleForge/1.0)")
                                connection.connect()

                                val rawType = connection.contentType ?: "image/jpeg"
                                val mimeType = rawType.substringBefore(';').trim()
                                val headers = mapOf(
                                    "Access-Control-Allow-Origin" to "*",
                                    "Access-Control-Allow-Methods" to "GET, OPTIONS",
                                    "Access-Control-Allow-Headers" to "*"
                                )
                                return WebResourceResponse(
                                    mimeType,
                                    "UTF-8",
                                    connection.responseCode,
                                    connection.responseMessage ?: "OK",
                                    headers,
                                    connection.inputStream
                                )
                            } catch (e: Exception) {
                                // Fall through to assetLoader
                            }
                        }
                    }

                    // Native Video / Media Streamer: serves locally cached media with full HTTP 206 Range support
                    if (uri.host == "appassets.androidplatform.net" && uri.path == "/api/local-media") {
                        val id = uri.getQueryParameter("id")
                        if (!id.isNullOrBlank()) {
                            try {
                                val file = java.io.File(cacheDir, "media/$id.mp4")
                                if (file.exists() && file.length() > 0L) {
                                    val fileLength = file.length()
                                    val rangeHeader = request.requestHeaders?.get("Range")
                                        ?: request.requestHeaders?.get("range")

                                    if (!rangeHeader.isNullOrBlank() && rangeHeader.startsWith("bytes=")) {
                                        val rangeSpec = rangeHeader.substringAfter("bytes=").trim()
                                        val parts = rangeSpec.split("-")
                                        var start = parts[0].toLongOrNull() ?: 0L
                                        var end = if (parts.size > 1 && parts[1].isNotEmpty()) {
                                            parts[1].toLongOrNull() ?: (fileLength - 1L)
                                        } else {
                                            fileLength - 1L
                                        }
                                        if (end >= fileLength) end = fileLength - 1L
                                        if (start > end) start = 0L
                                        val contentLength = end - start + 1L

                                        val fis = java.io.FileInputStream(file)
                                        if (start > 0L) {
                                            fis.channel.position(start)
                                        }

                                        val limitedStream = object : java.io.InputStream() {
                                            private var bytesRemaining = contentLength
                                            override fun read(): Int {
                                                if (bytesRemaining <= 0L) return -1
                                                val b = fis.read()
                                                if (b != -1) bytesRemaining--
                                                return b
                                            }
                                            override fun read(b: ByteArray, off: Int, len: Int): Int {
                                                if (bytesRemaining <= 0L) return -1
                                                val toRead = Math.min(len.toLong(), bytesRemaining).toInt()
                                                val count = fis.read(b, off, toRead)
                                                if (count > 0) bytesRemaining -= count.toLong()
                                                return count
                                            }
                                            override fun available(): Int =
                                                Math.min(fis.available().toLong(), bytesRemaining).toInt()
                                            override fun close() {
                                                fis.close()
                                            }
                                        }

                                        val headers = mapOf(
                                            "Access-Control-Allow-Origin" to "*",
                                            "Accept-Ranges" to "bytes",
                                            "Content-Range" to "bytes $start-$end/$fileLength",
                                            "Content-Length" to contentLength.toString(),
                                            "Content-Type" to "video/mp4"
                                        )

                                        return WebResourceResponse(
                                            "video/mp4",
                                            null,
                                            206,
                                            "Partial Content",
                                            headers,
                                            limitedStream
                                        )
                                    } else {
                                        val headers = mapOf(
                                            "Access-Control-Allow-Origin" to "*",
                                            "Accept-Ranges" to "bytes",
                                            "Content-Length" to fileLength.toString(),
                                            "Content-Type" to "video/mp4"
                                        )
                                        return WebResourceResponse(
                                            "video/mp4",
                                            null,
                                            200,
                                            "OK",
                                            headers,
                                            java.io.FileInputStream(file)
                                        )
                                    }
                                }
                            } catch (e: Exception) {
                                // Fall through to assetLoader
                            }
                        }
                    }

                    // Intercept stickers and animated GIFs from app web assets
                    if (uri.host == "appassets.androidplatform.net") {
                        val path = uri.path ?: ""
                        if (path.startsWith("/stickers/") || path.startsWith("/gifs/")) {
                            try {
                                val assetPath = "web" + path
                                val stream = assets.open(assetPath)
                                val mime = if (path.endsWith(".svg")) "image/svg+xml" else if (path.endsWith(".webp")) "image/webp" else "image/png"
                                val headers = mapOf(
                                    "Access-Control-Allow-Origin" to "*",
                                    "Cache-Control" to "public, max-age=31536000"
                                )
                                return WebResourceResponse(mime, "UTF-8", 200, "OK", headers, stream)
                            } catch (e: Exception) {
                                android.util.Log.w("TeleForge", "Asset open error for $path: ${e.message}")
                            }
                        }
                    }

                    val response = assetLoader.shouldInterceptRequest(uri)
                    if (response != null) return response
                }
                return super.shouldInterceptRequest(view, request)
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url?.toString() ?: return false
                return handleUrlNavigation(url)
            }

            @Deprecated("Deprecated in Java")
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                if (url == null) return false
                return handleUrlNavigation(url)
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                progressBar.visibility = View.VISIBLE
                view?.evaluateJavascript("window.__IS_TELEFORGE_ANDROID__ = true;", null)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                progressBar.visibility = View.GONE
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progressBar.progress = newProgress
                if (newProgress >= 100) {
                    progressBar.visibility = View.GONE
                } else {
                    progressBar.visibility = View.VISIBLE
                }
            }

            override fun onShowFileChooser(
                view: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = filePathCallback

                val intent = try {
                    fileChooserParams?.createIntent()?.apply {
                        if (type.isNullOrEmpty() || type == "*/*") {
                            type = "image/*"
                        }
                    } ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                        type = "image/*"
                        addCategory(Intent.CATEGORY_OPENABLE)
                    }
                } catch (e: Exception) {
                    Intent(Intent.ACTION_GET_CONTENT).apply {
                        type = "image/*"
                        addCategory(Intent.CATEGORY_OPENABLE)
                    }
                }

                return try {
                    fileChooserLauncher.launch(intent)
                    true
                } catch (e: Exception) {
                    fileChooserCallback = null
                    false
                }
            }

            override fun onPermissionRequest(request: PermissionRequest?) {
                request?.grant(request.resources)
            }

            override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                if (customView != null) {
                    onHideCustomView()
                    return
                }
                customView = view
                customViewCallback = callback
                if (view != null) {
                    fullscreenContainer.addView(
                        view,
                        FrameLayout.LayoutParams(
                            FrameLayout.LayoutParams.MATCH_PARENT,
                            FrameLayout.LayoutParams.MATCH_PARENT
                        )
                    )
                }
                fullscreenContainer.visibility = View.VISIBLE

                WindowCompat.getInsetsController(window, window.decorView).apply {
                    hide(WindowInsetsCompat.Type.systemBars())
                    systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                }
            }

            override fun onHideCustomView() {
                if (customView == null) return
                fullscreenContainer.removeView(customView)
                fullscreenContainer.visibility = View.GONE
                customViewCallback?.onCustomViewHidden()
                customView = null
                customViewCallback = null

                WindowCompat.getInsetsController(window, window.decorView).apply {
                    show(WindowInsetsCompat.Type.systemBars())
                }
            }

            override fun onJsAlert(
                view: WebView?,
                url: String?,
                message: String?,
                result: JsResult?
            ): Boolean {
                android.util.Log.w("TeleForge", "Suppressed JS Alert: $message")
                result?.confirm()
                return true
            }
        }
    }

    private fun handleUrlNavigation(url: String): Boolean {
        val uri = Uri.parse(url)

        // Telegram deep linking: tg://... or https://t.me/...
        if (uri.scheme == "tg" || (uri.scheme == "https" && uri.host == "t.me")) {
            val nativeIntent = Intent(Intent.ACTION_VIEW, uri)
            return try {
                startActivity(nativeIntent)
                true
            } catch (e: Exception) {
                false
            }
        }

        // Keep local app assets within the WebView
        if (url.startsWith("https://appassets.androidplatform.net") || url.startsWith("file:///android_asset/")) {
            return false
        }

        // Open external web links in device browser
        return try {
            val browserIntent = Intent(Intent.ACTION_VIEW, uri)
            startActivity(browserIntent)
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (customView != null) {
                    webView.webChromeClient?.onHideCustomView()
                    return
                }
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    private fun loadTeleForgeClient() {
        val assetUrl = "https://appassets.androidplatform.net/assets/web/index.html"
        webView.loadUrl(assetUrl)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIncomingIntent(intent)
    }

    private fun handleIncomingIntent(intent: Intent?) {
        if (intent == null) return

        val action = intent.action
        val data = intent.data

        if (Intent.ACTION_VIEW == action && data != null) {
            val encodedUri = Uri.encode(data.toString())
            webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('teleforge:deeplink', { detail: '$encodedUri' }));",
                null
            )
        } else if (Intent.ACTION_SEND == action) {
            val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)
            if (sharedText != null) {
                val escaped = sharedText.replace("'", "\\'")
                webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('teleforge:share', { detail: { text: '$escaped' } }));",
                    null
                )
            }
        }

        // Handle direct chat click from status bar notification
        if (intent.hasExtra("chatId")) {
            val chatId = intent.getStringExtra("chatId")
            if (!chatId.isNullOrBlank()) {
                val escapedChatId = chatId.replace("'", "\\'")
                webView.post {
                    webView.evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('teleforge:openChat', { detail: { chatId: '$escapedChatId' } }));",
                        null
                    )
                }
            }
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = "TeleForge Messages"
            val descriptionText = "Incoming Telegram messages & notifications"
            val importance = NotificationManager.IMPORTANCE_HIGH
            val channel = NotificationChannel("teleforge_messages", name, importance).apply {
                description = descriptionText
                enableVibration(true)
            }
            val notificationManager: NotificationManager? =
                getSystemService(NotificationManager::class.java)
            notificationManager?.createNotificationChannel(channel)
        }
    }

    fun displayNotification(title: String, body: String, chatId: String) {
        try {
            val intent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("chatId", chatId)
            }
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            } else {
                PendingIntent.FLAG_UPDATE_CURRENT
            }
            val pendingIntent: PendingIntent = PendingIntent.getActivity(
                this,
                chatId.hashCode(),
                intent,
                flags
            )

            val builder = NotificationCompat.Builder(this, "teleforge_messages")
                .setSmallIcon(android.R.drawable.stat_notify_chat)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)

            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
                NotificationManagerCompat.from(this).notify(chatId.hashCode(), builder.build())
            }
        } catch (e: Exception) {
            android.util.Log.e("TeleForge", "displayNotification error: ${e.message}", e)
        }
    }

    private fun dpToPx(dp: Int): Int {
        val density = resources.displayMetrics.density
        return (dp * density).toInt()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    inner class TeleForgeBridge(private val activity: MainActivity) {
        @android.webkit.JavascriptInterface
        fun saveFile(base64Data: String, fileName: String, mimeType: String) {
            activity.runOnUiThread {
                try {
                    val rawB64 = if (base64Data.contains(",")) base64Data.substringAfter(",") else base64Data
                    val bytes = Base64.decode(rawB64, Base64.DEFAULT)

                    val resolver = activity.contentResolver
                    val contentValues = android.content.ContentValues().apply {
                        put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, fileName)
                        put(android.provider.MediaStore.MediaColumns.MIME_TYPE, mimeType)
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                            val subDir = when {
                                mimeType.startsWith("video/") -> android.os.Environment.DIRECTORY_MOVIES
                                mimeType.startsWith("image/") -> android.os.Environment.DIRECTORY_PICTURES
                                else -> android.os.Environment.DIRECTORY_DOWNLOADS
                            }
                            put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, "$subDir/TeleForge")
                            put(android.provider.MediaStore.MediaColumns.IS_PENDING, 1)
                        }
                    }

                    val collection = when {
                        mimeType.startsWith("video/") -> {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                android.provider.MediaStore.Video.Media.getContentUri(android.provider.MediaStore.VOLUME_EXTERNAL_PRIMARY)
                            } else {
                                android.provider.MediaStore.Video.Media.EXTERNAL_CONTENT_URI
                            }
                        }
                        mimeType.startsWith("image/") -> {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                android.provider.MediaStore.Images.Media.getContentUri(android.provider.MediaStore.VOLUME_EXTERNAL_PRIMARY)
                            } else {
                                android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                            }
                        }
                        else -> {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                android.provider.MediaStore.Downloads.getContentUri(android.provider.MediaStore.VOLUME_EXTERNAL_PRIMARY)
                            } else {
                                android.provider.MediaStore.Files.getContentUri("external")
                            }
                        }
                    }

                    val itemUri = resolver.insert(collection, contentValues)
                    if (itemUri != null) {
                        resolver.openOutputStream(itemUri)?.use { out ->
                            out.write(bytes)
                        }
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                            contentValues.clear()
                            contentValues.put(android.provider.MediaStore.MediaColumns.IS_PENDING, 0)
                            resolver.update(itemUri, contentValues, null, null)
                        }
                        android.widget.Toast.makeText(activity, "Saved to Downloads: $fileName", android.widget.Toast.LENGTH_LONG).show()
                    }
                } catch (e: Exception) {
                    android.widget.Toast.makeText(activity, "Failed to save file: ${e.message}", android.widget.Toast.LENGTH_SHORT).show()
                }
            }
        }

        @android.webkit.JavascriptInterface
        fun writeMediaChunk(id: String, base64Chunk: String, isAppend: Boolean): Boolean {
            return try {
                val mediaDir = java.io.File(activity.cacheDir, "media")
                if (!mediaDir.exists()) mediaDir.mkdirs()
                val file = java.io.File(mediaDir, "$id.mp4")
                val rawB64 = if (base64Chunk.contains(",")) base64Chunk.substringAfter(",") else base64Chunk
                val bytes = Base64.decode(rawB64, Base64.DEFAULT)
                java.io.FileOutputStream(file, isAppend).use { fos ->
                    fos.write(bytes)
                }
                true
            } catch (e: Exception) {
                android.util.Log.e("TeleForgeBridge", "writeMediaChunk error: ${e.message}", e)
                false
            }
        }

        @android.webkit.JavascriptInterface
        fun getLocalMediaUrl(id: String): String {
            val file = java.io.File(activity.cacheDir, "media/$id.mp4")
            if (file.exists() && file.length() > 0L) {
                return "https://appassets.androidplatform.net/api/local-media?id=$id"
            }
            return ""
        }

        @android.webkit.JavascriptInterface
        fun hasLocalMedia(id: String): Boolean {
            val file = java.io.File(activity.cacheDir, "media/$id.mp4")
            return file.exists() && file.length() > 0L
        }

        @android.webkit.JavascriptInterface
        fun setFullscreen(enabled: Boolean) {
            activity.runOnUiThread {
                try {
                    val controller = WindowCompat.getInsetsController(activity.window, activity.window.decorView)
                    if (enabled) {
                        controller.hide(WindowInsetsCompat.Type.systemBars())
                        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                    } else {
                        controller.show(WindowInsetsCompat.Type.systemBars())
                    }
                } catch (e: Exception) {
                    android.util.Log.e("TeleForgeBridge", "setFullscreen error: ${e.message}")
                }
            }
        }

        @android.webkit.JavascriptInterface
        fun showNotification(title: String, body: String, chatId: String) {
            activity.runOnUiThread {
                activity.displayNotification(title, body, chatId)
            }
        }
    }
}
