const express = require("express");
const axios = require("axios");
const rawBody = require("raw-body");
const morgan = require("morgan");
const querystring = require("querystring");
const FeedParser = require("feedparser");
const AdmZip = require("adm-zip");
const { writeFileSync, appendFileSync, readdir, unlinkSync } = require("fs");
const { resolve } = require("path");
const { createHmac } = require("crypto");
const { Readable } = require("stream");

const app = express();
app.use(morgan("common"));

app.get("/psh/sub/yt/:name/:chid", async (req, res) => {
  const { name, chid } = req.params;
  await axios({
    url: "http://pubsubhubbub.appspot.com/",
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    data: querystring.stringify({
      "hub.mode": "subscribe",
      "hub.callback": `https://hollow-notifier.glitch.me/psh/yt/${name}`,
      "hub.topic": `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${chid}`,
      "hub.lease_seconds": `${24 * 60 * 60}`,
      "hub.secret": process.env.wesub_secret,
    }),
  });
  appendFileSync("logz/all.txt", `${new Date().toString()} adding ${name}\n`);
  res.status(200).json({ name, channel: chid });
});

app.get("/psh/yt/:id", async (req, res) => {
  if (
    req.query["hub.mode"] === "subscribe" &&
    //req.query["hub.verify_token"] === process.env.verify_token &&
    req.query["hub.challenge"].length > 0
  ) {
    res.status(200).send(req.query["hub.challenge"]);
    appendFileSync(
      "logz/all.txt",
      `${new Date().toString()} verify (success) ${req.params.id}\n`
    );
  } else {
    res.status(400).send("");
    appendFileSync(
      "logz/all.txt",
      `${new Date().toString()} verify (failed) ${req.params.id}\n`
    );
  }
});

app.post("/psh/yt/:id", async (req, res) => {
  const r = await checkSign(req);
  const bodyStream = new Readable();
  bodyStream.push(r.body);
  bodyStream.push(null);
  const d = await parseXml(bodyStream);
  writeFileSync(
    `logz/entry/${new Date().toString()}-${req.params.id}.txt`,
    JSON.stringify(d, null, "  ")
  );
  appendFileSync("logz/all.txt", `${new Date().toString()} ${req.params.id}\n`);
  res.status(200).send("");
});

async function checkSign(req) {
  const xhs = req.headers["X-Hub-Signature"];
  if (!xhs) return true;
  const method = xhs.split("=")[0];
  const signature = xhs.split("=")[1];
  const raw = await rawBody(req);

  const csign = createHmac(method, process.env.wesub_secret);
  csign.update(raw);
  return {
    verify: signature == `sha1=${csign.digest("hex")}`,
    body: raw,
  };
}

function parseXml(req) {
  return new Promise((resolve, reject) => {
    let data = [];
    req
      .pipe(new FeedParser())
      .on("error", reject)
      .on("readable", function () {
        let item;
        while ((item = this.read())) {
          data.push(item);
        }
        resolve(data);
      });
  });
}

app.get("/dlog.zip", (req, res) => {
  const zip = new AdmZip();
  zip.addLocalFolder("logs");
  res.send(zip.toBuffer());
});

app.get("/purgelog", (req, res) => {
  readdir("logz/entry", (err, files) => {
    if (err) return res.status(500).send(err);
    unlinkSync(resolve("logz/entry", "all.txt"));
    for (const file of files)
      if (file.endsWith(".txt")) unlinkSync(resolve("logz/entry", file));
    res.status(204).end();
  });
});

app.listen(3000);
