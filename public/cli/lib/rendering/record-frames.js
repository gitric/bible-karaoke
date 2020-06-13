const puppeteer = require("puppeteer-core");
const chromium = require("chromium");
const path = require("path");
const workerpool = require("workerpool");


function record(options) {

    // chronium.path may or may provide a path in an asar archive.  If it does
    // it is unusable, and we'll attempt to swap it out for the unarchived version
    const chromiumPath = chromium.path.replace('app.asar', 'app.asar.unpacked');

    var browser = null;
    var page = null;
    var outLocation = options.output;
    options.framesBeg = parseInt(options.framesBeg);
    options.framesEnd = parseInt(options.framesEnd);

    return Promise.resolve()
    .then(()=>{
        // NOTE: running puppeteer inside Docker is a PAIN!
        // run with --no-sandbox until a better solution is figured out.
        return puppeteer.launch({
            executablePath: chromiumPath,
            args: ["--no-sandbox", "--disable-setuid-sandbox"]
        }).then((newBrowser)=>{
            browser = newBrowser;
        })
    })
    .then(()=>{
        return browser.newPage()
        .then((newPage)=>{
            page = newPage;
        })
    })
    .then(()=>{
        return preparePage(browser, page, options.htmlContent)
    })
    .then(()=>{
        return new Promise((resolve, reject) =>{

            function doOne(i, cb) {
                if (i > options.framesEnd) {
                    cb();
                } else {

                    renderPage(browser, page, i)
                    .then(()=>{

                        const paddedIndex = `${i}`.padStart(6, "0");
                        let fileName = `frame_${paddedIndex}.png`;
                        return page.screenshot({
                            omitBackground: false,
                            path: path.join(outLocation, fileName)
                        });

                    })
                    .then(()=>{
                        doOne(i+1, cb);
                    })
                }
            }
            doOne(options.framesBeg, (err) => {
                resolve();
            })
        })
    })
    .then(()=>{
        return page.close()
        .then(()=>{
            return browser.close();
        });
    })
    .catch(()=>{
        return page.close()
        .then(()=>{
            return browser.close();
        });
    })

};




// async function record(options) {
//     // chronium.path may or may provide a path in an asar archive.  If it does
//     // it is unusable, and we'll attempt to swap it out for the unarchived version
//     const chromiumPath = chromium.path.replace('app.asar', 'app.asar.unpacked');

//     // NOTE: running puppeteer inside Docker is a PAIN!
//     // run with --no-sandbox until a better solution is figured out.
//     const browser =
//         options.browser ||
//         (await puppeteer.launch({
//             executablePath: chromiumPath,
//             args: ["--no-sandbox", "--disable-setuid-sandbox"]
//         }));
//     const page = options.page || (await browser.newPage());

//     await preparePage(browser, page, options.htmlContent);

//     //   var ffmpegPath = options.ffmpeg || 'ffmpeg';
//     var fps = options.fps || 60;

//     var outLocation = options.output;

//     for (let i = options.frameBeg; i <= options.frameEnd; i++) {
//         // if (options.logEachFrame)
//         //     console.log(
//         //         `[puppeteer-recorder] rendering frame ${i} of ${options.frames}.`
//         //     );

//         await renderPage(browser, page, i);
//         const paddedIndex = `${i}`.padStart(6, "0");
//         let fileName = `frame_${paddedIndex}.png`;
//         let screenshot = await page.screenshot({
//             omitBackground: false,
//             path: path.join(outLocation, fileName)
//         });
//         // if (options.notify) {
//         //     options.notify.emit("rendered", { curr: i, total: options.frames });
//         // }
//     }
//     await browser.close();
//     //   ffmpeg.stdin.end();

//     //   await closed;
// };

async function preparePage(browser, page, htmlContent) {
    await page.setViewport({
        width: 720,
        height: 480
    });
    await page.setContent(htmlContent);
}

function renderPage(browser, page, frame) {
    return page.evaluate((nextFrame) => {
        //executing in browser
        renderNextFrame(nextFrame);
    }, frame)
}

workerpool.worker({
    record
})

const ffmpegArgs = (fps) => [
    "-y",
    "-f",
    "image2pipe",
    "-r",
    `${+fps}`,
    "-i",
    "-",
    "-c:v",
    "libvpx",
    "-auto-alt-ref",
    "0",
    "-pix_fmt",
    "yuva420p",
    "-metadata:s:v:0",
    'alpha_mode="1"'
];

const write = (stream, buffer) =>
    new Promise((resolve, reject) => {
        stream.write(buffer, (error) => {
            if (error) reject(error);
            else resolve();
        });
    });
