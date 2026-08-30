import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const VERSION = '1.0.47';
const PROJECT_APP_VERSION = '1.0.44';

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

const srcJs = walk(join(ROOT, 'src')).filter((p) => p.endsWith('.js'));
const scriptJs = walk(join(ROOT, 'scripts')).filter((p) => p.endsWith('.mjs'));
for (const file of [...srcJs, ...scriptJs]) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });

for (const file of srcJs) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g)) {
    const target = normalize(join(dirname(file), match[1]));
    if (!existsSync(target)) throw new Error(`Broken import in ${file}: ${match[1]}`);
  }
}

const main = readFileSync(join(ROOT, 'src/main.js'), 'utf8');
const project = readFileSync(join(ROOT, 'src/lib/project.js'), 'utf8');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
if (pkg.version !== VERSION) throw new Error(`package.json version is ${pkg.version}, expected ${VERSION}`);
if (!main.includes(`const VERSION = '${VERSION}'`)) throw new Error('main.js version mismatch');
if (!project.includes(`appVersion: '${PROJECT_APP_VERSION}'`) || !project.includes(`project.appVersion = '${PROJECT_APP_VERSION}'`) || !project.includes('version: 37')) throw new Error('project schema appVersion/schema mismatch');

const buttonIds = [...main.matchAll(/<button\b[^>]*\s+id="([^"]+)"/g)].map((m) => m[1]);
const boundIds = new Set([...main.matchAll(/querySelector\(['"]#([^'"]+)['"]\)/g)].map((m) => m[1]));
const unbound = [...new Set(buttonIds)].filter((id) => !boundIds.has(id));
if (unbound.length) throw new Error(`Unbound button IDs: ${unbound.join(', ')}`);
const dynamic = [
  'data-go-view','data-open-project','data-delete-project','data-nav-page','data-ebook-section','data-repair-block',
  'data-apply-theme','data-export-theme','data-delete-theme','data-edition-enabled','data-work-edition','data-kindle-mode',
  'data-kindle-pref-key','data-quality-section','data-intelligence-section','data-intelligence-fix','data-kindle-command',
  'data-polish-section','data-kindle-review-source','data-inspector-preset','data-simple-step','data-simple-target','data-bug-status','data-bug-delete',
];
for (const attr of dynamic) {
  if (main.includes(attr) && !main.includes(`querySelectorAll('[${attr}]')`) && !main.includes(`querySelectorAll("[${attr}]")`)) {
    throw new Error(`Dynamic control family lacks a binding: ${attr}`);
  }
}

for (const file of srcJs) {
  const text = readFileSync(file, 'utf8');
  const forbidden = [/\bfetch\s*\(/, /XMLHttpRequest\b/, /new\s+WebSocket\b/, /navigator\.sendBeacon\b/];
  for (const pattern of forbidden) if (pattern.test(text)) throw new Error(`Network egress primitive found in ${file}: ${pattern}`);
}

for (const marker of [
  'verifyProjectStoryLock','stampPreviewProof','needsTerminalBlankPage','invalidateAllEditionProofs','runFinalCheck',
  'Create / Reset Hardcover from Paperback','focusEbookOnly','ebookCoverInput','shareDevicePreview','applyEbookBlockOverride',
  'updateKindlePreviewPreference','bindKindlePreferenceButtons','refreshEbookInspectorOnly','undoEbookFormatting','redoEbookFormatting',
  'commitLiveEbookOverride','saveEbookSemanticStyles','ebookOverrideSemanticRole','applyKindleIntelligenceFixById',
  'compareKindleChaptersButton','performKindleNextBestAction','toggleKindleReviewDecision','bindKindleKeyboardShortcuts',
  'applyInspectorQuickPreset','toggleKindleFocusPreview','buildKindleProductionFlow','kindleNextBestAction','ebookNavigatorSearch',
]) {
  if (!main.includes(marker)) throw new Error(`Missing release safety marker: ${marker}`);
}

const preflight = readFileSync(join(ROOT, 'src/lib/preflight-model.js'), 'utf8');
for (const marker of ['proof-ownership','even-page-count','top-bottom-margins','KDP trim / manufacturing option','printEligibility']) {
  if (!preflight.includes(marker)) throw new Error(`Missing preflight hardening: ${marker}`);
}
const printBrain = readFileSync(join(ROOT, 'src/lib/print-brain.js'), 'utf8');
for (const marker of ['cream:776','requiredPrintInsideMargin','printEligibility','HARDCOVER_TRIMS','6.14x9.21','8.25x11']) {
  if (!printBrain.includes(marker)) throw new Error(`Missing Print Brain hardening: ${marker}`);
}
const printPdf = readFileSync(join(ROOT, 'src/lib/print-pdf.js'), 'utf8');
for (const marker of ['renderProductionPrintPdf','buildRasterPdf','auditPrintPdfBytes','PRINT_PDF_DPI = 300','KDP_PRINT_FILE_LIMIT_BYTES',"'interactive'"]) {
  if (!printPdf.includes(marker)) throw new Error(`Missing Print PDF Hard Mode marker: ${marker}`);
}
if (!main.includes('PRINT PDF HARD MODE · v1.0.29') || !main.includes('renderProductionPrintPdf')) throw new Error('Print PDF Hard Mode UI/runtime wiring is missing.');


const coverBrain = readFileSync(join(ROOT, 'src/lib/cover-brain.js'), 'utf8');
for (const marker of ['coverGeometry','coverBrainChecks','paperbackSpineWidth','hardcoverGeometryConfirmed']) {
  if (!coverBrain.includes(marker)) throw new Error(`Missing Cover Brain marker: ${marker}`);
}
const coverPdf = readFileSync(join(ROOT, 'src/lib/cover-pdf.js'), 'utf8');
for (const marker of ['renderCoverPdf','buildRasterPdf','auditPrintPdfBytes','reservedForAmazon']) {
  if (!coverPdf.includes(marker)) throw new Error(`Missing Cover PDF marker: ${marker}`);
}
if (!main.includes('COVER BRAIN + BARCODE BRAIN · v1.0.37') || !main.includes('buildCoverPdf')) throw new Error('Cover Brain UI/runtime wiring is missing.');


const printMatter = readFileSync(join(ROOT, 'src/lib/print-matter.js'), 'utf8');
for (const marker of ['buildPrintMatterIndex','printMatterPagePolicy','matter-title-primary','matter-copyright-body','matter-dedication-body']) if (!printMatter.includes(marker)) throw new Error(`Missing v1.0.33 semantic print matter marker: ${marker}`);
const printCoverUpload = readFileSync(join(ROOT, 'src/lib/print-cover-upload.js'), 'utf8');
for (const marker of ['parsePrintCoverPdfBytes','auditUploadedPrintCoverPdf','uploaded-cover-geometry']) if (!printCoverUpload.includes(marker)) throw new Error(`Missing v1.0.33 cover intake marker: ${marker}`);
for (const marker of ['YOUR COVER','printCoverMode','printFullWrapCoverInput','I already have the final KDP PDF','Build my cover in YasReady']) if (!main.includes(marker)) throw new Error(`Missing v1.0.33 print cover UI marker: ${marker}`);

const fullWrapArt = readFileSync(join(ROOT, 'src/lib/full-wrap-art.js'), 'utf8');
for (const marker of ['analyzeFullWrapArtwork','renderFullWrapArtworkPdf','planSeamlessSpineExpansion','computeSpineColumnEnergy','buildContentAwareStretchMap','analyzeSpineRasterQuality','Seamless spine expansion','wrap-art-seam-audit','wrap-art-horizontal-banding','wrap-art-periodic-repetition','Full-wrap artwork resolution']) if (!fullWrapArt.includes(marker)) throw new Error(`Missing v1.0.37 full-wrap artwork adapter marker: ${marker}`);
for (const marker of ['FULL-WRAP ARTWORK ADAPTER · v1.0.37','upload-art','printFullWrapArtInput','renderSimpleFlowDock','simpleFlowDock','Continue to Preview →','Continue to Export →']) if (!main.includes(marker)) throw new Error(`Missing v1.0.37 cover intake/navigation marker: ${marker}`);
for (const marker of ['matter-back-heading','matter-back-body']) if (!printMatter.includes(marker)) throw new Error(`Missing v1.0.37 back-matter alignment marker: ${marker}`);
const barcodeBrain = readFileSync(join(ROOT, 'src/lib/barcode-brain.js'), 'utf8');
for (const marker of ['encodeEan13','decodeEan13Bits','barcodeRoundTrip','appendInteriorBarcodePages','barcodePdfVectorCommands','barcodeFingerprint']) if (!barcodeBrain.includes(marker)) throw new Error(`Missing v1.0.34 Barcode Brain marker: ${marker}`);
const barcodeStamp = readFileSync(join(ROOT, 'src/lib/barcode-cover-stamp.js'), 'utf8');
for (const marker of ['stampBarcodeOnUploadedCoverPdf','pdf-lib@1.17.1']) if (!barcodeStamp.includes(marker)) throw new Error(`Missing v1.0.34 barcode cover stamping marker: ${marker}`);
for (const marker of ['BARCODE BRAIN · v1.0.37','downloadBarcodeSvg','downloadBarcodePng','Prepare Amazon/KDP cover PDF']) if (!main.includes(marker)) throw new Error(`Missing v1.0.34 Barcode Brain UI marker: ${marker}`);
const amazonPrintHardMode = readFileSync(join(ROOT, 'src/lib/amazon-print-hard-mode.js'), 'utf8');
for (const marker of ['runAmazonPrintHardMode','amazon-page-range','amazon-inside-margin','amazon-outside-margins','amazon-physical-parity','amazon-interior-security','amazon-interior-fonts','amazon-cover-geometry','amazon-cover-images','amazon-barcode-geometry','amazon-no-physical-proof']) if (!amazonPrintHardMode.includes(marker)) throw new Error(`Missing v1.0.35 Amazon Paperback Hard Mode marker: ${marker}`);
const printReleaseGate = readFileSync(join(ROOT, 'src/lib/print-release-gate.js'), 'utf8');
for (const marker of ['buildPrintReleaseGate','printReleaseToken','freezePrintRelease','setPrintExternalConfirmation','physicalProofResponsibility']) {
  if (!printReleaseGate.includes(marker)) throw new Error(`Missing Amazon Print Gate marker: ${marker}`);
}
for (const marker of ['AMAZON PRINT GATE · v1.0.40','Amazon Paperback Hard Mode','Confirm KDP Print Previewer','NEXT PRINT ACTION']) {
  if (!main.includes(marker)) throw new Error(`Missing Amazon Print Gate UI marker: ${marker}`);
}


const supermanV139Barcode = readFileSync(join(ROOT, 'src/lib/barcode-brain.js'), 'utf8');
for (const marker of ['index-2','index+3','conflictPenalty']) {
  if (!supermanV139Barcode.includes(marker)) throw new Error(`Missing v1.0.39 ISBN recovery marker: ${marker}`);
}
for (const marker of ['PRINT_PDF_VERSION = 4','matterPostDrawAdvance','reconcileBodyAdvance','visibleOverflowDecision','rasterBottomMarginOverflowEvidence','overflowEvidence?.ok === false']) {
  if (!printPdf.includes(marker)) throw new Error(`Missing v1.0.40 Print PDF flow marker: ${marker}`);
}
if (printPdf.includes('if (pageFlow?.overflowPx > 1)')) throw new Error('Logical cursor drift is still a production blocker.');
for (const marker of ['FULL_WRAP_ART_VERSION = 13','compositeProtectedSpineArtwork','artworkOnlyOverlay:true','fullNativeCore:false','coverBarcodeBackingPlan']) {
  if (!fullWrapArt.includes(marker)) throw new Error(`Missing v1.0.41 Cover Engine marker: ${marker}`);
}
if (!project.includes('primeDetectedPhysicalIsbn')) throw new Error('Missing v1.0.39 project ISBN recovery.');

for (const marker of ['isAppVersionBefore', "isAppVersionBefore(priorAppVersion, '1.0.40')"]) if (!project.includes(marker)) throw new Error(`Missing v1.0.40 migration persistence marker: ${marker}`);
if (project.includes("if (priorAppVersion !== '1.0.38')") || project.includes("if (priorAppVersion !== '1.0.39')")) throw new Error('Current print certification can still be erased by an older migration guard.');

const v141SpineProduction=fullWrapArt.slice(fullWrapArt.indexOf('function renderSpineContentAware'),fullWrapArt.indexOf('export function coverBarcodeBackingPlan'));for(const m of ['FULL_WRAP_ART_VERSION = 13','buildArtworkLockedSpineExtension','analyzeArtworkLockedSpineQuality','sourceCoreExact'])if(!fullWrapArt.includes(m))throw new Error(`Missing v1.0.41 Artwork Lock marker: ${m}`);if(v141SpineProduction.includes('buildSinglePassEdgeFlowUnderlay(')||v141SpineProduction.includes('compositeProtectedSpineArtwork('))throw new Error('Cover Engine v11 is not active');if(!project.includes("isAppVersionBefore(priorAppVersion, '1.0.41')"))throw new Error('Missing v1.0.41 cover-only migration');
const v142SpineProduction=fullWrapArt.slice(
  fullWrapArt.indexOf('function renderSpineContentAware'),
  fullWrapArt.indexOf('export function coverBarcodeBackingPlan'),
);
for(const marker of ['FULL_WRAP_ART_VERSION = 13','selectArtworkLockedSpineCandidate','multi-candidate-2d-phase-quilt','sameRowOnly:false']){
  if(!fullWrapArt.includes(marker))throw new Error(`Missing v1.0.42 Cover Engine v11 marker: ${marker}`);
}
if(!v142SpineProduction.includes('selectArtworkLockedSpineCandidate'))throw new Error('Cover Engine v11 candidate selection is not active.');
if(!project.includes("isAppVersionBefore(priorAppVersion, '1.0.42')"))throw new Error('Missing v1.0.42 cover-only migration.');

const spineDonorAtlasV143 = readFileSync(join(ROOT,'src/lib/spine-donor-atlas.js'),'utf8');
const v143SpineProduction = fullWrapArt.slice(
  fullWrapArt.indexOf('function renderSpineContentAware'),
  fullWrapArt.indexOf('export function coverBarcodeBackingPlan'),
);
for (const marker of ['SPINE_DONOR_ATLAS_VERSION = 13','manufactureProtectedDonorAtlasSpine','rawProtectedPixelsAvailableToQuilter:0','fullSourceCoreCopied:false']) {
  if (!spineDonorAtlasV143.includes(marker)) throw new Error(`Missing v1.0.43 donor-atlas marker: ${marker}`);
}
if (!v143SpineProduction.includes('manufactureProtectedDonorAtlasSpine(')) throw new Error('Cover Engine v13 donor atlas is not active.');
if (v143SpineProduction.includes('selectArtworkLockedSpineCandidate(')) throw new Error('v11 phase quilting is still an active production call.');
if (!project.includes("isAppVersionBefore(priorAppVersion, '1.0.43')")) throw new Error('Missing v1.0.43 cover-only migration.');
if (!main.includes('currentInteriorProofSignature')) throw new Error('Cover engine upgrade cannot reuse certified interior.');

for(const marker of ["barcode.coverPlacement!=='none'",'reservedForAmazon:true','barcodePlaced:false',"backing:'amazon-reserve'"]){
  if(!fullWrapArt.includes(marker)) throw new Error(`Missing v1.0.44 Amazon cover-barcode reserve marker: ${marker}`);
}
const v144BarcodeProduction=fullWrapArt.slice(fullWrapArt.indexOf('const barcode=normalizeBarcodeBrain'),fullWrapArt.indexOf('const jpegBytes='));
if(v144BarcodeProduction.includes('drawBarcodeToCanvas(') || v144BarcodeProduction.includes('barcodePdfVectorCommands(')) throw new Error('Custom retail cover barcode renderer is still active.');
if(!project.includes("isAppVersionBefore(priorAppVersion, '1.0.44')")){
  throw new Error('Missing v1.0.44 cover-only migration.');
}

const epub = readFileSync(join(ROOT, 'src/lib/epub-export.js'), 'utf8');
for (const marker of ['epub:type="landmarks"','properties="cover-image"','itemref idref="visible-toc"','text/contents.xhtml','<guide>']) {
  if (!epub.includes(marker)) throw new Error(`Missing Kindle EPUB marker: ${marker}`);
}
for (const marker of ['usesTresAmigosMatterMatch','matter-book1-title','matter-book1-copyright','matter-book1-dedication']) {
  if (!epub.includes(marker)) throw new Error(`Missing Book 1 front-matter match marker: ${marker}`);
}
const epubAudit = readFileSync(join(ROOT, 'src/lib/epub-audit.js'), 'utf8');
for (const marker of ['auditEpubPackage','audit-preview-leak','audit-cover','detectEbookPlaceholders']) {
  if (!epubAudit.includes(marker)) throw new Error(`Missing finished EPUB audit marker: ${marker}`);
}
for (const marker of ['audit-amazon-no-hidden-css','audit-amazon-body-defaults','audit-amazon-percent-margins','audit-amazon-hidden-text','audit-amazon-html-size','audit-amazon-images','audit-amazon-tables','audit-amazon-hyperlinks','audit-amazon-lists']) if (!epubAudit.includes(marker)) throw new Error(`Missing Amazon Hard Mode marker: ${marker}`);
const ebookModel = readFileSync(join(ROOT, 'src/lib/ebook-model.js'), 'utf8');
if (!ebookModel.includes('matterSectionHeading') || !ebookModel.includes('detectEbookPlaceholders')) throw new Error('Kindle front-matter/placeholder hardening is missing.');
const kindleQuality = readFileSync(join(ROOT, 'src/lib/kindle-quality.js'), 'utf8');
for (const marker of ['scanKindleQuality','enhancedTypesettingAudit','kindleTorturePresets','semanticRoleCounts']) if (!kindleQuality.includes(marker)) throw new Error(`Missing Kindle Pro quality marker: ${marker}`);
for (const marker of ['Kindle Pro consistency scan','3-View Torture Test','referencePt','toggleKindleQaMatrix','Semantic Style Palette','Content style','Kindle Intelligence','Compare Chapters','Kindle Production Console · v1.0.14','Theme Studio · v1.0.15','Style Gallery','Book DNA','Smart Word Style Mapper','Show me every place using this style','Polish Queue','NEXT BEST ACTION','Focus Preview','Amazon Hard Mode · v1.0.27','Apply all safe fixes','Lock EPUB build','NEXT AMAZON ACTION','Confirm Previewer opened','Confirm Enhanced Typesetting','Step 1 · Book','Step 2 · Style','Step 3 · Preview','Step 4 · Export','Advanced Tools','simpleKindleExport']) if (!main.includes(marker)) throw new Error(`Missing Kindle Pro UI marker: ${marker}`);
const themeStudio = readFileSync(join(ROOT, 'src/lib/ebook-theme-studio.js'), 'utf8');
for (const marker of ['EBOOK_THEME_FAMILIES','normalizeEbookThemeStudio','applyEbookThemeFamily','calculateBookDNA','ebookStyleUsage','sourceStyleRecords']) if (!themeStudio.includes(marker)) throw new Error(`Missing Theme Studio marker: ${marker}`);
for (const marker of ['theme-artwork','paragraph-after-break','semantic-list',"design.textMessageStyle === 'left-right'"]) if (!epub.includes(marker)) throw new Error(`Missing Theme Studio EPUB marker: ${marker}`);
const intelligence = readFileSync(join(ROOT, 'src/lib/kindle-intelligence.js'), 'utf8');
for (const marker of ['scanKindleIntelligence','compareKindleChapters','applyKindleIntelligenceFix']) if (!intelligence.includes(marker)) throw new Error(`Missing Kindle Intelligence marker: ${marker}`);
const production = readFileSync(join(ROOT, 'src/lib/kindle-production-flow.js'), 'utf8');
for (const marker of ['buildKindleProductionFlow','buildKindlePolishQueue','markKindleReviewIntentional','kindleReviewDecision']) if (!production.includes(marker)) throw new Error(`Missing Kindle Production Flow marker: ${marker}`);
const editions = readFileSync(join(ROOT, 'src/lib/editions.js'), 'utf8');
if (!editions.includes('uploadedCoverArt') || !editions.includes('upload-art')) throw new Error('Edition normalization can drop v1.0.37 full-wrap artwork state.');
if (!editions.includes('reviewDecisions:')) throw new Error('Edition normalization can drop review decisions.');
const releaseGate = readFileSync(join(ROOT, 'src/lib/kindle-release-gate.js'), 'utf8');
for (const marker of ['buildKindleReleaseGate','auditKindleAccessibility','applySafeFixBatch','markAllCurrentReviewsIntentional','markKindleVisualProofComplete','freezeKindleRelease','kindleReleaseReport']) if (!releaseGate.includes(marker)) throw new Error(`Missing Kindle Release Gate marker: ${marker}`);
const semanticStyles = readFileSync(join(ROOT, 'src/lib/semantic-styles.js'), 'utf8');
for (const marker of ['EBOOK_SEMANTIC_ROLES','semanticRoleForBlock','semanticRoleCounts']) if (!semanticStyles.includes(marker)) throw new Error(`Missing semantic style marker: ${marker}`);
const sourceSpacing = readFileSync(join(ROOT, 'src/lib/source-spacing.js'), 'utf8');
for (const marker of ['sourceStructuredExtraGapIn','sourceStructuredGapEm']) if (!sourceSpacing.includes(marker)) throw new Error(`Missing v1.0.45 Source Fidelity marker: ${marker}`);
const spacingPolicyV146 = readFileSync(join(ROOT, 'src/lib/spacing-policy.js'), 'utf8');
for (const marker of ['v1.0.46 SOURCE FIDELITY','structuredMessageBoundary']) if (!spacingPolicyV146.includes(marker)) throw new Error(`Missing v1.0.46 structured blank fidelity marker: ${marker}`);
const sourceSpacingV147 = readFileSync(join(ROOT, 'src/lib/source-spacing.js'), 'utf8');
for (const marker of ['SOURCE_SPACING_VERSION = 2','sourceStructuredLineHeight','lineTwips']) if (!sourceSpacingV147.includes(marker)) throw new Error(`Missing v1.0.47 hard-line fidelity marker: ${marker}`);
const docxParser = readFileSync(join(ROOT, 'src/lib/docx-parser.js'), 'utf8');
for (const marker of ['footnotes.xml','endnotes.xml','loadMediaAssets','mediaRefs','canonicalizeManuscriptV2']) if (!docxParser.includes(marker)) throw new Error(`Missing semantic import marker: ${marker}`);
if (!main.includes('const ebookIntelligence = scanKindleIntelligence(state.project);') || !main.includes('ebookReport.ready && ebookQuality.ready && ebookIntelligence.ready')) throw new Error('Final Check omits Kindle Intelligence.');


const supermanV138PrintPdf = readFileSync(join(ROOT, 'src/lib/print-pdf.js'), 'utf8');
for (const marker of [
  'PRINT_PDF_VERSION = 4',
  'auditPrintFrontMatterManifest',
  'rasterContentInkEvidence',
  'content-fidelity',
]) {
  if (!supermanV138PrintPdf.includes(marker)) {
    throw new Error(`Missing v1.0.38 Print Fidelity Superman marker: ${marker}`);
  }
}

const supermanV138Preflight = readFileSync(join(ROOT, 'src/lib/preflight-model.js'), 'utf8');
for (const marker of ['intentional-blank-content','front-matter-sequence']) {
  if (!supermanV138Preflight.includes(marker)) {
    throw new Error(`Missing v1.0.38 front-matter Superman marker: ${marker}`);
  }
}

const supermanV138Amazon = readFileSync(join(ROOT, 'src/lib/amazon-print-hard-mode.js'), 'utf8');
if (!supermanV138Amazon.includes('amazon-interior-content-fidelity')) {
  throw new Error('Missing v1.0.38 Amazon content-fidelity gate.');
}

if (main.includes('const preflightForCover = currentPreflight(false);')) {
  throw new Error('v1.0.38 Superman found the impossible false Story-Lock cover gate.');
}
for (const marker of ['certifiedProofSignature','liveProofSignature','interiorCurrentForCover']) {
  if (!main.includes(marker)) {
    throw new Error(`Missing v1.0.38 persistent print certification marker: ${marker}`);
  }
}

const supermanV8Wrap = readFileSync(join(ROOT, 'src/lib/full-wrap-art.js'), 'utf8');
for (const marker of ['FULL_WRAP_ART_VERSION = 13','protectedContentMask:true','protectedPixelFraction','neutralHighDetail']) if (!supermanV8Wrap.includes(marker)) throw new Error(`Missing Cover Engine v9 Superman marker: ${marker}`);
const supermanV8Preflight = readFileSync(join(ROOT, 'src/lib/preflight-model.js'), 'utf8');
for (const marker of ['isExpectedStructuralEmptyPage','barcodeSpacer','final-page parity']) if (!supermanV8Preflight.includes(marker)) throw new Error(`Missing print parity-spacer Superman marker: ${marker}`);
for (const marker of ['interiorCurrentForCover','export-simple','Build the current interior PDF first']) if (!main.includes(marker)) throw new Error(`Missing deterministic print-flow Superman marker: ${marker}`);

console.log(`SUPERMAN AUDIT PASSED · ${VERSION}`);
console.log(`- ${srcJs.length} application JS files syntax/import checked`);
console.log(`- ${new Set(buttonIds).size} literal button IDs audited`);
console.log(`- ${dynamic.length} dynamic control families audited`);
console.log('- no fetch/XHR/WebSocket/sendBeacon manuscript egress paths found');
if (!main.includes('🐞 Bug Log')) throw new Error('Bug Log UI missing.');
console.log('- Simple Mode four-step UX + hidden advanced systems + local Bug Log present');
console.log('- Cover Engine v9 unified background + artwork-only preservation + Barcode Brain structural parity-spacer guard present');
console.log('- proof ownership, edition invalidation, semantic Kindle styles, Theme Studio families/mapping/artwork, exact-token review decisions, keyboard/search/focus workflow, safe note/media import, finished EPUB audit, calibrated preview, chapter anomaly mapping, safe presentation fixes, accessibility audit, batch review/fix workflow, invalidating visual-proof/release freeze tokens, Final Check intelligence, and whole-book QA guards present');
