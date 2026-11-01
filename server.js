require("dotenv").config();
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const { Pool } = require("pg");
const QRCode = require("qrcode");
const { auth } = require("express-openid-connect");
const { auth: checkJwt, requiredScopes } = require("express-oauth2-jwt-bearer");

const { APP_URL, AUTH0_URL, AUTH0_AUDIENCE } = process.env;

const pool = new Pool({
  connectionString: process.env.DB_URL,
  ssl: { rejectUnauthorized: false }
});

const app = express();
app.set("trust proxy", 1);

app.use(auth({
  authRequired: false,
  auth0Logout: true,
  baseURL: APP_URL,
  issuerBaseURL: AUTH0_URL,
  clientID: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  secret: process.env.SESSION_SECRET
}));

const jwt = checkJwt({ issuerBaseURL: AUTH0_URL, audience: AUTH0_AUDIENCE });

function render(name, values) {
  let html = fs.readFileSync(`${__dirname}/views/${name}.html`, "utf8");
  for (const key in values) html = html.replaceAll(`{{${key}}}`, values[key]);
  return html;
}

function requireLogin(req, res, next) {
  if (req.oidc.isAuthenticated()) {
    return next();
  }
  res.status(401).send(render("message", { title: "401", text: "401 greska." }));
}

async function homePage(req, res) {
  const result = await pool.query(
    "SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active FROM passes"
  );
  const stats = result.rows[0];

  let authHtml = `<a href="/login">Prijava</a>`;
  let passesHtml = "";

  if (req.oidc.isAuthenticated()) {
    authHtml = `<a href="/logout">Odjava</a>`;
    const list = await pool.query("SELECT * FROM passes ORDER BY issued_at DESC");
    for (const p of list.rows) {
      passesHtml += `
        <p>${p.name} (${p.document}) - ${p.status}</p>
        <form method="POST" action="/passes/${p.id}/cancel"><button>Poništi</button></form>
        <form method="POST" action="/passes/${p.id}/delete"><button>Obriši</button></form>`;
    }
  }

  res.send(render("home", { total: stats.total, active: stats.active, auth: authHtml, passes: passesHtml }));
}

async function cancelPass(req, res) {
  await pool.query("UPDATE passes SET status = 'CANCELLED' WHERE id = $1", [req.params.id]);
  res.redirect("/");
}

async function deletePass(req, res) {
  await pool.query("DELETE FROM passes WHERE id = $1", [req.params.id]);
  res.redirect("/");
}

async function infoPage(req, res) {
  const result = await pool.query("SELECT * FROM passes WHERE id = $1", [req.params.id]);
  const p = result.rows[0];
  if (!p) {
    return res.status(404).send(render("message", { title: "404", text: "Propusnica ne postoji. 404" }));
  }
  res.send(render("info", {
    status: p.status,
    name: p.name,
    document: p.document,
    issuedAt: p.issued_at.toISOString()
  }));
}

async function getPass(req, res) {
  const result = await pool.query("SELECT * FROM passes WHERE id = $1", [req.params.id]);
  const p = result.rows[0];
  if (!p) {
    return res.sendStatus(404);
  }
  res.json({
    id: p.id,
    name: p.name,
    document: p.document,
    issuedAt: p.issued_at.toISOString(),
    status: p.status
  });
}

async function createPass(req, res) {
  let name;
  let document;

  if (req.body) {
    name = req.body.name;
    document = req.body.document;
  }

  if (typeof name !== "string" || typeof document !== "string" ||name.trim() === "" || document.trim() === "") {
    return res.sendStatus(400);
  }

  const id = crypto.randomUUID();
  await pool.query("INSERT INTO passes (id, name, document) VALUES ($1, $2, $3)", [id, name, document]);

  const png = await QRCode.toBuffer(`${APP_URL}/info/${id}`);
  res.status(201).set("Location", `${APP_URL}/passes/${id}`).type("image/png").send(png);
}

app.get("/", homePage);
app.post("/passes/:id/cancel", requireLogin, cancelPass);
app.post("/passes/:id/delete", requireLogin, deletePass);
app.get("/info/:id", infoPage);
app.get("/passes/:id", jwt, requiredScopes("read:passes"), getPass);
app.post("/passes", jwt, requiredScopes("create:passes"), express.json(), createPass);

function startServer() {
  app.listen(process.env.PORT || 3000);
}

pool.query(`
  CREATE TABLE IF NOT EXISTS passes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    document TEXT NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'ACTIVE'
  )
`).then(startServer);