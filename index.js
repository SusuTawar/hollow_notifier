const express = require("express");
const FeedParser = require("feedparser");
const AdmZip = require("adm-zip");
const { writeFileSync, appendFileSync, readdir, unlinkSync } = require("fs");
const { resolve } = require("path");

const app = express();

app.post("/psh/yt/:id", async (req, res) => {
	const d = await parseXml(req);
  writeFileSync(`logs/entry/${new Date().toString()}-${req.params.id}.txt`,JSON.stringify(d,null,'  '));
  appendFileSync(
    "logs/all.txt",
    `${new Date().toString()} ${req.params.id}\n`
  );
  res.status(200).send(d.challenge || "");
});

function parseXml(req) {
  return new Promise((resolve, reject) => {
    let data = [];
    req
      .pipe(new FeedParser())
      .on("error", reject)
      .on("readable", function () {
				let item;
				while(item = this.read()){
					data.push(item);
				}
				resolve(data);
			});
  });
}

app.get("/dlog.zip",(req,res)=>{
	const zip = new AdmZip();
	zip.addLocalFolder("logs");
	res.send(zip.toBuffer());
})

app.get("/purgelog",(req,res)=>{
	readdir("logs/entry",(err,files)=>{
		if(err)
			return res.status(500).send(err);
		unlinkSync(resolve("logs/entry","all.txt"));
		for(const file of files)
			if(file.endsWith(".log"))
				unlinkSync(resolve("logs/entry",file));
		res.status(204).end();
	});
})

app.listen(3000);
