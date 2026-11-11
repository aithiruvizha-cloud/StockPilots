#!/data/data/com.termux/files/usr/bin/bash
set -e

cd ~/StockPilot

echo "Backing up existing Developer App and backend files..."
mkdir -p backups/developer-app
cp Backend/developer-routes.js backups/developer-app/ 2>/dev/null || true
cp Backend/developer-auth.js backups/developer-app/ 2>/dev/null || true
cp DeveloperApp/app/src/main/java/com/stockpilot/developer/MainActivity.java backups/developer-app/ 2>/dev/null || true

echo "Creating PostgreSQL developer API..."

cat > Backend/developer-routes.js <<'EOF'
const express = require("express");
const router = express.Router();
const db = require("./pg-database");
const { hashPassword, verifyPassword, createToken, verifyToken } = require("./auth");

async function developerOnly(req, res, next) {
    try {
        const header = req.headers.authorization || "";
        const token = header.startsWith("Bearer ") ? header.slice(7) : "";
        if (!token) return res.status(401).json({success:false,message:"Login required"});
        const user = verifyToken(token);
        if (user.role !== "developer") return res.status(403).json({success:false,message:"Developer access required"});
        req.developer = user;
        next();
    } catch {
        res.status(401).json({success:false,message:"Invalid or expired login"});
    }
}

router.post("/login", async (req, res) => {
    try {
        const {email, password} = req.body;
        if (!email || !password) return res.status(400).json({success:false,message:"Enter email and password"});
        const result = await db.query(
            "SELECT id,email,password_hash FROM developer_accounts WHERE LOWER(email)=LOWER($1)",
            [email.trim()]
        );
        const developer = result.rows[0];
        if (!developer || !(await verifyPassword(password, developer.password_hash))) {
            return res.status(401).json({success:false,message:"Invalid developer credentials"});
        }
        const token = createToken({id:developer.id,role:"developer"});
        res.json({success:true,token,message:"Developer login successful"});
    } catch (e) {
        res.status(500).json({success:false,message:e.message});
    }
});

router.use(developerOnly);

router.get("/users", async (req,res) => {
    try {
        const result = await db.query(
            `SELECT id, name AS supermarket_name, owner_name, email, is_active, created_at
             FROM supermarkets ORDER BY id DESC`
        );
        res.json({success:true,users:result.rows});
    } catch(e) {
        res.status(500).json({success:false,message:e.message});
    }
});

router.post("/users", async (req,res) => {
    try {
        const {name, email, password, supermarketName} = req.body;
        if (!name || !email || !password || !supermarketName) {
            return res.status(400).json({success:false,message:"Enter user name, email, password and supermarket name"});
        }
        if (password.length < 8) {
            return res.status(400).json({success:false,message:"Password must contain at least 8 characters"});
        }
        const passwordHash = await hashPassword(password);
        const result = await db.query(
            `INSERT INTO supermarkets (name, owner_name, email, password_hash, is_active)
             VALUES ($1,$2,$3,$4,TRUE)
             RETURNING id,name,owner_name,email,is_active,created_at`,
            [supermarketName.trim(), name.trim(), email.trim().toLowerCase(), passwordHash]
        );
        res.status(201).json({success:true,user:result.rows[0],message:"User created successfully"});
    } catch(e) {
        const duplicate = e.code === "23505";
        res.status(duplicate ? 409 : 500).json({
            success:false,
            message:duplicate ? "This email is already registered" : e.message
        });
    }
});

router.patch("/users/:id/status", async (req,res) => {
    try {
        const {active} = req.body;
        if (typeof active !== "boolean") {
            return res.status(400).json({success:false,message:"active must be true or false"});
        }
        const result = await db.query(
            "UPDATE supermarkets SET is_active=$1 WHERE id=$2 RETURNING id,email,is_active",
            [active,req.params.id]
        );
        if (!result.rowCount) return res.status(404).json({success:false,message:"User not found"});
        res.json({success:true,user:result.rows[0],message:active ? "User activated" : "User deactivated"});
    } catch(e) {
        res.status(500).json({success:false,message:e.message});
    }
});

module.exports = router;
EOF

echo "Adding owner_name column without deleting existing data..."
cat > Backend/add-owner-column.js <<'EOF'
require("dotenv").config();
const db = require("./pg-database");
(async()=>{
  try {
    await db.query("ALTER TABLE supermarkets ADD COLUMN IF NOT EXISTS owner_name TEXT");
    console.log("owner_name column ready");
  } catch(e) {
    console.error(e.message);
    process.exitCode=1;
  } finally {
    await db.end();
  }
})();
EOF

echo "Updating Developer authentication..."
cat > Backend/developer-auth.js <<'EOF'
const db = require("./pg-database");
const {verifyPassword,createToken} = require("./auth");

async function developerLogin(email,password) {
    if (!email || !password) throw new Error("Email and password are required");
    const result = await db.query(
        "SELECT id,email,password_hash FROM developer_accounts WHERE LOWER(email)=LOWER($1)",
        [email.trim()]
    );
    const developer = result.rows[0];
    if (!developer || !(await verifyPassword(password,developer.password_hash))) {
        throw new Error("Invalid developer credentials");
    }
    return createToken({id:developer.id,role:"developer"});
}
module.exports={developerLogin};
EOF

echo "Creating Developer App interface..."

cat > DeveloperApp/app/src/main/java/com/stockpilot/developer/MainActivity.java <<'EOF'
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
EOF

echo "Checking Android internet permission..."
MANIFEST="DeveloperApp/app/src/main/AndroidManifest.xml"
if ! grep -q 'android.permission.INTERNET' "$MANIFEST"; then
  sed -i 's/<application/<uses-permission android:name="android.permission.INTERNET" \\/>\\n    <application/' "$MANIFEST"
fi

echo "Checking backend syntax..."
node --check Backend/developer-routes.js
node --check Backend/developer-auth.js

echo
echo "Files created."
echo "Next: run the database column update and build checks."
echo "No data was deleted and nothing was pushed to GitHub."
