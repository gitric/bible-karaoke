// const { record } = require("./record-frames");
const fs = require("fs");
const path = require("path");
const tempy = require("tempy");
const DataURI = require("datauri").promise;

module.exports = { render };

const fontPlaceholder = "CAPTION_FONT_FAMILY";
const fontSizePlaceholder = "CAPTION_FONT_SIZE";
const fontColorPlaceholder = "CAPTION_FONT_COLOR";
const fontItalicPlaceholder = "CAPTION_FONT_ITALIC";
const fontBoldPlaceholder = "CAPTION_FONT_BOLD";
const bgColorPlaceholder = "BG_COLOR";
const videoSrcPlaceholder = "VIDEO_SRC"
const fallbackFont = "Helvetica Neue, Helvetica, Arial, sans-serif";
const fallbackFontSize = "20pt";
const fallbackFontColor = "#555";
const fallbackFontItalic = "normal";
const fallbackFontBold = "normal";
const fallbackBgColor = "#CCC";
const fallbackVideoSrc = "";

const _ = require("lodash");

// (async function mainIIFE() {
//     try {
//         await render('./src/rendering/lrc.json', './src/rendering/testBG.jpg', false, 'Kayan Unicode');
//     } catch (error) {
//         console.error(error);
//     }
// })();

const workerpool = require('workerpool');
const pool = workerpool.pool(__dirname + '/record-frames.js', { workerType: "thread"});

const os = require('os')
const cpuCount = os.cpus().length;

async function render(timingFilePath, bgType, bgFilePath, bgColor, font, fontColor, fontSize, fontItalic, fontBold, highlightColor, speechBubbleColor, speechBubbleOpacity, notifyEvent) {
    let timingObj = require(timingFilePath);
    let duration = timingObj[timingObj.length - 1].end / 1000;
    let fps = 15;
    // let ffmpegLocation = await setupFfmpeg();
    let htmlContent = await getHtmlPage(timingFilePath, bgType, bgFilePath, bgColor, fps, font, fontColor, fontSize, fontItalic, fontBold, highlightColor, speechBubbleColor, speechBubbleOpacity);

    let outputLocation = tempy.directory();

    // fs.writeFileSync(path.join(outputLocation, "renderedAnimation.html"), htmlContent);
    
    console.log(htmlContent)

    var standardOptions = {
        browser: null, // Optional: a puppeteer Browser instance,
        page: null, // Optional: a puppeteer Page instance,
        // ffmpeg: ffmpegLocation,
        logEachFrame: false,
        output: outputLocation,
        fps,
        frames: Math.round(fps * duration), // duration in seconds at fps (15)
        htmlContent: htmlContent,
        framesBeg:1,
        framesEnd: 100, // change this!
    };

    var allRecords = [];
    var lastBatchFrame = 0;
    var blockSize = Math.floor(standardOptions.frames / cpuCount);
    for (var i=0; i <cpuCount; i++) {
        var options = _.clone(standardOptions);
        options.framesBeg = lastBatchFrame + 1;
        options.framesEnd = lastBatchFrame + blockSize;
        // if this is our last run, then pass on all the remaining frames:
        if (i+1 == cpuCount) {
            options.framesEnd = options.frames;
        }
        lastBatchFrame = options.framesEnd;
        allRecords.push(pool.exec('record', [options]))
    }

    // now watch for the files to show up and report back to Interface progress
    function watch() {
        console.log("pool stats:", pool.stats());
        console.log("isMainThread:", pool.isMainThread);
        fs.readdir(outputLocation, (err, files) => {
            if (err) {
                console.error(err);
                return;
            }
            notifyEvent.emit("rendered", { curr: files.length, total: standardOptions.frames });
        })
    }
    var watchInterval = setInterval(watch, 1000);

    await Promise.all(allRecords)
    .then(()=>{
        return pool.terminate();
    });
    clearInterval(watchInterval);
    return outputLocation;
}

async function getHtmlPage(timingFilePath, bgType, bgFilePath, bgColor, fps, font, fontColor, fontSize, fontItalic, fontBold, highlightColor, speechBubbleColor, speechBubbleOpacity) {
    let htmlContent = fs.readFileSync(path.join(__dirname, "render.html"), {
        encoding: "utf-8"
    });
    let timings = JSON.stringify(require(timingFilePath), null, 4); // fs.readFileSync(timingFilePath, { encoding: "utf-8" });
    let backgroundDataUri = null;
    if (bgFilePath && bgType == "image") {
        backgroundDataUri = await DataURI(bgFilePath);
    }
    if (fontItalic) {
        fontItalic = "italic";
    } else {
        fontItalic = "normal";
    }
    if (fontBold) {
        fontBold = "bold";
    } else {
        fontBold = "normal";
    }
    return htmlContent
        .replace(
            "<!-- replaced-HACK -->",
            `
    <script>
        let fps = ${fps};
        let timing = ${timings};
        let backgroundDataUri = '${backgroundDataUri}';
        let backgroundVideoUrl = '${bgFilePath}';
        let highlightColor = '${highlightColor}';
        let speechBubbleColor = '${speechBubbleColor}';
        let speechBubbleOpacity = '${speechBubbleOpacity}';
        let backgroundType = '${bgType}';
        let bgFilePath = '${bgFilePath}';
        window.onload = function () {
            window.afterLoadKar(timing, backgroundDataUri, fps, backgroundType, backgroundVideoUrl, highlightColor, speechBubbleColor, speechBubbleOpacity);
        }
    </script>
    `
        )
        .replace(fontPlaceholder, font || fallbackFont)
        .replace(fontSizePlaceholder, fontSize + "pt" || fallbackFontSize)
        .replace(fontColorPlaceholder, fontColor || fallbackFontColor)
        .replace(fontItalicPlaceholder, fontItalic || fallbackFontItalic)
        .replace(fontBoldPlaceholder, fontBold || fallbackFontBold)
        .replace(bgColorPlaceholder, bgColor || fallbackBgColor)
        .replace(videoSrcPlaceholder, bgFilePath || fallbackVideoSrc);
}
