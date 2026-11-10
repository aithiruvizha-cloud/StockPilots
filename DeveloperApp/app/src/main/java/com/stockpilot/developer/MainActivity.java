package com.stockpilot.developer;

import android.app.Activity;
import android.os.Bundle;
import android.os.StrictMode;
import android.graphics.Typeface;
import android.view.View;
import android.widget.*;
import org.json.*;
import java.net.*;
import java.io.*;

public class MainActivity extends Activity {
    private final String BASE="https://stockpilot-api-9rqp.onrender.com/api/developer";
    private String token="";
    private LinearLayout root;
    private EditText email,password;
    private TextView status;

    private JSONObject request(String path,String method,JSONObject body) throws Exception {
        HttpURLConnection c=(HttpURLConnection)new URL(BASE+path).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(20000);
        c.setReadTimeout(20000);
        c.setRequestProperty("Content-Type","application/json");
        if(!token.isEmpty()) c.setRequestProperty("Authorization","Bearer "+token);
        if(body!=null) {
            c.setDoOutput(true);
            c.getOutputStream().write(body.toString().getBytes("UTF-8"));
        }
        InputStream in=(c.getResponseCode()<400)?c.getInputStream():c.getErrorStream();
        ByteArrayOutputStream out=new ByteArrayOutputStream();
        in.transferTo(out);
        JSONObject result=new JSONObject(out.toString("UTF-8"));
        c.disconnect();
        return result;
    }

    private void init() {
        root=new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(28,28,28,28);
        ScrollView scroll=new ScrollView(this);
        scroll.addView(root);
        setContentView(scroll);
    }

    private TextView title(String text) {
        TextView t=new TextView(this);
        t.setText(text);
        t.setTextSize(23);
        t.setTypeface(null,Typeface.BOLD);
        t.setPadding(0,12,0,18);
        root.addView(t);
        return t;
    }

    private EditText field(String hint,boolean secret) {
        EditText e=new EditText(this);
        e.setHint(hint);
        if(secret)e.setInputType(129);
        root.addView(e);
        return e;
    }

    private Button button(String text,Runnable action) {
        Button b=new Button(this);
        b.setText(text);
        root.addView(b);
        b.setOnClickListener(v->action.run());
        return b;
    }

    private void message(String text) {
        Toast.makeText(this,text,Toast.LENGTH_LONG).show();
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        StrictMode.setThreadPolicy(new StrictMode.ThreadPolicy.Builder().permitAll().build());
        showLogin();
    }

    private void showLogin() {
        init();
        title("StockPilot Developer");
        email=field("Developer email",false);
        password=field("Password",true);
        status=new TextView(this);
        root.addView(status);
        button("LOGIN",()->{
            try {
                JSONObject b=new JSONObject();
                b.put("email",email.getText().toString().trim());
                b.put("password",password.getText().toString());
                JSONObject r=request("/login","POST",b);
                if(r.optBoolean("success")) {
                    token=r.getString("token");
                    showDashboard();
                } else message(r.optString("message","Login failed"));
            } catch(Exception e) { message("Login error: "+e.getMessage()); }
        });
    }

    private void showDashboard() {
        init();
        title("Developer Dashboard");
        button("CREATE USER",()->showCreateUser());
        button("VIEW USERS",()->loadUsers());
        button("LOG OUT",()->{token="";showLogin();});
    }

    private void showCreateUser() {
        init();
        title("Create Supermarket User");
        EditText n=field("User name",false);
        EditText s=field("Supermarket name",false);
        EditText e=field("Email address",false);
        EditText p=field("Password (minimum 8 characters)",true);
        button("CREATE ACCOUNT",()->{
            try {
                JSONObject b=new JSONObject();
                b.put("name",n.getText().toString().trim());
                b.put("supermarketName",s.getText().toString().trim());
                b.put("email",e.getText().toString().trim());
                b.put("password",p.getText().toString());
                JSONObject r=request("/users","POST",b);
                message(r.optString("message","Request completed"));
                if(r.optBoolean("success")) showDashboard();
            } catch(Exception ex) { message("Create error: "+ex.getMessage()); }
        });
        button("BACK",()->showDashboard());
    }

    private void loadUsers() {
        try {
            init();
            title("Registered Users");
            JSONObject r=request("/users","GET",null);
            if(!r.optBoolean("success")) { message(r.optString("message")); return; }
            JSONArray users=r.getJSONArray("users");
            for(int i=0;i<users.length();i++) {
                JSONObject u=users.getJSONObject(i);
                long id=u.getLong("id");
                boolean active=u.optBoolean("is_active");
                TextView t=new TextView(this);
                t.setText(
                    u.optString("owner_name")+"  |  "+
                    u.optString("supermarket_name")+"\n"+
                    u.optString("email")+"\nStatus: "+(active?"Active":"Inactive")
                );
                t.setTextSize(16);
                t.setPadding(0,18,0,8);
                root.addView(t);
                button(active?"DEACTIVATE":"ACTIVATE",()->changeStatus(id,!active));
            }
            button("BACK",()->showDashboard());
        } catch(Exception e) { message("Could not load users: "+e.getMessage()); }
    }

    private void changeStatus(long id,boolean active) {
        try {
            JSONObject b=new JSONObject();
            b.put("active",active);
            JSONObject r=request("/users/"+id+"/status","PATCH",b);
            message(r.optString("message","Updated"));
            loadUsers();
        } catch(Exception e) { message("Update error: "+e.getMessage()); }
    }
}
