package com.stockpilot.user;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.view.Gravity;
import android.widget.*;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {

    private EditText emailInput, passwordInput;
    private Button loginButton;
    private TextView statusText;

    private final ExecutorService executor =
            Executors.newSingleThreadExecutor();
    private final Handler handler =
            new Handler(Looper.getMainLooper());

    private static final String API_URL =
            "http://127.0.0.1:3002/api/supermarket/login";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String token = getSharedPreferences(
                "StockPilot", MODE_PRIVATE
        ).getString("auth_token", "");

        if (!token.isEmpty()) {
            showDashboard();
        } else {
            showLogin();
        }
    }

    private void showLogin() {
        setContentView(R.layout.activity_main);

        emailInput = findViewById(R.id.emailInput);
        passwordInput = findViewById(R.id.passwordInput);
        loginButton = findViewById(R.id.loginButton);
        statusText = findViewById(R.id.statusText);

        loginButton.setOnClickListener(v -> login());
    }

    private void login() {
        String email = emailInput.getText().toString().trim();
        String password = passwordInput.getText().toString();

        if (email.isEmpty() || password.isEmpty()) {
            statusText.setText("Please enter email and password.");
            return;
        }

        loginButton.setEnabled(false);
        statusText.setText("Signing in...");

        executor.execute(() -> {
            HttpURLConnection connection = null;

            try {
                connection = (HttpURLConnection)
                        new URL(API_URL).openConnection();

                connection.setRequestMethod("POST");
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(10000);
                connection.setDoOutput(true);
                connection.setRequestProperty(
                        "Content-Type", "application/json"
                );

                JSONObject request = new JSONObject();
                request.put("email", email);
                request.put("password", password);

                try (OutputStream output =
                        connection.getOutputStream()) {
                    output.write(request.toString()
                            .getBytes(StandardCharsets.UTF_8));
                }

                int code = connection.getResponseCode();

                InputStream input = code >= 200 && code < 300
                        ? connection.getInputStream()
                        : connection.getErrorStream();

                ByteArrayOutputStream buffer =
                        new ByteArrayOutputStream();

                byte[] data = new byte[1024];
                int count;

                while ((count = input.read(data)) != -1) {
                    buffer.write(data, 0, count);
                }
                input.close();

                JSONObject response = new JSONObject(
                        buffer.toString("UTF-8")
                );

                boolean success =
                        response.optBoolean("success", false);
                String message =
                        response.optString("message", "Login failed.");
                String token = response.optString("token", "");

                handler.post(() -> {
                    loginButton.setEnabled(true);

                    if (success && !token.isEmpty()) {
                        getSharedPreferences(
                                "StockPilot", MODE_PRIVATE
                        ).edit().putString("auth_token", token).apply();

                        showDashboard();
                    } else {
                        statusText.setTextColor(Color.RED);
                        statusText.setText(message);
                    }
                });

            } catch (Exception e) {
                handler.post(() -> {
                    loginButton.setEnabled(true);
                    statusText.setTextColor(Color.RED);
                    statusText.setText(
                            "Connection failed. Check your backend."
                    );
                });
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }
            }
        });
    }

    private void showDashboard() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Color.rgb(245, 247, 250));

        LinearLayout main = new LinearLayout(this);
        main.setOrientation(LinearLayout.VERTICAL);
        main.setPadding(22, 28, 22, 28);

        TextView title = new TextView(this);
        title.setText("StockPilot");
        title.setTextSize(30);
        title.setTextColor(Color.rgb(25, 65, 120));
        title.setGravity(Gravity.CENTER);
        title.setTypeface(null, 1);
        main.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText("SUPERMARKET MANAGEMENT");
        subtitle.setTextSize(13);
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setTextColor(Color.DKGRAY);
        main.addView(subtitle);

        TextView welcome = new TextView(this);
        welcome.setText("Welcome to your Dashboard");
        welcome.setTextSize(21);
        welcome.setTextColor(Color.BLACK);
        welcome.setTypeface(null, 1);
        welcome.setPadding(0, 35, 0, 20);
        main.addView(welcome);

        addModule(main, "🧾  Billing",
                "Create customer bills and invoices");
        addModule(main, "📦  Stock Load",
                "Add products and scan barcodes");
        addModule(main, "📊  Stock Left & Alerts",
                "View stock and low-stock alerts");
        addModule(main, "🚚  Dealer Details",
                "Manage suppliers and products");
        addModule(main, "🛒  Purchase Orders",
                "View automatic purchase orders");
        addModule(main, "🔔  Inbox",
                "View notifications and updates");
        addModule(main, "📈  Reports",
                "View sales and stock reports");

        Button logout = new Button(this);
        logout.setText("LOG OUT");
        logout.setOnClickListener(v -> {
            getSharedPreferences(
                    "StockPilot", MODE_PRIVATE
            ).edit().clear().apply();
            showLogin();
        });

        LinearLayout.LayoutParams lp =
                new LinearLayout.LayoutParams(
                        -1, -2
                );
        lp.topMargin = 24;
        main.addView(logout, lp);

        scroll.addView(main);
        setContentView(scroll);
    }

    private void addModule(
            LinearLayout parent,
            String name,
            String description) {

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(18, 16, 18, 16);
        card.setBackgroundColor(Color.WHITE);

        TextView heading = new TextView(this);
        heading.setText(name);
        heading.setTextSize(19);
        heading.setTextColor(Color.rgb(25, 65, 120));
        heading.setTypeface(null, 1);

        TextView detail = new TextView(this);
        detail.setText(description);
        detail.setTextSize(13);
        detail.setTextColor(Color.DKGRAY);
        detail.setPadding(0, 6, 0, 0);

        card.addView(heading);
        card.addView(detail);

        LinearLayout.LayoutParams params =
                new LinearLayout.LayoutParams(-1, -2);
        params.bottomMargin = 12;

        parent.addView(card, params);

        card.setOnClickListener(v ->
                Toast.makeText(
                        this,
                        name + " module is coming next.",
                        Toast.LENGTH_SHORT
                ).show()
        );
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        executor.shutdownNow();
    }
}
