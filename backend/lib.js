require('dotenv').config()
var fs = require('fs')
const pdfreader = require("pdfreader");
var stringSimilarity = require("string-similarity");

const MIN_SIMILARITY = process.env.MIN_SIMILARITY; // Set to 1 to only accept exact matches.
const TMP_DIR = process.env.TMP_DIR
const DEFAULT_WORD_SEPARATOR = /\s+|\.\.\.|\.\s|\;|[,\s]+/

// TEST URL's
//https://s3.amazonaws.com/audio.lumoslearning.com/read-along-demo/anansi_and_the_pot_of_beans.wav
//https://s3.amazonaws.com/audio.lumoslearning.com/read-along-demo/anasi_and_the_pot_of_beans.txt
//https://s3.amazonaws.com/audio.lumoslearning.com/read-along-demo/AnansiandthePotofBeans.pdf

function simplifyString(word) {
  return word.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/ig, '').toLowerCase();
}

function validURL(str) {
  var pattern = new RegExp('^(https?:\\/\\/)' + // protocol
    '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' + // domain name
    '((\\d{1,3}\\.){3}\\d{1,3}))' + // OR ip (v4) address
    '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' + // port and path
    '(\\?[;&a-z\\d%_.~+=-]*)?' + // query string
    '(\\#[-a-z\\d_]*)?$', 'i'); // fragment locator
  return !!pattern.test(str);
}

function createClient(url) {
  const http = require('http'),
    https = require('https');
  let client = http;
  if (url.toString().indexOf("https") === 0) {
    client = https;
  }
  return client
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    client = createClient(url)
    client.get(url, (resp) => {
      let chunks = [];
      resp.on('data', (chunk) => {
        chunks.push(chunk);
      });
      resp.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf-8'));
      });

    }).on("error", (err) => {
      process.stderr.write(err)
      reject(err);
    });
  });
}


function httpDownload(url, dest) {
  return new Promise((resolve, reject) => {
    // Check file does not exist yet before hitting network
    fs.access(dest, fs.constants.F_OK, (err) => {
      if (err === null) resolve(dest);
      const request = createClient(url).get(url, response => {
        if (response.statusCode === 200) {
          const file = fs.createWriteStream(dest, {flags: 'wx'});
          file.on('finish', () => resolve(dest));
          file.on('error', err => {
            file.close();
            if (err.code === 'EEXIST') reject('File already exists');
            else fs.unlink(dest, () => reject(err.message)); // Delete temp file
          });
          response.pipe(file);
        } else if (response.statusCode === 302 || response.statusCode === 301) {
          //Recursively follow redirects, only a 200 will resolve.
          download(response.headers.location, dest).then(() => resolve(dest));
        } else {
          reject(`Server responded with ${response.statusCode}: ${response.statusMessage}`);
        }
      })
      request.on('error', err => {
        reject(err.message);
      });
    });
  });
}

function parse_pdf(pdf_file_path) {
  return new Promise(async function (resolve, reject) {
    var pages = [];
    var rows = {}; // indexed by y-position

    function appendToPage() {
      pages.push([])
      const page_index = pages.length - 1
      Object.keys(rows) // => array of y-positions (type: float)
        .sort((y1, y2) => parseFloat(y1) - parseFloat(y2)) // sort float positions
        .forEach((y) => {
          const line = rows[y].join("")
          if (line)
            pages[page_index].push(line)
        });
      rows = {};
    }

    if (validURL(pdf_file_path)) { // Download to temporary folder
      const download_path = TMP_DIR + '/' + pdf_file_path.split("/").slice(-1)[0]
      try{
        pdf_file_path = await httpDownload(pdf_file_path, download_path)
      } catch {
        reject("Invalid URL")
        return
      }
    } 
    if(!fs.existsSync(pdf_file_path)){
      reject("File does no exist")
      return
    }
    new pdfreader.PdfReader().parseFileItems(
      pdf_file_path,
      function (err, item) {
        if (err)
          reject(err)
        if (!item)
          resolve(pages);
        else if (item.page)
          appendToPage();
        else if (item.text)
          (rows[item.y] = rows[item.y] || []).push(item.text);
      }
    );
  });
};

async function get_transcript(pdf_file_path, transcript_path, word_separator = null) {
  if (word_separator) var separator = new RegExp(word_separator)
  else var separator = DEFAULT_WORD_SEPARATOR
  const pages = await parse_pdf(pdf_file_path)
  if (pages === false) {
    process.stderr.write(`Failed on getting ${pdf_file_path}\n`)
    return
  }

  try {
    if (validURL(transcript_path)) var data = await httpGet(transcript_path)
    else var data = fs.readFileSync(transcript_path, 'utf8').toString()
  } catch (e) {
    process.stderr.write(`Failed on getting ${transcript_path}\n`)
    return []
  }

  let fileLen = 0;
  const transcriptList = data.split('\n').filter(line => line).map((line, index) => {
    fileLen++;
    try {
      return JSON.parse(line);
    } catch {
      process.stderr.write(`Json parse error at line number ${index}:\n${line}\n`)
      return undefined;
    }
  });

  let tempTranscriptedText = [];

  // Text preprocessing once on change page number
  // Need to find out The page, the line, the word index for each word
  let line_index = 0;
  let last_page_index = 0;
  let last_line_index = 0;
  let last_word_index = 0;

  loop: // For each line of the file search through the page textlayer for the corresponding word
  for (let word of transcriptList) {
    for (let page_index = last_page_index; page_index < pages.length; page_index++) {
      for (const line of pages[page_index].slice(last_line_index)) {
        for (const [word_index, w] of Object.entries(line.split(separator).slice(last_word_index))) {
          // Compare words ignoring special characters, case and thresholding similarity
          if (word && stringSimilarity.compareTwoStrings(simplifyString(word.value), simplifyString(w)) >= MIN_SIMILARITY) {
            tempTranscriptedText.push({time: word.time, value: w, line_index, page_index: page_index - 1, word_index: parseInt(word_index) + last_word_index});
            last_word_index++;
            // Once a word is found, nothing behind it will be matched, only forward
            last_line_index = line_index > last_line_index ? line_index : last_line_index;
            last_page_index = page_index > last_page_index ? page_index : last_page_index;
            continue loop;
          }
        }
        last_word_index = 0;
        line_index++;
      }
      line_index = 0;
      last_line_index = 0;
    }
    last_page_index++;
  }
  // The goal is to have an array like: [{time:, value:, page_index:, line_index:, word_index:, } ,... ]
  // console.debug(tempTranscriptedText)
  if (fileLen !== tempTranscriptedText.length) {
    process.stderr.write(`Request: ${pdf_file_path} ${transcript_path}\nErr: Some words weren't matched on the transcript: ${tempTranscriptedText.length} words found but expected ${fileLen}\n\n`);
  }
  return tempTranscriptedText
};

module.exports = {get_transcript, validURL, httpDownload}
