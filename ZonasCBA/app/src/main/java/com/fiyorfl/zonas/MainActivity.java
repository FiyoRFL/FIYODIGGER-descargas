package com.fiyorfl.zonas;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private FrameLayout root;
    private WebView webView;
    private WebView scraper;
    private boolean scraperVisible = false;
    private int generation = 0;
    private String extractJs = "null";
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(10, 21, 34));
        getWindow().setNavigationBarColor(Color.rgb(11, 20, 32));

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(11, 20, 32));
        extractJs = leerAsset("scraper.js");

        // WebView oculta que lee los avisos de MercadoLibre como un navegador normal
        scraper = new WebView(this);
        WebSettings ss = scraper.getSettings();
        ss.setJavaScriptEnabled(true);
        ss.setDomStorageEnabled(true);
        ss.setLoadsImagesAutomatically(false);
        String ua = ss.getUserAgentString();
        if (ua != null) ss.setUserAgentString(ua.replace("; wv", ""));
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(scraper, true);
        scraper.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                final int g = generation;
                handler.postDelayed(() -> {
                    if (g == generation) extraer();
                }, 1800);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                return !("https".equals(scheme) || "http".equals(scheme));
            }
        });
        root.addView(scraper, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(11, 20, 32));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.addJavascriptInterface(new ScraperBridge(), "AndroidScraper");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (HOST.equals(uri.getHost())) return false;
                abrirFuera(uri);
                return true;
            }
        });

        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        webView.loadUrl("https://" + HOST + "/assets/index.html");
    }

    private void abrirFuera(Uri uri) {
        String scheme = uri.getScheme();
        if ("https".equals(scheme) || "http".equals(scheme) || "geo".equals(scheme)) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (ActivityNotFoundException ignored) {
                // sin app para abrir el enlace
            }
        }
    }

    private void extraer() {
        if (scraper == null) return;
        scraper.evaluateJavascript(extractJs, value -> {
            if (webView == null) return;
            String v = (value == null) ? "null" : value;
            webView.evaluateJavascript("window.onAvisos && window.onAvisos(" + v + ")", null);
        });
    }

    private void mostrarScraper(boolean mostrar) {
        scraperVisible = mostrar;
        if (mostrar) scraper.bringToFront();
        else webView.bringToFront();
        root.requestLayout();
        root.invalidate();
    }

    private class ScraperBridge {
        @JavascriptInterface
        public void cargar(final String url) {
            runOnUiThread(() -> {
                Uri u = Uri.parse(url);
                String host = u.getHost();
                if (!"https".equals(u.getScheme()) || host == null || !host.endsWith("mercadolibre.com.ar")) return;
                generation++;
                scraper.loadUrl(url);
            });
        }

        @JavascriptInterface
        public void mostrar() {
            runOnUiThread(() -> mostrarScraper(true));
        }

        @JavascriptInterface
        public void ocultar() {
            runOnUiThread(() -> mostrarScraper(false));
        }
    }

    private String leerAsset(String nombre) {
        try (InputStream in = getAssets().open(nombre)) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int r;
            while ((r = in.read(buf)) > 0) b.write(buf, 0, r);
            return b.toString("UTF-8");
        } catch (Exception e) {
            return "null";
        }
    }

    private void handleBack() {
        if (scraperVisible) {
            mostrarScraper(false);
            webView.evaluateJavascript("window.onScraperCerrado && window.onScraperCerrado()", null);
            return;
        }
        if (webView == null) {
            finish();
            return;
        }
        webView.evaluateJavascript(
                "window.manejarAtrasDesdeAndroid ? window.manejarAtrasDesdeAndroid() : false",
                value -> {
                    if (!"true".equals(value)) finish();
                });
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            handleBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public void onBackPressed() {
        handleBack();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (scraper != null) {
            scraper.destroy();
            scraper = null;
        }
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidScraper");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
