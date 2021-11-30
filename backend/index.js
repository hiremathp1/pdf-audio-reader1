require('dotenv').config()
const express = require('express')
require('express-async-errors')
const mcache = require('memory-cache');
const fs = require('fs')
var cors = require('cors');
const {get_transcript, httpDownload} = require('./lib.js')

const TMP_DIR = process.env.TMP_DIR
const FILES_HOST = process.env.FILES_HOST

async function print_transcription(pdf_file, transcript_path) {
  const list = await get_transcript(pdf_file, transcript_path)
  process.stdout.write(JSON.stringify({"error": false, 'transcript': list}))
}

function start_server() {
  const app = express()
  app.use(cors({
    origin: process.env.CORS_DOMAIN
  }));
  app.set('view engine', 'jade');

  var cache = (duration) => {
    return (req, res, next) => {
      let key = '__express__' + req.originalUrl || req.url
      let cachedBody = mcache.get(key)
      if (cachedBody) {
        res.send(cachedBody)
        return
      } else {
        res.sendResponse = res.send
        res.send = (body) => {
          mcache.put(key, body, duration * 1000);
          res.sendResponse(body)
        }
        next()
      }
    }
  }

  port = process.env.PORT || 3030
  app.get('/', cache(process.env.CACHE_TIME), async (req, res) => {
    const query = req.query
    if (!(query.pdf && query.text)) {
      res.send({"error": "Missing Params! Available params are: pdf, text, sep"})
      return
    }
    console.log(`Request: ${query.pdf} ${query.text}`)
    try {
      var list = await get_transcript(query.pdf, query.text, query.sep)
      if (!list || (list.length === 0))
        res.send({"error": "The transcript might be wrong. Wrong text param"})
      else
        res.send({"error": false, 'transcript': list})
    } catch (e) {
      process.stderr.write(`${e}\n`)
      res.send({"error": "The request is invalid. Wrong pdf param"})
    }
  })

  app.get('/get', async(req, res) => {
    const query = req.query
    if (!query.file)
      return res.sendStatus(404)
    var url = FILES_HOST + "/" + query.file
    try{
      var download_path = TMP_DIR + '/' + url.split("/").slice(-1)[0]
    } catch{
      return res.sendStatus(404)
    }
    try {
      await httpDownload(url, download_path)
    } catch {
      return res.sendStatus(404)
    }
    if(!fs.existsSync(download_path)){
      return res.sendStatus(500)
    }
    res.sendFile(download_path)
  })

  app.listen(port, () => {
    process.stdout.write(`Listening on port: ${port}\n`)
  })
}

args = process.argv.slice(2)
if (args.length === 2) {
  if (!args[0].endsWith(".pdf")) {
    process.stderr.write("First argument must be a pdf file\n")
    process.exit(1)
  }
  print_transcription(args[0], args[1], args[3])
}
else if (args.length === 0 || args.includes("-s") || args.includes("--serve"))
  start_server()
else if (args.includes("-h") || args.includes("--help")) {
  process.stdout.write("\n\n[npm start | node index.js] [pdf_file.pdf] [text] [word_separator?]: Will output transcript to stdout for given pdf and text (list of words)\n                                                  These 2 arguments can be urls\n")
  process.stdout.write("-s --serve or default with no arguments: starts express server listening on 'PORT' environment variable\n")
  process.stdout.write("-h --help: This help message\n\n")
}
else
  process.stdout.write("Invalid arguments. Try -h\n")

