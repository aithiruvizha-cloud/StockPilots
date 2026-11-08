package com.stockpilot.user;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.net.HttpURLConnection;
import java.net.URL;
import java.io.OutputStream;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
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
                URL url = new URL(API_URL);
                connection = (HttpURLConnection) url.openConnection();

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

                int responseCode = connection.getResponseCode();

                InputStream input = responseCode >= 200
                        && responseCode < 300
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
                        SharedPreferences preferences =
                                getSharedPreferences(
                                        "StockPilot",
                                        MODE_PRIVATE
                                );

                        preferences.edit()
                                .putString("auth_token", token)
                                .apply();

                        statusText.setTextColor(0xFF16803C);
                        statusText.setText("Login successful!");
                    } else {
                        statusText.setTextColor(0xFFD32F2F);
                        statusText.setText(message);
                    }
                });

            } catch (Exception e) {
                handler.post(() -> {
                    loginButton.setEnabled(true);
                    statusText.setTextColor(0xFFD32F2F);
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

    @Override
    protected void onDestroy() {
        super.onDestroy();
        executor.shutdownNow();
    }
}
