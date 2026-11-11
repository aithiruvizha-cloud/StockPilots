package com.stockpilot.user;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.view.View;
import android.view.Gravity;
import android.widget.*;
import org.json.*;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;

public class MainActivity extends Activity {

    private static final String BASE =
        "https://stockpilot-api-9rqp.onrender.com/api";

    private String token = "";
    private LinearLayout root;
    private EditText emailInput, passwordInput;
    private TextView statusText;
    private Button loginButton;

    private final ExecutorService executor =
        Executors.newSingleThreadExecutor();
    private final Handler handler =
        new Handler(Looper.getMainLooper());

    private JSONObject api(String path, String method, JSONObject body)
            throws Exception {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection)
                new URL(BASE + path).openConnection();

            c.setRequestMethod(method);
            c.setConnectTimeout(20000);
            c.setReadTimeout(20000);
            c.setRequestProperty("Content-Type", "application/json");

            if (!token.isEmpty()) {
                c.setRequestProperty(
                    "Authorization", "Bearer " + token
                );
            }

            if (body != null) {
                c.setDoOutput(true);
                try (OutputStream out = c.getOutputStream()) {
                    out.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }
            }

            int code = c.getResponseCode();
            InputStream in = code >= 200 && code < 300
                ? c.getInputStream() : c.getErrorStream();

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[2048];
            int n;
            while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
            in.close();

            return new JSONObject(out.toString("UTF-8"));
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private JSONObject obj(String... values) throws Exception {
        JSONObject o = new JSONObject();
        for (int i = 0; i + 1 < values.length; i += 2)
            o.put(values[i], values[i + 1]);
        return o;
    }

    private void work(String loading, Runnable task) {
        Toast.makeText(this, loading, Toast.LENGTH_SHORT).show();
        executor.execute(() -> {
            try {
                task.run();
            } catch (Exception e) {
                handler.post(() ->
                    message("Error: " + e.getMessage())
                );
            }
        });
    }

    private void message(String text) {
        Toast.makeText(this, text, Toast.LENGTH_LONG).show();
    }

    private void init(String heading) {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Color.rgb(245,247,251));

        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(22,24,22,30);
        scroll.addView(root);
        setContentView(scroll);

        TextView title = new TextView(this);
        title.setText(heading);
        title.setTextSize(26);
        title.setTextColor(Color.rgb(23,59,114));
        title.setTypeface(null, Typeface.BOLD);
        title.setPadding(0,0,0,18);
        root.addView(title);
    }

    private TextView text(String value) {
        TextView t = new TextView(this);
        t.setText(value);
        t.setTextSize(16);
        t.setTextColor(Color.rgb(35,45,60));
        t.setPadding(0,10,0,10);
        root.addView(t);
        return t;
    }

    private EditText field(String hint) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setSingleLine(true);
        e.setPadding(12,8,12,8);
        root.addView(e);
        return e;
    }

    private Button button(String label, Runnable action) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        root.addView(b);
        b.setOnClickListener(v -> action.run());
        return b;
    }

    private void backButton() {
        button("← Dashboard", this::showDashboard);
    }

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);

        token = getSharedPreferences("StockPilot", MODE_PRIVATE)
            .getString("auth_token", "");

        if (token.isEmpty()) showLogin();
        else showDashboard();
    }

    private void showLogin() {
        init("StockPilot");
        text("Smart Supermarket Management");
        emailInput = field("Supermarket email");
        emailInput.setInputType(33);
        passwordInput = field("Password");
        passwordInput.setInputType(129);

        loginButton = button("LOGIN", this::login);
        statusText = text("");
    }

    private void login() {
        String email = emailInput.getText().toString().trim();
        String password = passwordInput.getText().toString();

        if (email.isEmpty() || password.isEmpty()) {
            statusText.setText("Enter email and password.");
            return;
        }

        loginButton.setEnabled(false);
        statusText.setText("Signing in...");

        executor.execute(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("email", email);
                body.put("password", password);

                JSONObject r = api("/supermarket/login", "POST", body);
                String newToken = r.optString("token", "");

                handler.post(() -> {
                    loginButton.setEnabled(true);
                    if (r.optBoolean("success") && !newToken.isEmpty()) {
                        token = newToken;
                        getSharedPreferences("StockPilot", MODE_PRIVATE)
                            .edit().putString("auth_token", token).apply();
                        showDashboard();
                    } else {
                        statusText.setText(r.optString("message", "Login failed"));
                    }
                });
            } catch (Exception e) {
                handler.post(() -> {
                    loginButton.setEnabled(true);
                    statusText.setText("Connection error: " + e.getMessage());
                });
            }
        });
    }

    private void showDashboard() {
        init("StockPilot Dashboard");

        button("Refresh Dashboard", this::loadDashboard);

        button("🧾 Billing & Invoices", this::billing);
        button("📦 Products & Stock Loading", this::products);
        button("📊 Stock Adjustment & Alerts", this::stock);
        button("🚚 Dealer Management", this::dealers);
        button("🛒 Purchase Orders", this::orders);
        button("🔔 Notifications Inbox", this::inbox);
        button("📈 Sales & Stock Reports", this::reports);

        button("LOG OUT", () -> {
            token = "";
            getSharedPreferences("StockPilot", MODE_PRIVATE)
                .edit().clear().apply();
            showLogin();
        });

        loadDashboard();
    }

    private void loadDashboard() {
        work("Loading dashboard...", () -> {
            JSONObject r = api("/operations/dashboard", "GET", null);
            handler.post(() -> {
                if (!r.optBoolean("success")) {
                    message(r.optString("message", "Dashboard failed"));
                    return;
                }
                new AlertDialog.Builder(this)
                    .setTitle("Today's Dashboard")
                    .setMessage(
                        "Products: " + r.optString("products") +
                        "\nTotal stock: " + r.optString("stock") +
                        "\nLow stock products: " + r.optString("lowStock") +
                        "\nToday's sales: ₹" + r.optString("todaySales")
                    )
                    .setPositiveButton("OK", null).show();
            });
        });
    }

    private void products() {
        init("Products");
        EditText name = field("Product name");
        EditText barcode = field("Barcode");
        EditText cost = field("Purchase cost");
        EditText mrp = field("MRP");
        EditText price = field("Selling price");
        EditText qty = field("Opening quantity");
        EditText threshold = field("Low stock threshold");
        EditText autoQty = field("Automatic reorder quantity");
        EditText dealerId = field("Dealer ID (optional)");

        button("ADD PRODUCT", () -> work("Saving product...", () -> {
            JSONObject b = new JSONObject();
            b.put("name", name.getText().toString().trim());
            b.put("barcode", barcode.getText().toString().trim());
            b.put("purchase_cost", number(cost));
            b.put("mrp", number(mrp));
            b.put("selling_price", number(price));
            b.put("quantity", number(qty));
            b.put("low_stock_threshold", number(threshold));
            b.put("auto_order_quantity", number(autoQty));

            String d = dealerId.getText().toString().trim();
            if (!d.isEmpty()) b.put("dealer_id", Long.parseLong(d));

            JSONObject r = api("/operations/products", "POST", b);
            handler.post(() -> {
                message(r.optBoolean("success")
                    ? "Product added successfully"
                    : r.optString("message", "Could not add product"));
                if (r.optBoolean("success")) products();
            });
        }));

        EditText search = field("Enter barcode to search");
        button("SEARCH BARCODE", () -> work("Searching...", () -> {
            String code = search.getText().toString().trim();
            JSONObject r = api(
                "/operations/products/barcode/" +
                URLEncoder.encode(code, "UTF-8"), "GET", null
            );
            handler.post(() -> {
                if (r.optBoolean("success")) {
                    JSONObject p = r.optJSONObject("product");
                    message(p == null ? "Product found" :
                        p.optString("name") + "\nStock: " +
                        p.optString("current_stock"));
                } else message(r.optString("message", "Not found"));
            });
        }));

        button("VIEW PRODUCTS", this::loadProducts);
        backButton();
    }

    private double number(EditText e) {
        String s = e.getText().toString().trim();
        return s.isEmpty() ? 0 : Double.parseDouble(s);
    }

    private void loadProducts() {
        work("Loading products...", () -> {
            JSONObject r = api("/operations/products", "GET", null);
            handler.post(() -> {
                init("Product List");
                if (!r.optBoolean("success")) {
                    text(r.optString("message"));
                    backButton();
                    return;
                }
                JSONArray a = r.optJSONArray("products");
                if (a != null) for (int i=0; i<a.length(); i++) {
                    JSONObject p = a.optJSONObject(i);
                    text(
                        p.optString("name") +
                        "\nBarcode: " + p.optString("barcode") +
                        "\nStock: " + p.optString("current_stock") +
                        "\nPrice: ₹" + p.optString("selling_price") +
                        "\nDealer: " + p.optString("dealer_name")
                    );
                }
                backButton();
            });
        });
    }

    private void stock() {
        init("Stock Management");
        EditText id = field("Product ID");
        EditText qty = field("Quantity change (+ add, - remove)");
        EditText reason = field("Reason");

        button("ADJUST STOCK", () -> work("Updating stock...", () -> {
            JSONObject b = new JSONObject();
            b.put("product_id", Long.parseLong(id.getText().toString()));
            b.put("quantity", number(qty));
            b.put("reason", reason.getText().toString());

            JSONObject r = api("/operations/stock/adjust", "POST", b);
            handler.post(() -> message(r.optBoolean("success")
                ? "New stock: " + r.optString("newStock")
                : r.optString("message", "Stock update failed")));
        }));

        button("CHECK LOW STOCK & CREATE ORDERS", () ->
            work("Checking low stock...", () -> {
                JSONObject r = api("/operations/stock/check-low", "POST",
                    new JSONObject());
                handler.post(() -> message(
                    r.optString("ordersCreated", "0") +
                    " purchase orders created.\n" +
                    r.optString("message", "")
                ));
            })
        );

        button("VIEW STOCK REPORT", () -> reportStock());
        backButton();
    }

    private void dealers() {
        init("Dealer Management");
        EditText name = field("Dealer name");
        EditText phone = field("Phone");
        EditText email = field("Email");

        button("ADD DEALER", () -> work("Saving dealer...", () -> {
            JSONObject b = new JSONObject();
            b.put("name", name.getText().toString().trim());
            b.put("phone", phone.getText().toString().trim());
            b.put("email", email.getText().toString().trim());

            JSONObject r = api("/operations/dealers", "POST", b);
            handler.post(() -> message(r.optBoolean("success")
                ? "Dealer added. ID: " + r.optString("id")
                : r.optString("message", "Failed")));
        }));

        button("VIEW DEALERS", () -> work("Loading dealers...", () -> {
            JSONObject r = api("/operations/dealers", "GET", null);
            handler.post(() -> {
                init("Dealer List");
                JSONArray a = r.optJSONArray("dealers");
                if (a != null) for (int i=0; i<a.length(); i++) {
                    JSONObject d = a.optJSONObject(i);
                    text("ID: " + d.optString("id") +
                        "\n" + d.optString("name") +
                        "\nPhone: " + d.optString("phone") +
                        "\nEmail: " + d.optString("email"));
                }
                backButton();
            });
        }));
        backButton();
    }

    private void orders() {
        work("Loading orders...", () -> {
            JSONObject r = api("/operations/orders", "GET", null);
            handler.post(() -> {
                init("Purchase Orders");
                JSONArray a = r.optJSONArray("orders");
                if (a != null) for (int i=0; i<a.length(); i++) {
                    JSONObject o = a.optJSONObject(i);
                    long id = o.optLong("id");
                    text("Order #" + id +
                        "\nProduct: " + o.optString("product_name") +
                        "\nDealer: " + o.optString("dealer_name") +
                        "\nQuantity: " + o.optString("quantity") +
                        "\nStatus: " + o.optString("status"));

                    if ("accepted".equals(o.optString("status")) ||
                        "dispatched".equals(o.optString("status"))) {
                        button("CONFIRM GOODS RECEIVED - #" + id, () ->
                            work("Confirming receipt...", () -> {
                                JSONObject result = api(
                                    "/operations/orders/" + id + "/received",
                                    "POST", new JSONObject()
                                );
                                handler.post(() -> {
                                    message(result.optString("message",
                                        result.optBoolean("success")
                                        ? "Received" : "Failed"));
                                    orders();
                                });
                            })
                        );
                    }
                }
                backButton();
            });
        });
    }

    private void billing() {
        init("Billing");
        EditText productId = field("Product ID");
        EditText quantity = field("Quantity");
        EditText customer = field("Customer email (optional)");
        EditText payment = field("Payment method (Cash / UPI / Card)");
        Button add = button("ADD ITEM TO BILL", () -> {
            try {
                long id = Long.parseLong(productId.getText().toString());
                double q = Double.parseDouble(quantity.getText().toString());
                if (q <= 0) throw new Exception("Quantity must be positive");
                billItems.put(id, billItems.getOrDefault(id, 0.0) + q);
                message("Item added to bill");
                productId.setText("");
                quantity.setText("");
            } catch (Exception e) {
                message("Enter valid product ID and quantity");
            }
        });

        button("VIEW CART", () -> {
            StringBuilder s = new StringBuilder();
            for (Long id : billItems.keySet())
                s.append("Product ID ").append(id)
                    .append(" × ").append(billItems.get(id)).append("\n");
            message(s.length() == 0 ? "Cart is empty" : s.toString());
        });

        button("COMPLETE BILL", () -> {
            if (billItems.isEmpty()) {
                message("Add items first");
                return;
            }
            work("Creating invoice...", () -> {
                JSONObject b = new JSONObject();
                JSONArray items = new JSONArray();
                for (Long id : billItems.keySet()) {
                    JSONObject item = new JSONObject();
                    item.put("product_id", id);
                    item.put("quantity", billItems.get(id));
                    items.put(item);
                }
                b.put("items", items);
                b.put("customer_email", customer.getText().toString().trim());
                String method = payment.getText().toString().trim();
                b.put("payment_method", method.isEmpty() ? "Cash" : method);

                JSONObject r = api("/operations/billing", "POST", b);
                handler.post(() -> {
                    if (r.optBoolean("success")) {
                        billItems.clear();
                        message("Invoice: " + r.optString("invoiceNumber") +
                            "\nTotal: ₹" + r.optString("total"));
                        billing();
                    } else message(r.optString("message", "Billing failed"));
                });
            });
        });

        button("INVOICE HISTORY", this::invoices);
        backButton();
    }

    private final java.util.LinkedHashMap<Long, Double> billItems =
        new java.util.LinkedHashMap<>();

    private void invoices() {
        work("Loading invoices...", () -> {
            JSONObject r = api("/operations/invoices", "GET", null);
            handler.post(() -> {
                init("Invoice History");
                JSONArray a = r.optJSONArray("invoices");
                if (a != null) for (int i=0; i<a.length(); i++) {
                    JSONObject v = a.optJSONObject(i);
                    text(v.optString("invoice_number") +
                        "\nAmount: ₹" + v.optString("total_amount") +
                        "\nPayment: " + v.optString("payment_method") +
                        "\nDate: " + v.optString("created_at"));
                }
                backButton();
            });
        });
    }

    private void inbox() {
        work("Loading inbox...", () -> {
            JSONObject r = api("/operations/inbox", "GET", null);
            handler.post(() -> {
                init("Notifications Inbox");
                JSONArray a = r.optJSONArray("messages");
                if (a != null) for (int i=0; i<a.length(); i++) {
                    JSONObject m = a.optJSONObject(i);
                    text(m.optString("event_type") +
                        "\n" + m.optString("message") +
                        "\n" + m.optString("created_at"));
                }
                backButton();
            });
        });
    }

    private void reports() {
        init("Reports");
        button("SALES REPORT", () -> work("Loading sales...", () -> {
            JSONObject r = api("/operations/reports/sales", "GET", null);
            handler.post(() -> {
                init("Sales Report");
                JSONArray a = r.optJSONArray("report");
                if (a != null) for (int i=0; i<a.length(); i++) {
                    JSONObject x = a.optJSONObject(i);
                    text(x.optString("day") +
                        "\nInvoices: " + x.optString("invoices") +
                        "\nSales: ₹" + x.optString("total"));
                }
                backButton();
            });
        }));
        button("STOCK REPORT", this::reportStock);
        backButton();
    }

    private void reportStock() {
        work("Loading stock report...", () -> {
            JSONObject r = api("/operations/reports/stock", "GET", null);
            handler.post(() -> {
                init("Stock Report");
                JSONArray a = r.optJSONArray("products");
                if (a != null) for (int i=0; i<a.length(); i++) {
                    JSONObject p = a.optJSONObject(i);
                    text(p.optString("name") +
                        "\nStock: " + p.optString("current_stock") +
                        "\nLow stock at: " +
                        p.optString("low_stock_threshold"));
                }
                backButton();
            });
        });
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        executor.shutdownNow();
    }
}
