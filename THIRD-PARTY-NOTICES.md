# Third-party notices

## JSZip

YasReady Publish v0.1 vendors JSZip 3.10.1 (`public/vendor/jszip.min.js`) to read DOCX ZIP containers locally in the browser.

JSZip is distributed under the MIT License or GPLv3. Project: https://stuk.github.io/jszip/

## pdf-lib

YasReady Publish v1.0.34 uses pdf-lib 1.17.1 on demand in the browser when an author asks Barcode Brain to stamp a generated ISBN barcode onto an already-designed full-wrap PDF cover. pdf-lib is distributed under the MIT License. Project: https://pdf-lib.js.org/

The library is loaded only for that explicit cover-stamping action. YasReady does not send the manuscript or cover bytes to pdf-lib's CDN; the PDF is edited locally in the browser after the JavaScript library loads.
