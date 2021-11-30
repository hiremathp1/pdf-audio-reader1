import React, {useCallback, useEffect, useLayoutEffect, createRef, useRef, useMemo, useState} from 'react';
import {Document, Page, pdfjs} from 'react-pdf';
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import AudioPlayer from 'react-h5-audio-player';
import 'react-h5-audio-player/lib/styles.css';
const axios = require('axios');

const {proxyUrl} = require('./utils.js')

//Stylesheet
import './index.css';

// Example fallback. You might want to change to an error pdf or something 
//import IpdfFile from './examples/colibosco.pdf';
//import Iaudio from './examples/colibosco.mp3';
//import Itranscript from './examples/colibosco.txt';
//  import IpdfFile from './examples/AnansiandthePotofBeans.pdf';
//  import Iaudio from './examples/anansi_and_the_pot_of_beans.wav';
//  import Itranscript from './examples/anasi_and_the_pot_of_beans.txt';
////////////////////////////////////////////////////////////////////////////////////////////////////

// Adjustments
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL
const LISTEN_INTERVAL = parseInt(process.env.REACT_APP_LISTEN_INTERVAL)
const MIN_SIMILARITY = parseFloat(process.env.REACT_APP_MIN_SIMILARITY)
const WORD_THRESHOLD = parseInt(process.env.REACT_APP_WORD_THRESHOLD)
const FORCE_ALL_WORDS_HIGHLIGHT = parseInt(process.env.REACT_APP_FORCE_ALL_WORDS_HIGHLIGHT)
const MAX_DISTANCE = parseInt(process.env.REACT_APP_MAX_DISTANCE)
const MAX_DELAY_BETWEEN_WORDS = parseInt(process.env.REACT_APP_MAX_DELAY_BETWEEN_WORDS)
const PLAYER_STEP_SIZE = parseInt(process.env.REACT_APP_PLAYER_STEP_SIZE)
const MAX_PLAYER_SPEED_MULTIPLIER = parseInt(process.env.REACT_APP_MAX_PLAYER_SPEED_MULTIPLIER)
const PLAYER_SPEED_STEP = parseFloat(process.env.REACT_APP_PLAYER_SPEED_STEP)
const SCROLL_TO_PAGE = parseInt(process.env.REACT_APP_SCROLL_TO_PAGE)
const MAX_SIDE_BY_SIDE_WIDTH = parseInt(process.env.REACT_APP_MAX_SIDE_BY_SIDE_WIDTH)
var PAGE_WIDTH = .45 // % of page to occupy. This is the default value if no width is passed to the url
const DEFAULT_WORD_SEPARATOR = /\s+|\.\.\.|\.\s|\;|[,\s]+/
////////////////////////////////////////////////////////////////////////////////////////////////////


const options = {
  cMapUrl: `//cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/cmaps/`,
  cMapPacked: true,
};


function clamp(number) {
  return Math.max(PLAYER_SPEED_STEP, Math.min(number, MAX_PLAYER_SPEED_MULTIPLIER));
}

function scrollToHighlight() {
  //// Scroll to highlight
  const el = document.getElementsByClassName('wordHighlight')[0]
  if (el === undefined)
    return;
  //el.scrollIntoView({behavior: 'smooth', block: 'center'})
  el.scrollIntoView()
}


function getQueryParams() {
  return window.location.search.replace('?', '').split('&').reduce((r, e) =>
    (r[e.split('=')[0]] = decodeURIComponent(e.split('=')[1]), r), {}
  );
}


function App() {
  const [pageNumber, setPageNumber] = useState(0);
  const [goBack, setGoBack] = useState(false);

  const [pdfFile, setPdfFile] = useState('');
  const [audio, setAudio] = useState('');
  const [transcript, setTranscript] = useState('');

  const [numPages, setNumPages] = useState(null);
  const [transcriptIndex, setTranscriptIndex] = useState(-1);
  const [lastPos, setLastPos] = useState({page: 0, line: 0});
  const [pagesRendered, setPagesRendered] = useState(0);
  const [transcriptedText, setTranscriptedText] = useState([]);

  const [playerSpeed, setPlayerSpeed] = useState(1);
  const [blockPageReload, setBlockPageReload] = useState(false);

  const [size, setSize] = useState({
    x: window.innerWidth,
    y: window.innerHeight
  });

  const updateSize = () =>
    setSize({
      x: window.innerWidth,
      y: window.innerHeight
    });
  useEffect(() => (window.onresize = updateSize), []);

  const audioPlayer = createRef();


  // Check for url params, if not example is loaded. This is ran only once.
  useEffect(() => {
    const urlParams = getQueryParams();
    if (urlParams.text && urlParams.audio && urlParams.pdf) {
      if (parseInt(process.env.REACT_APP_USE_PROXY)) {
        console.log("Loading proxy files")
        setPdfFile(proxyUrl(urlParams.pdf));
        setAudio(proxyUrl(urlParams.audio));
        setTranscript(proxyUrl(urlParams.text));
      }
      else {
        setPdfFile(urlParams.pdf);
        setAudio(urlParams.audio);
        setTranscript(urlParams.text);
      }
    } else {
      console.error("Params missing. Loading example file");
      setPdfFile(IpdfFile);
      setAudio(Iaudio);
      setTranscript(Itranscript);
    }
  }, []);

  //Load transcript
  useEffect(async () => {
    if (transcript === '')
      return
    if (transcriptedText && transcriptedText.length > 0)
      return

    //Apply offset
    const urlParams = getQueryParams();
    if (urlParams.offset) {
      const [x, y] = urlParams.offset.split(",");
      const textLayer = document.getElementsByClassName("react-pdf__Page__textContent")
      if (!textLayer) return;
      console.log(`Applying offset ${x} ${y}`)
      Array.from(textLayer).forEach(elm => {
        elm.style.marginLeft = x + "px";
        elm.style.marginTop = y + "px";
      });
    }
    if (urlParams.width) {
      const width = Number(urlParams.width);
      if (isNaN(width))
        console.err(`Width parameter is not numeric: width=${urlParams.width}`);
      else {
        PAGE_WIDTH = urlParams.width / 100;
        const top = document.getElementsByClassName("top")[0]
        top.style.width = urlParams + "%"
      }
    };

    const res = await axios.get(`${BACKEND_URL}?pdf=${urlParams.pdf}&text=${urlParams.text}`)
    const data = res.data
    if (!data || data.error || !data.transcript) {
      console.log("The Api communication failed: ", data.error)
      return
    }
    // The goal is to have an array like: [{time:, value:, page_index:, line_index:, word_index:, } ,... ]
    const tempTranscriptedText = data.transcript
    console.log("Received transcript")
    console.log(tempTranscriptedText)
    if (tempTranscriptedText.length > 0) {
      setTranscriptedText(tempTranscriptedText);
      setTranscriptIndex(0);
      setPageNumber(tempTranscriptedText[0].page_index + 1)
      scrollToHighlight()
    }
  }, [pagesRendered]);


  // Scroll when page changes
  useEffect(() => scrollToHighlight(), [lastPos]);

  // Player functions 
  function getPlayerTime() {
    return audioPlayer?.current?.audio.current.currentTime;
  }

  function setPlayerTime(time) {
    const audio = document.getElementsByTagName("audio")[0]
    if (audio === undefined || isNaN(time)) return;
    audio.currentTime = time;
  }

  function getCurrentWordItem() {
    return transcriptedText[transcriptIndex];
  }

  // Change page to corresponding word
  function findCurrentWord() {
    const wordItem = getCurrentWordItem();
    if (!wordItem)
      return
    const number = parseInt(wordItem.page_index / 2) * 2 + 1;
    if (pageNumber != number && !blockPageReload) {
      console.log(`Changing page from ${pageNumber} to ${number}`)
      console.log(blockPageReload)
      setPageNumber(number);
      setLastPos({page: wordItem.page_index, line: wordItem.line_index});
      scrollToHighlight();
    } else if (pageNumber != number)
      setBlockPageReload(false)
    return wordItem;
  }

  useEffect(() => {
    const wordItem = getCurrentWordItem();
    if (!wordItem)
      return
    if (pageNumber != wordItem.page_index + 1 && pageNumber != wordItem.page_index) {
      setGoBack(true)
    } else
      setGoBack(false)
  }, [pageNumber])

  function onAudioUpdate(e, reset = true) {
    const time = getPlayerTime();
    if (time === undefined)
      return;


    //Find word to highlight  [{time:, value:, page_index:, line_index:, word_index:,} ,... ]
    if (reset || transcriptIndex + MAX_DISTANCE > transcriptedText.length - 1) {
      transcriptedText.every((wordItem, index) => {
        if (wordItem.time >= time * 1000 - WORD_THRESHOLD) {
          // Update index and highlight and break out of loop
          if (index !== transcriptIndex) setTranscriptIndex(index);
          return false;
        }
        return true;
      });
      // Enforce highlighting all words
    } else if (transcriptedText[transcriptIndex + 1].time - WORD_THRESHOLD <= time * 1000) {
      if (transcriptedText[transcriptIndex + MAX_DISTANCE].time <= time * 1000) {
        if (transcriptIndex + MAX_DISTANCE !== transcriptIndex) setTranscriptIndex(transcriptIndex + MAX_DISTANCE);
      }
      else
        if (transcriptIndex + 1 !== transcriptIndex) setTranscriptIndex(transcriptIndex + 1);
    }

    const wordItem = findCurrentWord();
    //Scroll if line changed
    if (wordItem) {
      if (SCROLL_TO_PAGE) {
        //// Sroll on page change:
        if (lastPos.page !== wordItem.page_index) {
          setLastPos({page: wordItem.page_index, line: wordItem.line_index});
        }
      } else {
        //// Scroll on line change:
        if (lastLine !== {page: wordItem.page_index, line: wordItem.line_index})
          setLastPos({page: wordItem.page_index, line: wordItem.line_index});
      }
    }

    // Keep player focused for shortcuts
    document.getElementsByClassName("audio-player")[0].focus();
  }

  function onWordClidk(wordItem) {
    if (wordItem) {
      setBlockPageReload(true);
      setPlayerTime(wordItem.time / 1000);
    }
  }

  // TEXT RENDERER
  // Add highliting: Edit lines adding marks around the word to highlight
  var last_line_transform = -1;
  var last_line = -1;
  var last_word_split_length = 0;
  var word_index_offset = 0;
  var second_call = false;

  function makeTextRenderer(textItem) {
    if (textItem === undefined) return;

    //console.debug(`page ${textItem.page._pageIndex} item: ${textItem.itemIndex}: ${textItem.str}`);
    const page_index = textItem.page._pageIndex;
    let line_index = textItem.itemIndex;
    const splitText = textItem.str.split(DEFAULT_WORD_SEPARATOR).filter(e => e);
    const current_line_transform = textItem.transform.slice(-1)[0]

    if (line_index === 0) { // It is a new line
      last_line_transform = current_line_transform;
      last_line = 0;
      word_index_offset = 0;
    } else if (current_line_transform === last_line_transform) { // A eroneous new item that is not a new line
      line_index = last_line;
      if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
        if (!second_call)
          word_index_offset += last_word_split_length;
      } else
        word_index_offset += last_word_split_length;
    } else { // a new item that is a new line
      line_index = last_line + 1;
      last_line = line_index;
      last_line_transform = current_line_transform;
      word_index_offset = 0;
    }
    second_call = !second_call;
    last_word_split_length = splitText.length;
    //console.log(`page: ${page_index}  line_index: ${line_index}  text: ${splitText.join(" ")}  ${last_word_split_length}  ${word_index_offset}`)

    // Loop on every word of the line
    let skip = false;
    return splitText.reduce((arr, element, item_index) => {
      if (skip) {
        skip = false;
        return arr;
      }

      let transcript_index;
      let index = item_index + word_index_offset;

      // Find word to process on the line
      transcriptedText.every((wordItem, windex) => {
        //console.log(`${element}  ${wordItem.value} \n\n${wordItem.line_index} === ${line_index} && ${wordItem.page_index} === ${page_index} && ${wordItem.word_index} === ${index}`)
        if (wordItem.line_index === line_index && wordItem.page_index === page_index && wordItem.word_index === index) {
          transcript_index = windex;
          return false;
        }
        return true;
      });

      const wordItem = Object.assign({}, transcriptedText[transcript_index]);

      if (transcript_index === transcriptIndex) {
        if (wordItem.word_index === index && index === 0) {
          return [...arr, <mark key={'mark_' + index} className="wordHighlight">{wordItem.value} </mark>];
        }
        else if (wordItem.word_index === index && index === splitText.length - 1)
          return [...arr, <mark key={'mark_' + index} className="wordHighlight"> {wordItem.value}</mark>];
        else if (wordItem.word_index === index)
          return [...arr, <mark key={'mark_' + index} className="wordHighlight"> {wordItem.value} </mark>];
      }

      // Else just add click elements
      const elm = <a style={{color: "transparent"}} href={"#" + wordItem.value} onClick={e => onWordClidk(wordItem)}>{element}</a>;

      if (item_index > 0 && arr.slice(-1)[0].type === "a")
        return [...arr, " ", elm];
      else
        return [...arr, elm];
    }, []);
  }

  // Change player speed
  useEffect(() => {
    if (audioPlayer?.current?.audio === undefined) return;
    audioPlayer.current.audio.current.playbackRate = playerSpeed;
    document.getElementsByClassName("audio-player")[0].focus()
  }, [playerSpeed]);

  function onDocumentLoadSuccess({numPages}) {
    setNumPages(numPages);
    setPageNumber(1);
    //focus audio player for shortcuts
    document.getElementsByClassName("audio-player")[0].focus()
  }
  function changePage(offset) {
    document.getElementsByTagName("audio")[0].pause()
    setTimeout(() => {
      setPageNumber(prevPageNumber => prevPageNumber + offset);
    }, 100)
  }
  function previousPage() {
    changePage(-2);
  }

  function nextPage() {
    changePage(2);
  }
  const textRenderer = useCallback(makeTextRenderer, [transcriptIndex]);

  return (
    <div className="App">
      <div className="top">
        <div className="player">
          {/* <h4 className="titlebar">PDF Reader</h4> */}
          <AudioPlayer
            className="audio-player"
            //autoPlay //Maybe you want this?
            ref={audioPlayer}
            listenInterval={LISTEN_INTERVAL}
            src={audio}
            //onPlay={(e) => console.log("Play") || onAudioUpdate}
            //onPause={onAudioUpdate}//(e) =>  console.log("pause") || onAudioUpdate}
            onSeeked={onAudioUpdate}
            onPlay={() => scrollToHighlight()}
            onEnded={() => setTranscriptIndex(transcriptedText.length - 1)}
            onListen={(e) => onAudioUpdate(e, !FORCE_ALL_WORDS_HIGHLIGHT)}

            // UI props: remove loop button, add speed control
            customAdditionalControls={[
              <div id="navigator">
                <p>
                  {pageNumber + '/' + (pageNumber + 1) || (numPages ? 1 : '--')} of {numPages || '--'}
                </p>
              </div>,
              <div id="playback_speed">
                <div>
                  {/* <label className="center" >speed</label> */}
                </div>
                <button onClick={() => setPlayerSpeed(clamp(playerSpeed - PLAYER_SPEED_STEP))}
                  style={{background: "transparent", border: "transparent", cursor: "pointer"}}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" focusable="false" width="2em" height="1em"
                    preserveAspectRatio="xMidYMid meet" viewBox="4 6 36 16"
                    className="rightArrow"
                    style={{background: "transparent", border: "transparent"}}>
                    <path d="M13 6v12l8.5-6M4 18l8.5-6L4 6v12z" fill="currentColor"></path>
                  </svg>
                </button>
                <label>{playerSpeed.toFixed(2)}</label>
                <button onClick={() => setPlayerSpeed(clamp(playerSpeed + PLAYER_SPEED_STEP))}
                  style={{background: "transparent", border: "transparent", cursor: "pointer"}}>
                  <svg xmlns="http://www.w3.org/2000/svg" focusable="false" width="2em" height="1em"
                    preserveAspectRatio="xMidYMid meet" viewBox="4 3 36 16" >
                    <path d="M13 6v12l8.5-6M4 18l8.5-6L4 6v12z" fill="currentColor"></path>
                  </svg>
                </button>
              </div>,

            ]}
            // Jump PLAYER_STEP_SIZE seconds
            progressJumpSteps={{backward: 1000 * PLAYER_STEP_SIZE, forward: 1000 * PLAYER_STEP_SIZE}}
          />
        </div>
      </div>

      <Document
        file={pdfFile}
        onLoadSuccess={onDocumentLoadSuccess}
        options={options}
      >
        {[
          <Page
            pageNumber={pageNumber}
            scale={size.x > MAX_SIDE_BY_SIDE_WIDTH ? PAGE_WIDTH : 1}
            width={size.x}
            key={`page_${pageNumber}`}
            //onRenderSuccess={() => setPagesRendered(pagesRendered + 1)}
            customTextRenderer={textRenderer}
          />,
          <Page
            id="rightPage"
            className="rightPageClass"
            pageNumber={pageNumber + 1}
            scale={size.x > MAX_SIDE_BY_SIDE_WIDTH ? PAGE_WIDTH : 1}
            width={size.x}
            key={`page_${pageNumber + 1}`}
            onRenderSuccess={() => setPagesRendered(pagesRendered + 1)}
            customTextRenderer={textRenderer}
          />
        ]}
      </Document>
      { pageNumber > 1 ?
        <button
          className="navigationButtons buttons"
          type="button"
          id="previousPage"
          disabled={pageNumber <= 1}
          onClick={previousPage}
        >
          <svg className="navigationButtonsSvg" id="prevPageBtn" xmlns="http://www.w3.org/2000/svg" focusable="false" width="1em" height="1em" preserveAspectRatio="xMidYMid meet" viewBox="0 0 16 16"><path d="M1 8a.5.5 0 0 1 .5-.5h11.793l-3.147-3.146a.5.5 0 0 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L13.293 8.5H1.5A.5.5 0 0 1 1 8z" fill="currentColor"></path></svg>
        </button>
        : null}

      { pageNumber + 2 < numPages ?
        <button
          className="navigationButtons buttons"
          type="button"
          id="nextPage"
          onClick={nextPage}
        >
          <svg className="navigationButtonsSvg" id="nextPageBtn" xmlns="http://www.w3.org/2000/svg" focusable="false" width="1em" height="1em" preserveAspectRatio="xMidYMid meet" viewBox="0 0 16 16"><path d="M1 8a.5.5 0 0 1 .5-.5h11.793l-3.147-3.146a.5.5 0 0 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L13.293 8.5H1.5A.5.5 0 0 1 1 8z" fill="currentColor"></path></svg>
        </button>
        : null}


      { goBack ?
        <div id="goBackContainer">
          <button
            type="button"
            id="goBackBtn"
            className="buttons"
            onClick={findCurrentWord}
          >
            <svg style={{color: "red"}} xmlns="http://www.w3.org/2000/svg" focusable="false" width="4em" height="4em" preserveAspectRatio="xMidYMid meet" viewBox="0 0 16 16"><path d="M1.146 4.854a.5.5 0 0 1 0-.708l4-4a.5.5 0 1 1 .708.708L2.707 4H12.5A2.5 2.5 0 0 1 15 6.5v8a.5.5 0 0 1-1 0v-8A1.5 1.5 0 0 0 12.5 5H2.707l3.147 3.146a.5.5 0 1 1-.708.708l-4-4z" fill="currentColor"></path></svg>
            <div className="goBackText">
              Go Back
          </div>
          </button>
        </div>
        : null
      }
    </div>
  );
}

export default App;
