const { createLogger, transports, format } = require("winston");
const { combine, timestamp, printf } = format;

const myFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} ${level}: ${message}`;
});

function getDate() {
  const today = new Date();
  const date = today.getDate();
  const month = today.getMonth() + 1;
  const year = today.getFullYear();

  return `${year}${month < 10 ? "0" + month : month}${
    date < 10 ? "0" + date : date
  }`;
}

const logger = createLogger({
  level: "info",
  exitOnError: false,
  format: combine(timestamp(), myFormat),
  transports: [
    new transports.File({
      filename: `./logs/${getDate()}.log`,
    }),
    new transports.Console(),
  ],
});

module.exports = logger;
