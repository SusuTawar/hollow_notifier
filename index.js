const axios = require("axios");
const express = require("express");
const morgan = require("morgan");
const rawBody = require("raw-body");
const socketio = require("socket.io");
const querystring = require("querystring");

const { join } = require("path");
const { readdirSync } = require("fs");
const { createHmac } = require("crypto");
const { createServer } = require("http");
const { scheduleJob } = require("node-schedule");
const { parseStringPromise } = require("xml2js");

const logger = require("./logger");

const app = express();
const server = createServer(app);
const io = socketio(server);

app.use(morgan("tiny"));

scheduleJob("0 * * *", () => {
  readdirSync(join(__dirname, "./channels")).forEach((file) => {
    const g = require(`./channels/${file}`);
    const group = g.split(".")[0];
    g.forEach(async (channel) => {
      const name =
        `${group}_` +
        channel.name.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, function (match) {
          return +match === 0 ? "" : match.toUpperCase();
        });
      await subscribe(name, channel.id);
    });
  });
});

async function subscribe(name, chid) {
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
  logger.info(`Subscribe to [${name}] at [${chid}]`);
}

app.get("/psh/yt/:id", async (req, res) => {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.challenge"].length > 0
  ) {
    res.status(200).send(req.query["hub.challenge"]);
    logger.info(`[${req.params.id}] verification success`);
  } else {
    res.status(400).send("");
    logger.info(`[${req.params.id}] verification fail`);
  }
});

app.post("/psh/yt/:id", async (req, res) => {
  const r = await parseStringPromise(await checkSign(req));
  const entry =
    "at:deleted-entry" in r ? r.feed["at:deleted-entry"][0] : r.feed.entry[0];
  const [action, response] = [
    "at:deleted-entry" in r ? "vid-remove" : "vid-update",
    {
      group: req.params.id.split("_")[0],
      channel: req.params.id.split("_")[1].replace(/([A-Z])/, " $1"),
      title: entry.title || "Not Defined",
      link:
        "yt:videoid" in entry
          ? entry["yt:videoid"][0]
          : entry.link[0].$.href.substr(32),
    },
  ];
  logger.info(`[${action}] [${req.params.id}] [${response.link}]`);
  io.to("/").emit(action, response);
  io.to(response.group).emit(action, response);
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

app.listen(3000, () => {
  logger.info("Http server running");
  io.listen(4000);
  logger.info("Running socket.io");
});

