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
                webView.visibility = View.GONE

                WindowCompat.getInsetsController(window, window.decorView).apply {
                    hide(WindowInsetsCompat.Type.systemBars())
                    systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                }
            }

            override fun onHideCustomView() {
                if (customView == null) return
                fullscreenContainer.removeView(customView)
                fullscreenContainer.visibility = View.GONE
                webView.visibility = View.VISIBLE
                customViewCallback?.onCustomViewHidden()
                customView = null
                customViewCallback = null

                WindowCompat.getInsetsController(window, window.decorView).apply {
                    show(WindowInsetsCompat.Type.systemBars())
                }
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
    }
}
