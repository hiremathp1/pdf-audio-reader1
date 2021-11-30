# Roadmap
## Primary
- [x] Figure out modules to use
- [x] Canvas drawer to highlight text
- [x] Extract text from pdf
- [x] Highlight position algorithm
- [x] Transcription reader
- [x] Bind props for onPlay, onPlaying, onPause, onEnd and onSeek of media
- [x] Load files from GET url params

## Secondary/Non essential
- [x] Auto focus player at page render, so shortcuts work
- [x] Scroll page with search (This is also used on text transcription highlight)

## Optimizations
- [x] Word highlight changing lag?

## Second phase
- [x] Layout change to side by side pages
- [x] Pdf text alignment backend
- [x] Performance and UI optimization

# PDF Reader

This is a simple pdf viewer that has an audio player embed. The goal is to
highlight the read text as the audio player plays.

This application takes input from 3 files: The pdf itself to be rendered and
highlighted, a timestamped list of the words (a transcription) on the format `{"time":510,"type":"word","start":22,"end":27,"value":"dolls"}` and the audio file from which this transcription was made.

## Resources/Dependencies

The libraries used on this project.

* react-pdf: https://www.npmjs.com/package/react-pdf#standard-browserify-and-others for pdf rendering.
* react-h5-audio-player: https://www.npmjs.com/package/react-h5-audio-player
* https://www.npmjs.com/package/string-similarity --> For thresholding similar words


## How does this work?

1. The frontend make a request to the backend with the text (transcript) url
   and pdf file url. 

2. The backend check if the url is whitelisted (check `backend/.env`) then it
   downloads the pdf file to a temporary folder that can be also set on the
   .env. It will then loop over each page and each pdf line aligning the text
   with the trancript and generating a json object that can be used on the
   frontend to create the highlights. This response is cached on the backend.

3. The frontend then receives this json that is basically a list of wordItem
   objects, each one containing a value (the word itself as a string), a time
   (the time the word plays), a line index and a page index.

4. The frontend then can optionaly use the backend as a proxy for the 3 files
   that are necessary: The text (transcript), the pdf and the audio. The
   backend will store these files on the temporary folder and only download
   them again if they are deleted (based on the filenames).

5. The pdf is then rendered and the audio player loaded. Each audio player
   updates triggers a hook that based on the player's time will search for the
   corresponding wordItem to hightlight.


## Usage

Pass in the url's for the pdf file, the transcript text and the audio as url get parameters:
`audio, text, pdf` if any if missing then a default example will be loaded.

Example:
```
http://your.project.com:3000/?audio=http://10.42.0.1:8000/colibosco.mp3&text=http://10.42.0.1:8000/colibosco.txt&pdf=http://10.42.0.1:8000/colibosco.pdf
```
An optional value offset may also be passed and needed in case the text layer
is not aligned with the pdf canvas. To use this add a `?offset=x,y` to the url
replacing x and y with integers representing the margin-left and margin-top on
this order. This will simply be applied to the `react-pdf__Page__textContent`
class.

Pay attention that if you are using the backend you will need to set the
correct `FILES_HOST` variable on the backend's .env. Scroll down for more info
about that on the backend session.

## Configuration

The `.env` file contains lot of configurations that can be set before building
this project with `npm bui`ld or `yarn build`. They are all commented on the
provided file but it is still recommended to take a look.

The most important ones are:

`REACT_APP_BACKEND_URL` which determines what url the backend is listening on.

`REACT_APP_USE_PROXY` Use the backend's proxy (avoid CORS errors and so on.)

`REACT_APP_MAX_SIDE_BY_SIDE_WIDTH` What is the pixel size to change from side
to side pages to vertical scroll. Might also want to change the media query on
the src/index.css.

## Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app). You might as well replace yarn with npm on the examples bellow.

### Available Scripts

In the project directory, you can run:

#### `yarn start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

#### `yarn build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

#### `yarn serve`

This will build and serve the optimized build on port 5000. You may want to
install serve first with `npm install -g serve`.

### Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

## Backend

This backend can be used as an API, replying the wordItem list as a json over
http, or as a command line tool printing the minified json to stdout.

### Usage

You can run it directly with node:
```
$ node index.js -h


[npm start | node index.js] [pdf_file.pdf] [text] [word_separator?]: Will output transcript to stdout for given pdf and text (list o
f words)
                                                  These 2 arguments can be urls
-s --serve or default with no arguments: starts express server listening on 'PORT' environment variable
-h --help: This help message

```

You can use either url's or file paths for the pdf and transcript text. For
example:

```
$ node index.js ../src/examples/AnansiandthePotofBeans.pdf https://s3.amazonaws.com/audio.lumoslearning.com/read-along-demo/anasi_an
d_the_pot_of_beans.txt
```

That will output the json to stdout that can be output to a file. This is
useful for testing the text alignment or storing json results.

### API
If you simply run it without arguments or with with `npm start` it will work as
an http api. It has 2 endpoints both GET. `/get` is used as a file proxy, but the files
are actually downloaded to the temporary directory and then retrieved. This
endpoint takes one parameter which is `file` but that is actually the URI for
the file and nothe the full URL. This URI will be appended to FILES_HOST. This
is so someone can't spam the api forcing it to donwload random files

This is useful for the backend so that cors errors can be avoided. Keep in mind that unless you clean
the temporary directory the same files will be served even if changed on the
origin.

The other endpoint is `/` which is used to retrieve the json. This endpoint
takes the GET params: `pdf` the pdf file, `text` the transcript and an optional
and experimental `sep` which has to be a url encoded + string encoded regex
expression that will be used to separate words.

You could think that just a simple space is enough as a word separator but on the "AnansiandthePotofBeans"
example there are words that are connected by "..." without any spaces in
between but the transcript text keep them separated, as expected. Those are
problems to keep in mind when throubleshooting why the backend is not finding results for the full
transcript. The frontend is not ready yet to adapt to any word separator.

### Configuration

Default values:
```
PORT=3030  
CACHE_TIME=3600
MIN_SIMILARITY=0.8 
TMP_DIR=/tmp/
FILES_HOST=https://s3.amazonaws.com/
CORS_DOMAIN=*

```
PORT: is the port the application will listen on

CACHE_TIME: time to cache a response

MIN_SIMILARITY: Min similarity between words from https://www.npmjs.com/package/string-similarity

TMP_DIR: Full absolute directory path to store files on. Must exist.

FILES_HOST: Which server to download from.

CORS_DOMAIN: You might want to set this to your frontend origin when things are
ready in production.
