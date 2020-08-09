const axios = require("axios");
const helmet = require("helmet");
const morgan = require("morgan");
const express = require("express");
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
app.use(helmet());

scheduleJob("0 * * *", () => {
  readdirSync(join(__dirname, "./channels")).forEach((file) => {
    const g = require(`./channels/${file}`);
    const group = g.split(".")[0];
    g.forEach((channel) => {
      const name =
        `${group}_` +
        channel.name
          .toLowerCase()
          .replace(/\b\w/g, (match) => match.toUpperCase())
          .replace(/\s+/g, "");
      subscribe(name, channel.id).then();
    });
  });
});

async function subscribe(name, chid) {
  try {
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
  } catch (error) {
    logger.error(error);
  }
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

app.post("/psh/yt/:id", checkSign, (req, res) => {
  if (!req.body.verified) return res.status(403).send("");
  const entry =
    "at:deleted-entry" in req.body.feed
      ? req.body.feed["at:deleted-entry"][0]
      : req.body.feed.entry[0];
  const [action, response] = [
    "at:deleted-entry" in req.body.feed ? "vid-remove" : "vid-update",
    {
      group: req.params.id.split("_")[0],
      channel: req.params.id.split("_")[1].replace(/([A-Z])/, " $1"),
			title: entry.title? entry.title[0] : "Not Defined",
      link:
        "yt:videoid" in entry
          ? entry["yt:videoid"][0]
          : entry.link[0].$.href.split("watch?v=")[1],
    },
  ];
	console.log(response);
  logger.info(`[${action}] [${req.params.id}] [${response.link}]`);
  io.of("/").emit(action, response);
  io.of(response.group).emit(action, response);
  res.status(200).send("");
});

async function checkSign(req, res, next) {
  try {
    const xhs = req.headers["x-hub-signature"] || req.headers["X-Hub-Signature"];
    if (!xhs) return res.status(403).send('');
    const method = xhs.split("=")[0];
    const signature = xhs.split("=")[1];
    const raw = await rawBody(req);

    const csign = createHmac(method, process.env.wesub_secret);
    csign.update(raw);
    req.body = await parseStringPromise(raw);
    req.body.verified = signature == `${method}=${csign.digest("hex")}`;
    next();
  } catch (error) {
    next(error);
  }
}

app.listen(3000, () => {
  logger.info("Http server running");
  io.listen(4000);
  logger.info("Running socket.io");
});
