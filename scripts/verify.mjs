import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const required = [
  'index.html', 'src/main.js', 'src/styles/app.css', 'src/lib/docx-parser.js', 'src/lib/hash.js',
  'src/lib/project.js', 'src/lib/project-store.js', 'src/lib/print-model.js', 'src/lib/structure-model.js',
  'src/lib/navigator-model.js', 'src/lib/theme-store.js', 'src/lib/preflight-model.js', 'src/lib/print-export.js',
  'src/lib/ebook-model.js', 'src/lib/ebook-preflight.js', 'src/lib/epub-export.js', 'src/lib/structure-overrides.js',
  'src/lib/print-toc.js', 'src/lib/project-backup.js', 'src/lib/readiness-model.js', 'src/lib/spacing-policy.js',
  'src/lib/editions.js', 'src/lib/print-release-gate.js', 'src/lib/amazon-print-hard-mode.js', 'src/lib/print-matter.js', 'src/lib/print-cover-upload.js', 'src/lib/full-wrap-art.js', 'src/lib/barcode-brain.js', 'src/lib/barcode-cover-stamp.js', 'src/lib/proof-integrity.js', 'src/lib/presentation-overrides.js', 'src/lib/semantic-styles.js', 'src/lib/print-brain.js', 'src/lib/print-pdf.js', 'src/lib/cover-brain.js', 'src/lib/cover-pdf.js',
  'src/lib/kindle-preview-model.js', 'src/lib/kindle-quality.js', 'src/lib/kindle-intelligence.js',
  'src/lib/kindle-production-flow.js', 'src/lib/epub-audit.js', 'src/lib/ebook-theme-studio.js', 'src/lib/kindle-release-gate.js', 'src/lib/bug-log.js', 'src/lib/book-brain.js', 'public/vendor/jszip.min.js',
  'STORY-LOCK-SPEC.md', 'KDP-PREFLIGHT.md', 'EPUB-PREFLIGHT.md', 'KINDLE-STANDARDS.md', 'RELEASE-QA.md',
];
for (const file of required) if (!existsSync(file)) throw new Error(`Missing required file: ${file}`);

const jsFiles = required.filter((file) => file.endsWith('.js'));
for (const file of jsFiles) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });

const index = readFileSync('index.html', 'utf8');
if (!index.includes('jszip.min.js') || !index.includes('src/main.js') || !index.includes('src/styles/app.css')) {
  throw new Error('index.html is not wired to the self-contained static runtime.');
}
const main = readFileSync('src/main.js', 'utf8');
for (const marker of [
  "const VERSION = '1.0.42'", 'Run Final Check', 'Download Project Backup', 'Kindle / eBook', 'Download KDP EPUB',
  'Amazon KDP · Reflowable EPUB 3', 'Kindle Preview Studio', 'Adjust Layout', 'preview-studio-grid-v110',
  'Kindle Pro consistency scan', '3-View Torture Test', '11 pt reference', 'Semantic Style Palette', 'Content style',
  'saveEbookSemanticStyles', 'Kindle Intelligence', 'Compare Chapters', 'compareKindleChaptersButton', 'Undo', 'Redo',
  'Structure Repair', 'generated-toc-entry', 'One Story Lock · separate outputs', 'bodyBlankPolicy',
  'Kindle Production Console · v1.0.14', 'Polish Queue', 'NEXT BEST ACTION', 'ebookNavigatorSearch',
  'data-kindle-command', 'data-kindle-review-source', 'data-inspector-preset', 'Focus Preview',
]) {
  if (!main.includes(marker)) throw new Error(`1.0.27 production workspace is missing: ${marker}`);
}
const printModel = readFileSync('src/lib/print-model.js', 'utf8');
if (!printModel.includes("tocTitle: 'Table of Contents'") || !printModel.includes('printToc: true') || !printModel.includes("tocStartSide: 'left'") || !printModel.includes('paragraphGap: 0.12,') || !printModel.includes("bodyBlankPolicy: 'collapse'")) {
  throw new Error('Book 1 print/TOC/spacing defaults are missing.');
}
const buttonIds = [...main.matchAll(/<button\b[^>]*\s+id="([^"]+)"/g)].map((match) => match[1]);
const boundIds = new Set([...main.matchAll(/querySelector\(['"]#([^'"]+)['"]\)/g)].map((match) => match[1]));
const unboundButtons = [...new Set(buttonIds)].filter((id) => !boundIds.has(id));
if (unboundButtons.length) throw new Error(`Unbound literal button(s): ${unboundButtons.join(', ')}`);
for (const dynamicBinding of [
  '[data-go-view]','[data-open-project]','[data-delete-project]','[data-nav-page]','[data-ebook-section]','[data-repair-block]',
  '[data-apply-theme]','[data-export-theme]','[data-delete-theme]','[data-edition-enabled]','[data-work-edition]',
  '[data-kindle-mode]','[data-kindle-pref-key]','[data-quality-section]','[data-intelligence-section]','[data-intelligence-fix]',
  '[data-kindle-command]','[data-polish-section]','[data-kindle-review-source]','[data-inspector-preset]',
  '[data-simple-step]','[data-simple-target]','[data-continue-print]','[data-bug-status]','[data-bug-delete]','[data-book-brain-decision]','[data-quality-action]',
]) {
  if (!main.includes(`querySelectorAll('${dynamicBinding}')`) && !main.includes(`querySelectorAll("${dynamicBinding}")`)) throw new Error(`Missing dynamic control binding: ${dynamicBinding}`);
}

const project = readFileSync('src/lib/project.js', 'utf8');
if (!project.includes("appVersion: '1.0.42'") || !project.includes('version: 37') || !project.includes('ensureEditions(project)') || !project.includes('ensurePresentationOverrides(project)')) {
  throw new Error('Project app version was not migrated to 1.0.42 Cover Engine v11 state.');
}
const editions = readFileSync('src/lib/editions.js', 'utf8');
if (!editions.includes('reviewDecisions:')) throw new Error('Edition normalization does not preserve Kindle review decisions.');

if (!editions.includes("['choose','upload-pdf','upload-art','build']") || !editions.includes('uploadedCoverArt')) throw new Error('1.0.37 edition normalization can drop full-wrap artwork intake state.');
const productionFlow = readFileSync('src/lib/kindle-production-flow.js', 'utf8');
for (const marker of ['buildKindleProductionFlow','markKindleReviewIntentional','kindleReviewDecision','buildKindlePolishQueue']) {
  if (!productionFlow.includes(marker)) throw new Error(`Kindle Production Flow is missing: ${marker}`);
}
const epub = readFileSync('src/lib/epub-export.js', 'utf8');
for (const marker of ['epub:type="landmarks"','properties="cover-image"','itemref idref="visible-toc"','text/contents.xhtml','<guide>','Table of Contents']) {
  if (!epub.includes(marker)) throw new Error(`Kindle EPUB hardening is missing: ${marker}`);
}
for (const marker of ['chapter-layout-${layout}','chapter-label','chapter-name','splitChapterHeading']) {
  if (!epub.includes(marker)) throw new Error(`1.0.22 Kindle chapter renderer is missing: ${marker}`);
}
const audit = readFileSync('src/lib/epub-audit.js', 'utf8');
for (const marker of ['auditEpubPackage','audit-preview-leak','audit-cover','detectEbookPlaceholders']) if (!audit.includes(marker)) throw new Error(`Finished EPUB audit is missing: ${marker}`);
for (const marker of ['audit-amazon-no-hidden-css','audit-amazon-body-defaults','audit-amazon-percent-margins','audit-amazon-hidden-text','audit-amazon-html-size','audit-amazon-images','audit-amazon-tables','audit-amazon-hyperlinks','audit-amazon-lists']) if (!audit.includes(marker)) throw new Error(`Amazon Hard Mode audit is missing: ${marker}`);
const quality = readFileSync('src/lib/kindle-quality.js', 'utf8');
for (const marker of ['scanKindleQuality','enhancedTypesettingAudit','kindleTorturePresets','semanticRoleCounts']) if (!quality.includes(marker)) throw new Error(`Kindle Pro QA is missing: ${marker}`);
const semantic = readFileSync('src/lib/semantic-styles.js', 'utf8');
for (const marker of ['EBOOK_SEMANTIC_ROLES','semanticRoleForBlock','semanticRoleCounts']) if (!semantic.includes(marker)) throw new Error(`Kindle semantic style engine is missing: ${marker}`);
const intelligence = readFileSync('src/lib/kindle-intelligence.js', 'utf8');
for (const marker of ['scanKindleIntelligence','compareKindleChapters','applyKindleIntelligenceFix']) if (!intelligence.includes(marker)) throw new Error(`Kindle Intelligence engine is missing: ${marker}`);
if (!main.includes('const ebookIntelligence = scanKindleIntelligence(state.project);') || !main.includes('ebookReport.ready && ebookQuality.ready && ebookIntelligence.ready')) {
  throw new Error('Final Check does not include Kindle Intelligence in the release gate.');
}
const themeStudio = readFileSync('src/lib/ebook-theme-studio.js', 'utf8');
for (const marker of ['EBOOK_THEME_FAMILIES','normalizeEbookThemeStudio','applyEbookThemeFamily','calculateBookDNA','ebookStyleUsage','sourceStyleRecords']) {
  if (!themeStudio.includes(marker)) throw new Error(`Theme Studio engine is missing: ${marker}`);
}
for (const marker of ['Theme Studio · v1.0.15','Style Gallery','Smart Word Style Mapper','Show me every place using this style','Book DNA']) {
  if (!main.includes(marker)) throw new Error(`Theme Studio UI is missing: ${marker}`);
}
for (const marker of ['theme-artwork','paragraph-after-break','semantic-list',"design.textMessageStyle === 'left-right'"]) {
  if (!epub.includes(marker)) throw new Error(`Theme Studio EPUB renderer is missing: ${marker}`);
}
for (const marker of ['Step 1 · Book','Step 2 · Style','Step 3 · Preview','Step 4 · Export','Advanced Tools','simpleKindleExport','simpleBookStyle']) {
  if (!main.includes(marker)) throw new Error(`1.0.27 Simple Mode is missing: ${marker}`);
}
for (const marker of ['chapterTopEm: 8.0','chapterAfterEm: 5.5']) {
  if (!readFileSync('src/lib/ebook-model.js', 'utf8').includes(marker)) throw new Error(`1.0.22 Book 1 Kindle rhythm is missing: ${marker}`);
}
if (!themeStudio.includes("chapterTitleAlignment:'center', chapterTopEm:8.0, chapterAfterEm:5.5,")) throw new Error('1.0.22 Tres Amigos preset is not tuned to the Book 1 Kindle rhythm.');

const releaseGate = readFileSync('src/lib/kindle-release-gate.js', 'utf8');
for (const marker of ['buildKindleReleaseGate','auditKindleAccessibility','applySafeFixBatch','markKindleVisualProofComplete','freezeKindleRelease','kindleReleaseReport']) {
  if (!releaseGate.includes(marker)) throw new Error(`Kindle Release Gate is missing: ${marker}`);
}
for (const marker of ['Amazon Hard Mode · v1.0.27','Apply all safe fixes','Mark current reviews intentional','Mark visual proof complete','Lock EPUB build','Download Amazon report','NEXT AMAZON ACTION','Confirm Previewer opened','Confirm Enhanced Typesetting']) {
  if (!main.includes(marker)) throw new Error(`1.0.16 Release Gate UI is missing: ${marker}`);
}
if (!main.includes('🐞 Bug Log') || !main.includes('data-bug-status') || !project.includes("studio.chapterDivider = 'none'")) throw new Error('1.0.22 bug log or Tres Amigos divider hotfix is missing.');
for (const marker of ['usesTresAmigosMatterMatch','matter-book1-title','matter-book1-copyright','matter-book1-dedication']) {
  if (!epub.includes(marker)) throw new Error(`1.0.22 Book 1 front-matter match is missing: ${marker}`);
}
for (const marker of ['What are you making?','Nothing is assumed after upload','Continue with Paperback','Continue with Hardcover','lastExportedEdition']) {
  if (!main.includes(marker)) throw new Error(`1.0.24 format-first workflow is missing: ${marker}`);
}
for (const marker of ['margin:0 0 1.75em','margin-bottom:2em']) {
  if (!epub.includes(marker)) throw new Error(`1.0.24 dedication spacing is missing: ${marker}`);
}
if (!project.includes('paperback: { enabled: false }') || !project.includes('ebook: { enabled: false }')) throw new Error('1.0.24 new-project edition defaults are not opt-in.');
const brain = readFileSync('src/lib/book-brain.js', 'utf8');
for (const marker of ['analyzeBookBrain','applyBookBrain','bookBrainReviewItems','decideBookBrainInterpretation','BOOK_BRAIN_AUTO_THRESHOLD']) if (!brain.includes(marker)) throw new Error(`Book Brain engine is missing: ${marker}`);
for (const marker of ['BOOK BRAIN','YasReady understood the book.','Review ${reviews.length}','Analyze again']) if (!main.includes(marker)) throw new Error(`Book Brain Simple Mode UI is missing: ${marker}`);
if (!project.includes('applyBookBrain(project)') || !readFileSync('src/lib/ebook-model.js','utf8').includes('bookBrainMatterStart')) throw new Error('Book Brain is not wired into import/migration and ebook sections.');

const printBrain = readFileSync('src/lib/print-brain.js', 'utf8');
for (const marker of ['PRINT_BRAIN_VERSION','printTrimOptions','normalizePrintProduction','printEligibility','applyPrintBrainToDesign']) {
  if (!printBrain.includes(marker)) throw new Error(`Print Brain engine is missing: ${marker}`);
}
for (const marker of ['PRINT BRAIN · v1.0.37','Use Recommended','Save & style the book','data-quality-action','PRINT PDF HARD MODE · v1.0.29','Build ${escapeHtml(editionLabel(currentPrintEditionType()))} PDF']) {
  if (!main.includes(marker)) throw new Error(`1.0.28 Print Brain / actionable QA UI is missing: ${marker}`);
}
if (!readFileSync('src/lib/book-brain.js','utf8').includes('outsideKnownBody')) throw new Error('1.0.28 Book Brain boundary guard is missing.');
if (!readFileSync('src/lib/kindle-quality.js','utf8').includes('effectiveStats(project).chapters')) throw new Error('1.0.28 Kindle QA still compares against frozen parser chapter counts.');

const printPdf = readFileSync('src/lib/print-pdf.js','utf8');
for (const marker of ['renderProductionPrintPdf','buildRasterPdf','auditPrintPdfBytes','PRINT_PDF_DPI = 300','/MediaBox','/DCTDecode']) if (!printPdf.includes(marker)) throw new Error(`1.0.29 Print PDF Hard Mode is missing: ${marker}`);
for (const marker of ['PRINT_PDF_VERSION = 4','auditPrintFrontMatterManifest','content-fidelity','runsForLocalRange','rasterContentInkEvidence']) {
  if (!printPdf.includes(marker)) throw new Error(`1.0.38 Print Fidelity Recovery is missing: ${marker}`);
}
const preflightV138 = readFileSync('src/lib/preflight-model.js', 'utf8');
for (const marker of ['intentional-blank-content','front-matter-sequence']) {
  if (!preflightV138.includes(marker)) throw new Error(`1.0.38 front-matter preflight guard is missing: ${marker}`);
}
if (!main.includes('certifiedProofSignature') || !main.includes('liveProofSignature')) {
  throw new Error('1.0.38 persistent interior certification is missing.');
}
if (main.includes('const preflightForCover = currentPreflight(false);')) {
  throw new Error('1.0.38 cover manufacture still contains the false Story-Lock preflight bug.');
}
const projectV140 = readFileSync('src/lib/project.js','utf8');
for (const marker of ['isAppVersionBefore', "isAppVersionBefore(priorAppVersion, '1.0.38')", "isAppVersionBefore(priorAppVersion, '1.0.39')", "isAppVersionBefore(priorAppVersion, '1.0.40')"]) if (!projectV140.includes(marker)) throw new Error(`1.0.40 migration guard missing: ${marker}`);
if (projectV140.includes("if (priorAppVersion !== '1.0.38')") || projectV140.includes("if (priorAppVersion !== '1.0.39')")) throw new Error('Non-monotonic print migration guard remains.');

const coverBrain = readFileSync('src/lib/cover-brain.js', 'utf8');
for (const marker of ['coverGeometry','coverBrainChecks','paperbackSpineWidth','hardcoverGeometryConfirmed','0.0025','0.51','0.4','0.635']) if (!coverBrain.includes(marker)) throw new Error(`1.0.30 Cover Brain is missing: ${marker}`);
const coverPdf = readFileSync('src/lib/cover-pdf.js', 'utf8');
for (const marker of ['renderCoverPdf','buildRasterPdf','auditPrintPdfBytes','AMAZON BARCODE RESERVED']) if (!coverPdf.includes(marker)) throw new Error(`1.0.30 Cover PDF pipeline is missing: ${marker}`);
for (const marker of ['COVER BRAIN + BARCODE BRAIN · v1.0.37','buildCoverPdf','Save Cover Brain']) if (!main.includes(marker)) throw new Error(`1.0.30 Cover Brain UI is missing: ${marker}`);
for (const marker of ['renderBackMatterFeatureSection','matter-about-authors','matter-join-journey','sanitizeKindleProductionXhtml','sanitizeKindleProductionCss']) {
  if (!epub.includes(marker)) throw new Error(`1.0.32 Kindle back-matter/package repair is missing: ${marker}`);
}
if (!main.includes('Rebuild package') || !main.includes("data-quality-action=\"package-rebuild\"")) throw new Error('1.0.32 actionable Kindle package QA is missing.');
const bookBrain = readFileSync('src/lib/book-brain.js', 'utf8');
for (const marker of ['BOOK_BRAIN_VERSION = 2','about-authors','join-journey','backMatterInterpretations']) if (!bookBrain.includes(marker)) throw new Error(`1.0.32 Book Brain back-matter marker missing: ${marker}`);


const fullWrapArt = readFileSync('src/lib/full-wrap-art.js', 'utf8');
for (const marker of ['analyzeFullWrapArtwork','renderFullWrapArtworkPdf','planSeamlessSpineExpansion','computeSpineColumnEnergy','buildContentAwareStretchMap','analyzeSpineRasterQuality','Seamless spine expansion','wrap-art-seam-audit','wrap-art-horizontal-banding','wrap-art-periodic-repetition','Full-wrap artwork resolution']) {
  if (!fullWrapArt.includes(marker)) throw new Error(`1.0.37 Full-Wrap Artwork Adapter is missing: ${marker}`);
}
for (const marker of ['FULL_WRAP_ART_VERSION = 11','protectedContentMask:true','protectedPixelFraction','neutralHighDetail']) {
  if (!fullWrapArt.includes(marker)) throw new Error(`1.0.37 Cover Engine v8 protected-background guard is missing: ${marker}`);
}
const v8Preflight = readFileSync('src/lib/preflight-model.js','utf8');
for (const marker of ['isExpectedStructuralEmptyPage','barcodeSpacer','generated structural spacer page(s) are intentionally content-free for final-page parity']) {
  if (!v8Preflight.includes(marker)) throw new Error(`1.0.37 structural parity-spacer guard is missing: ${marker}`);
}
for (const marker of ["interiorCurrentForCover","export-simple","Build the current interior PDF first"]) {
  if (!main.includes(marker)) throw new Error(`1.0.37 deterministic print production path is missing: ${marker}`);
}
for (const marker of ['FULL-WRAP ARTWORK ADAPTER · v1.0.37','upload-art','printFullWrapArtInput','renderSimpleFlowDock','simpleFlowDock','Continue to Preview →','Continue to Export →']) {
  if (!main.includes(marker)) throw new Error(`1.0.37 cover intake/navigation UI is missing: ${marker}`);
}
const printMatterV136 = readFileSync('src/lib/print-matter.js', 'utf8');
for (const marker of ['matter-back-heading','matter-back-body',"alignment:'center'", "alignment:'left'"]) {
  if (!printMatterV136.includes(marker)) throw new Error(`1.0.37 back-matter alignment is missing: ${marker}`);
}

for (const marker of ['matterPostDrawAdvance','reconcileBodyAdvance','visibleOverflowDecision','rasterBottomMarginOverflowEvidence','overflowEvidence?.ok === false','PRINT_PDF_VERSION = 4']) {
  if (!printPdf.includes(marker)) throw new Error(`1.0.40 Print PDF visible-overflow guard is missing: ${marker}`);
}
if (printPdf.includes('if (pageFlow?.overflowPx > 1)')) throw new Error('Logical cursor drift is still a production blocker.');
for (const marker of ['FULL_WRAP_ART_VERSION = 11','compositeProtectedSpineArtwork','artworkOnlyOverlay:true','fullNativeCore:false','coverBarcodeBackingPlan','artworkUntouched:true']) {
  if (!fullWrapArt.includes(marker)) throw new Error(`1.0.42 Cover Engine v11 marker is missing: ${marker}`);
}
if (!project.includes('primeDetectedPhysicalIsbn')) {
  throw new Error('1.0.39 ISBN/barcode migration recovery is missing.');
}
if (project.includes("function primeDetectedPhysicalIsbn(project, type='paperback') {\n  ensureEditions(project);")) {
  throw new Error('1.0.39 ISBN helper still re-normalizes editions and can leave stale print state behind.');
}
const barcodeBrainV139 = readFileSync('src/lib/barcode-brain.js','utf8');
for (const marker of ['BARCODE_BRAIN_VERSION = 2','index-2','index+3','conflictPenalty','detectLabeledPrintIsbn']) {
  if (!barcodeBrainV139.includes(marker)) throw new Error(`1.0.39 Barcode Brain v2 marker is missing: ${marker}`);
}

const v142Production=fullWrapArt.slice(
  fullWrapArt.indexOf('function renderSpineContentAware'),
  fullWrapArt.indexOf('export function coverBarcodeBackingPlan'),
);
for(const marker of [
  'FULL_WRAP_ART_VERSION = 11',
  'buildArtworkLockedSpineExtension',
  'selectArtworkLockedSpineCandidate',
  'analyzeArtworkLockedSpineQuality',
  'multi-candidate-2d-phase-quilt',
  'sameRowOnly:false',
  'sourceCoreExact',
]){
  if(!fullWrapArt.includes(marker))throw new Error(`1.0.42 Cover Engine v11 marker missing: ${marker}`);
}
if(!v142Production.includes('selectArtworkLockedSpineCandidate'))throw new Error('v11 production does not perform candidate selection.');
if(v142Production.includes('buildSinglePassEdgeFlowUnderlay(')||v142Production.includes('compositeProtectedSpineArtwork('))throw new Error('legacy reconstruction is still active in production');
if(!project.includes("isAppVersionBefore(priorAppVersion, '1.0.42')"))throw new Error('1.0.42 cover-only migration missing');
const barcodeBrain = readFileSync('src/lib/barcode-brain.js', 'utf8');
for (const barcodeMarker of ['encodeEan13','decodeEan13Bits','barcodeRoundTrip','appendInteriorBarcodePages','barcodePdfVectorCommands','barcodeFingerprint']) {
  if (!barcodeBrain.includes(barcodeMarker)) throw new Error(`1.0.34 Barcode Brain is missing: ${barcodeMarker}`);
}
const barcodeStamp = readFileSync('src/lib/barcode-cover-stamp.js', 'utf8');
for (const barcodeMarker of ['stampBarcodeOnUploadedCoverPdf','PDF_LIB_ESM_URL','pdf-lib@1.17.1']) {
  if (!barcodeStamp.includes(barcodeMarker)) throw new Error(`1.0.34 uploaded-cover barcode stamping is missing: ${barcodeMarker}`);
}
for (const barcodeMarker of ['BARCODE BRAIN · v1.0.37','printBrainIncludeInteriorBarcode','printBrainCoverBarcode','downloadBarcodeSvg','downloadBarcodePng','Stamp barcode + download KDP cover PDF']) {
  if (!main.includes(barcodeMarker)) throw new Error(`1.0.34 Barcode Brain UI is missing: ${barcodeMarker}`);
}
console.log('YasReady Publish v1.0.42 static verification passed.');


const amazonPrintHardMode = readFileSync('src/lib/amazon-print-hard-mode.js', 'utf8');
for (const marker of ['runAmazonPrintHardMode','amazon-page-range','amazon-inside-margin','amazon-outside-margins','amazon-physical-parity','amazon-interior-security','amazon-interior-fonts','amazon-cover-geometry','amazon-cover-images','amazon-barcode-geometry','amazon-no-physical-proof']) {
  if (!amazonPrintHardMode.includes(marker)) throw new Error(`1.0.35 Amazon Paperback Hard Mode is missing: ${marker}`);
}
if (!amazonPrintHardMode.includes('amazon-interior-content-fidelity') || !amazonPrintHardMode.includes('Pending final one-page cover manufacture.')) {
  throw new Error('1.0.38 Amazon Hard Mode does not understand Print Fidelity / pending cover manufacture.');
}
const printGate = readFileSync('src/lib/print-release-gate.js', 'utf8');
for (const marker of ['buildPrintReleaseGate','printReleaseToken','freezePrintRelease','setPrintExternalConfirmation','printReleaseReport','physicalProofResponsibility']) {
  if (!printGate.includes(marker)) throw new Error(`Amazon Print Gate is missing: ${marker}`);
}
if (main.includes('id="confirmPhysicalProof"') || main.includes('Physical proof approved')) throw new Error('1.0.35 must not make physical proof a YasReady release-gate control.');
if (!printGate.includes("PRINT_EXTERNAL_CHECKS = Object.freeze(['kdpPrintPreviewApproved'])")) throw new Error('1.0.35 external print gate must contain only KDP Print Previewer confirmation.');
for (const marker of ['AMAZON PRINT GATE · v1.0.40','Amazon Paperback Hard Mode','Ready for KDP Print Previewer','Confirm KDP Print Previewer','Download Print Gate report','NEXT PRINT ACTION']) {
  if (!main.includes(marker)) throw new Error(`1.0.32 Amazon Print Gate UI is missing: ${marker}`);
}
