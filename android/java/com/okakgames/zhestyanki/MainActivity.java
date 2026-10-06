package com.okakgames.zhestyanki;

// «Жестянки»: игра целиком лежит внутри APK (assets) и показывается в WebView.
// Интернет нужен только для общей таблицы рекордов — без него играется всё, кроме неё.

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {

    /** Свой «сайт» внутри приложения: обычный https-адрес, поэтому работают localStorage и fetch. */
    static final String HOST = "appassets.androidplatform.net";
    static final String START = "https://" + HOST + "/index.html?platform=app";

    /** Подменяем «Поделиться» (в WebView своего navigator.share нет) и глушим
     *  запрос полноэкранного режима — приложение и так во весь экран. */
    private static final String SHARE_SHIM =
        "(function(){if(!window.AndroidApp||window.__zhShare)return;window.__zhShare=1;"
      + "var no=function(){return Promise.resolve()};"
      + "try{Element.prototype.requestFullscreen=no;Element.prototype.webkitRequestFullscreen=no;"
      + "document.exitFullscreen=no}catch(e){}"
      + "navigator.canShare=function(){return true};"
      + "navigator.share=function(d){return new Promise(function(ok,no){try{"
      + "var f=d&&d.files&&d.files[0];"
      + "if(!f){AndroidApp.share((d&&d.text)||'','');ok();return}"
      + "var r=new FileReader();"
      + "r.onload=function(){var s=String(r.result);AndroidApp.share((d&&d.text)||'',s.slice(s.indexOf(',')+1));ok()};"
      + "r.onerror=function(){no(new Error('read'))};"
      + "r.readAsDataURL(f)}catch(e){no(e)}})}})();";

    private WebView web;
    private long backAt;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        allowCutout();

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // музыка заводится с первого касания
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100); // системный «крупный шрифт» не должен ломать вёрстку игры
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setBackgroundColor(0xFF171C22);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new Local());
        web.addJavascriptInterface(new Bridge(), "AndroidApp");

        setContentView(web);
        web.loadUrl(START);
    }

    // ---------- отдаём файлы игры из assets ----------

    private final class Local extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (u == null || !HOST.equals(u.getHost())) return null; // рекорды и прочее — в сеть
            return asset(u.getPath());
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView v, String url) {
            Uri u = Uri.parse(url);
            if (HOST.equals(u.getHost())) return false;
            openOutside(u); // внешняя ссылка — в браузер, а не внутрь игры
            return true;
        }

        @Override
        public void onPageFinished(WebView v, String url) {
            v.evaluateJavascript(SHARE_SHIM, null);
        }
    }

    private WebResourceResponse asset(String path) {
        String p = path == null ? "" : path;
        if (p.startsWith("/")) p = p.substring(1);
        if (p.isEmpty()) p = "index.html";
        if (p.contains("..")) return notFound();
        try {
            InputStream in = getAssets().open(p);
            WebResourceResponse r = new WebResourceResponse(mime(p), "UTF-8", 200, "OK", headers(), in);
            return r;
        } catch (IOException e) {
            return notFound();
        }
    }

    private WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                headers(), new ByteArrayInputStream(new byte[0]));
    }

    private Map<String, String> headers() {
        Map<String, String> h = new HashMap<String, String>();
        h.put("Cache-Control", "no-cache");
        return h;
    }

    private static String mime(String p) {
        String n = p.toLowerCase();
        if (n.endsWith(".html")) return "text/html";
        if (n.endsWith(".js")) return "application/javascript";
        if (n.endsWith(".css")) return "text/css";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".svg")) return "image/svg+xml";
        if (n.endsWith(".woff2")) return "font/woff2";
        if (n.endsWith(".woff")) return "font/woff";
        if (n.endsWith(".json") || n.endsWith(".webmanifest")) return "application/json";
        if (n.endsWith(".mp4")) return "video/mp4";
        return "application/octet-stream";
    }

    // ---------- «Поделиться» кадром победы ----------

    final class Bridge {
        @JavascriptInterface
        public void share(final String text, final String b64) {
            runOnUiThread(new Runnable() {
                public void run() { doShare(text, b64); }
            });
        }
    }

    private void doShare(String text, String b64) {
        try {
            Intent i = new Intent(Intent.ACTION_SEND);
            if (b64 == null || b64.length() == 0) {
                i.setType("text/plain");
            } else {
                File dir = new File(getCacheDir(), ShotProvider.DIR);
                if (!dir.exists() && !dir.mkdirs()) return;
                File f = new File(dir, ShotProvider.NAME);
                FileOutputStream out = new FileOutputStream(f);
                try {
                    out.write(Base64.decode(b64, Base64.DEFAULT));
                } finally {
                    out.close();
                }
                i.setType("image/png");
                i.putExtra(Intent.EXTRA_STREAM,
                        Uri.parse("content://" + ShotProvider.AUTHORITY + "/" + ShotProvider.NAME));
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            }
            if (text != null && text.length() > 0) i.putExtra(Intent.EXTRA_TEXT, text);
            startActivity(Intent.createChooser(i, "Поделиться"));
        } catch (Throwable t) {
            // не вышло — не страшно, игра продолжается
        }
    }

    private void openOutside(Uri u) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u));
        } catch (Throwable t) {
            Toast.makeText(this, "Нет приложения для этой ссылки", Toast.LENGTH_SHORT).show();
        }
    }

    // ---------- полный экран ----------

    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
              | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
              | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
              | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
              | View.SYSTEM_UI_FLAG_FULLSCREEN
              | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    /** Рисуем под «чёлкой» — на телефонах с вырезом иначе чёрная полоса сбоку. */
    private void allowCutout() {
        try {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            java.lang.reflect.Field f = lp.getClass().getField("layoutInDisplayCutoutMode");
            f.setInt(lp, 1); // LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            getWindow().setAttributes(lp);
        } catch (Throwable t) {
            // до Android 9 выреза нет — и поля такого нет
        }
    }

    @Override
    public void onWindowFocusChanged(boolean has) {
        super.onWindowFocusChanged(has);
        if (has) immersive();
    }

    // ---------- жизненный цикл ----------

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) {
            web.onPause();      // свернули игру — звук и таймеры молчат
            web.pauseTimers();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.resumeTimers();
            web.onResume();
        }
        immersive();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            android.view.ViewGroup parent = (android.view.ViewGroup) web.getParent();
            if (parent != null) parent.removeView(web); // иначе WebView.destroy() может уронить приложение
            web.loadUrl("about:blank");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        long now = System.currentTimeMillis();
        if (now - backAt < 2000) {
            super.onBackPressed();
            return;
        }
        backAt = now;
        Toast.makeText(this, "Ещё раз «назад» — выйти из игры", Toast.LENGTH_SHORT).show();
    }
}
