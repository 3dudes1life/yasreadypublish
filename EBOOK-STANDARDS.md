# Ebook Store Standards — v1.0.6 Reference

Verified against retailer guidance during the 1.0.6 build on 2026-08-21. Retailer rules can change; re-check before major releases.

## Amazon Kindle / KDP

- A working logical TOC is required for Kindle books with chapters/sections.
- Amazon strongly recommends a visible HTML/EPUB TOC near the beginning.
- EPUB 3 navigation documents (`nav epub:type="toc"`) are the preferred logical-navigation mechanism; NCX remains supported.
- The navigation document must be in the OPF spine if it should appear as an in-book Contents page.
- Landmarks can expose the Contents location in Kindle navigation.
- Kindle ebooks require an internal content cover image.
- Amazon warns against adding a duplicate HTML cover page in addition to the cover image.

Official references:
- https://kdp.amazon.com/en_US/help/topic/G201605710
- https://kdp.amazon.com/en_US/help/topic/GY3AD8C6C6GAG42N
- https://kdp.amazon.com/en_US/help/topic/G6GTK3T3NUHKLEFX

## Apple Books

- EPUB 3 navigation documents use HTML5 `nav` elements and `epub:type`.
- The main TOC is required for all books.
- Interior EPUB images, including an internal cover image, cannot exceed 5.6 million pixels.
- External/store cover artwork should be high quality and at least 1400px on the shorter axis.

Official references:
- https://help.apple.com/itc/booksassetguide/en.lproj/itc0f175a5b9.html
- https://help.apple.com/itc/booksassetguide/en.lproj/itc1bda991ba.html
- https://help.apple.com/itc/booksassetguide/en.lproj/itca71ad3c33.html

## Kobo Writing Life

- Reflowable EPUB is preferred for normal novels.
- Correctly structured chapter headings enable built-in navigation.
- A linked in-book Contents page is optional but supported/useful.
- Kobo explicitly recommends removing fixed page numbers from an ebook TOC.
- Validate and test EPUB files, including built-in TOC and Contents links.

Official references:
- https://kobowritinglife.zendesk.com/hc/en-us/articles/360059385611-EPUB-Best-Practices
- https://kobowritinglife.zendesk.com/hc/en-us/articles/360058975512-Word-Doc-Conversion-Guidelines
- https://kobowritinglife.zendesk.com/hc/en-us/articles/360058976112-Validating-and-Testing-Your-eBooks

## Google Play Books

- Google accepts EPUB 3.3, EPUB 3, and EPUB 2; EPUB 3.3 is preferred.
- Google supports rendering the EPUB 3 `toc nav`.
- The EPUB must contain the front cover image for sale.
- Separate cover files have a 640px minimum resolution on the shortest side.
- Google recommends validating EPUB files with EPUBCheck.

Official references:
- https://support.google.com/books/partner/answer/3316879
- https://support.google.com/books/partner/answer/3424254

## B&N Press / NOOK

- NOOK uses reflowable EPUB.
- B&N’s published formatting guide describes OPF/NCX navigation and recommends a linked Contents page for ebook navigation.
- The guide says blank pages should be avoided.
- B&N’s guide also recommends testing/validation and complete manifest/spine organization.

Official reference:
- https://help-press.barnesandnoble.com/hc/en-us/articles/46990297345691-B-N-Press-ePub-Formatting-Guide-for-eBooks

## YasReady 1.0.6 universal policy

To create one conservative novel EPUB for these stores, YasReady uses:

- reflowable EPUB 3
- visible linked Contents before Chapter 1
- EPUB 3 logical `toc nav`
- legacy NCX
- TOC + Begin Reading landmarks
- no fixed ebook page numbers
- embedded internal front cover as `cover-image`
- no duplicate HTML cover page
- complete title/author/publisher/language metadata
- exact Story Lock source coverage

Retailer-specific marketing cover upload and metadata entry remain separate storefront tasks.
