// Journal Digital Corpus Reader
// Client-side SPA for searching Swedish newsreel transcripts

const APP_VERSION = '2025.11.22';

// Corpus versions - add new versions here
const CORPUS_VERSIONS = {
    '2025.10.13': {
        doi: '10.5281/zenodo.17340776',
        url: 'https://zenodo.org/api/records/17340776/files/Modern36/journal_digital_corpus-2025.10.13.zip/content',
        date: '2025-10-13'
    },
    '2025.06.04': {
        doi: '10.5281/zenodo.15596192',
        url: 'https://zenodo.org/api/records/15596192/files/Modern36/journal_digital_corpus-2025.06.04.zip/content',
        date: '2025-06-04'
    }
};

const DEFAULT_CORPUS_VERSION = '2025.10.13';
let currentVersion = DEFAULT_CORPUS_VERSION;


// Global state
let corpus = {
    videos: [],
    collections: new Set(),
    years: new Set()
};

let fuseIndex = null;
let currentResults = [];
let searchTerm = '';

// URL state management
function updateURL() {
    const params = new URLSearchParams();

    const query = searchInput.value.trim();
    if (query) params.set('q', query);

    if (document.getElementById('fuzzy-search').checked) {
        params.set('fuzzy', '1');
    }

    const types = Array.from(document.querySelectorAll('input[name="type"]:checked')).map(el => el.value);
    if (types.length === 1) params.set('type', types[0]);

    const collections = Array.from(document.querySelectorAll('input[name="collection"]:checked')).map(el => el.value);
    const allCollections = Array.from(document.querySelectorAll('input[name="collection"]')).map(el => el.value);
    if (collections.length < allCollections.length && collections.length > 0) {
        params.set('collection', collections.join(','));
    }

    if (yearFrom.value) params.set('from', yearFrom.value);
    if (yearTo.value) params.set('to', yearTo.value);

    if (currentVersion !== DEFAULT_CORPUS_VERSION) {
        params.set('version', currentVersion);
    }

    const hash = params.toString();
    history.replaceState(null, '', hash ? '#' + hash : window.location.pathname);
}

function loadFromURL() {
    const hash = window.location.hash.slice(1);
    if (!hash) return;

    const params = new URLSearchParams(hash);

    // Check for version parameter first (before corpus loads)
    if (params.has('version') && CORPUS_VERSIONS[params.get('version')]) {
        currentVersion = params.get('version');
    }

    if (params.has('q')) {
        searchInput.value = params.get('q');
    }

    if (params.has('fuzzy')) {
        document.getElementById('fuzzy-search').checked = true;
    }

    if (params.has('type')) {
        const type = params.get('type');
        document.querySelectorAll('input[name="type"]').forEach(el => {
            el.checked = el.value === type;
        });
    }

    if (params.has('collection')) {
        const collections = params.get('collection').split(',');
        document.querySelectorAll('input[name="collection"]').forEach(el => {
            el.checked = collections.includes(el.value);
        });
    }

    if (params.has('from')) {
        yearFrom.value = params.get('from');
    }

    if (params.has('to')) {
        yearTo.value = params.get('to');
    }

    // Check for video parameter to open viewer
    if (params.has('video')) {
        const videoKey = params.get('video');
        setTimeout(() => {
            const video = corpus.videos.find(v =>
                `${v.collection}/${v.year}/${v.id}` === videoKey
            );
            if (video) showViewer(video);
        }, 100);
    }
}

// DOM elements
const loadingEl = document.getElementById('loading');
const loadingStatus = document.getElementById('loading-status');
const searchContainer = document.getElementById('search-container');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const resultsEl = document.getElementById('results');
const resultsCount = document.getElementById('results-count');
const collectionFilters = document.getElementById('collection-filters');
const yearFrom = document.getElementById('year-from');
const yearTo = document.getElementById('year-to');
const viewerModal = document.getElementById('viewer-modal');
const viewerTitle = document.getElementById('viewer-title');
const closeViewer = document.getElementById('close-viewer');
const intertitleContent = document.getElementById('intertitle-content');
const speechContent = document.getElementById('speech-content');

// Parse SRT content into entries
function parseSRT(content) {
    const entries = [];
    const blocks = content.trim().split(/\n\n+/);

    for (const block of blocks) {
        const lines = block.trim().split('\n');
        if (lines.length >= 2) {
            const match = lines[1]?.match(
                /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/
            );
            if (match) {
                const [, h1, m1, s1, ms1, h2, m2, s2, ms2] = match;
                const start = (+h1 * 3600 + +m1 * 60 + +s1) * 1000 + +ms1;
                const end = (+h2 * 3600 + +m2 * 60 + +s2) * 1000 + +ms2;
                const text = lines.slice(2).join('\n').trim();
                if (text) {
                    entries.push({ start, end, text });
                }
            }
        }
    }
    return entries;
}

// Format milliseconds as timestamp
function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// Load and parse the corpus zip
async function loadCorpus() {
    // Check URL for version before loading
    const hash = window.location.hash.slice(1);
    if (hash) {
        const params = new URLSearchParams(hash);
        if (params.has('version') && CORPUS_VERSIONS[params.get('version')]) {
            currentVersion = params.get('version');
        }
    }

    const versionInfo = CORPUS_VERSIONS[currentVersion];
    loadingStatus.textContent = `Downloading corpus v${currentVersion}...`;

    const response = await fetch(versionInfo.url);
    if (!response.ok) {
        throw new Error(`Failed to load corpus: ${response.status}`);
    }

    const blob = await response.blob();
    loadingStatus.textContent = 'Extracting files...';

    const zip = await JSZip.loadAsync(blob);

    // Group files by video ID
    const videoMap = new Map();
    const files = Object.keys(zip.files).filter(f => f.endsWith('.srt'));

    let processed = 0;
    for (const filepath of files) {
        // Parse path: .../corpus/speech|intertitle/collection/year/file.srt
        const parts = filepath.split('/');
        const corpusIdx = parts.indexOf('corpus');
        if (corpusIdx < 0 || parts.length <= corpusIdx + 4) continue;

        const type = parts[corpusIdx + 1]; // speech or intertitle
        const collection = parts[corpusIdx + 2];
        const year = parts[corpusIdx + 3];
        const filename = parts[parts.length - 1];

        if (type !== 'speech' && type !== 'intertitle') continue;

        const videoId = filename.replace('.srt', '');
        const key = `${collection}/${year}/${videoId}`;

        if (!videoMap.has(key)) {
            videoMap.set(key, {
                id: videoId,
                collection,
                year,
                intertitle: null,
                speech: null
            });
        }

        // Parse SRT content
        const content = await zip.files[filepath].async('string');
        const entries = parseSRT(content);

        if (entries.length > 0) {
            const fullText = entries.map(e => e.text).join(' ');
            videoMap.get(key)[type] = {
                entries,
                text: fullText,
                wordCount: fullText.split(/\s+/).length
            };
        }

        processed++;
        if (processed % 100 === 0) {
            loadingStatus.textContent = `Processing ${processed}/${files.length} files...`;
        }
    }

    // Convert to array and collect metadata
    corpus.videos = Array.from(videoMap.values())
        .filter(v => v.intertitle || v.speech)
        .sort((a, b) => {
            if (a.collection !== b.collection) return a.collection.localeCompare(b.collection);
            if (a.year !== b.year) return a.year.localeCompare(b.year);
            return a.id.localeCompare(b.id);
        });

    for (const video of corpus.videos) {
        corpus.collections.add(video.collection);
        corpus.years.add(video.year);
    }

    // Build Fuse.js index for fuzzy search
    loadingStatus.textContent = 'Building search index...';
    fuseIndex = new Fuse(corpus.videos, {
        keys: [
            { name: 'speech.text', weight: 1 },
            { name: 'intertitle.text', weight: 1 }
        ],
        includeScore: true,
        includeMatches: true,
        threshold: 0.3,
        ignoreLocation: true,
        minMatchCharLength: 3
    });

    initFilters();
    loadFromURL();

    // Display version info
    const currentVersionInfo = CORPUS_VERSIONS[currentVersion];
    document.getElementById('version-info').innerHTML =
        `Corpus v${currentVersion} | DOI: <a href="https://doi.org/${currentVersionInfo.doi}" target="_blank">${currentVersionInfo.doi}</a>`;

    loadingEl.classList.add('hidden');
    searchContainer.classList.remove('hidden');

    // Show initial results
    performSearch();
}

// Initialize filter UI
function initFilters() {
    // Collection checkboxes
    const collections = Array.from(corpus.collections).sort();
    collectionFilters.innerHTML = collections.map(c =>
        `<label><input type="checkbox" name="collection" value="${c}" checked> ${c}</label>`
    ).join(' ');

    // Year dropdowns
    const years = Array.from(corpus.years).sort();
    const yearOptions = years.map(y => `<option value="${y}">${y}</option>`).join('');
    yearFrom.innerHTML = '<option value="">From</option>' + yearOptions;
    yearTo.innerHTML = '<option value="">To</option>' + yearOptions;
}

// Get current filter state
function getFilters() {
    const types = Array.from(document.querySelectorAll('input[name="type"]:checked'))
        .map(el => el.value);
    const collections = Array.from(document.querySelectorAll('input[name="collection"]:checked'))
        .map(el => el.value);
    const fromYear = yearFrom.value;
    const toYear = yearTo.value;

    return { types, collections, fromYear, toYear };
}

// Perform search
function performSearch() {
    const query = searchInput.value.trim();
    searchTerm = query.toLowerCase();
    const filters = getFilters();
    const useFuzzy = document.getElementById('fuzzy-search').checked;

    let results;

    if (query) {
        if (useFuzzy) {
            // Use Fuse.js for fuzzy search
            const fuseResults = fuseIndex.search(query);
            results = fuseResults.map(r => ({
                ...r.item,
                _matches: r.matches,
                _score: r.score
            }));
        } else {
            // Exact search
            const lowerQuery = query.toLowerCase();
            results = corpus.videos.filter(video => {
                const speechMatch = video.speech?.text.toLowerCase().includes(lowerQuery);
                const intertitleMatch = video.intertitle?.text.toLowerCase().includes(lowerQuery);
                return speechMatch || intertitleMatch;
            });
        }
    } else {
        // No query - show all videos
        results = corpus.videos;
    }

    // Apply filters
    currentResults = results.filter(video => {
        // Filter by type
        const hasType = (filters.types.includes('speech') && video.speech) ||
            (filters.types.includes('intertitle') && video.intertitle);
        if (!hasType) return false;

        // Filter by collection
        if (!filters.collections.includes(video.collection)) return false;

        // Filter by year
        if (filters.fromYear && video.year < filters.fromYear) return false;
        if (filters.toYear && video.year > filters.toYear) return false;

        // If searching, check that match is in selected types
        if (query) {
            if (video._matches) {
                // Fuzzy search - check Fuse matches
                const matchInSelected = video._matches.some(m => {
                    if (m.key === 'speech.text' && filters.types.includes('speech')) return true;
                    if (m.key === 'intertitle.text' && filters.types.includes('intertitle')) return true;
                    return false;
                });
                if (!matchInSelected) return false;
            } else {
                // Exact search - check text contains
                const lowerQuery = searchTerm;
                const speechMatch = filters.types.includes('speech') && video.speech?.text.toLowerCase().includes(lowerQuery);
                const intertitleMatch = filters.types.includes('intertitle') && video.intertitle?.text.toLowerCase().includes(lowerQuery);
                if (!speechMatch && !intertitleMatch) return false;
            }
        }

        return true;
    });

    renderResults();
    updateURL();
}

// Create snippet with highlighted matches from Fuse.js
function createSnippet(text, matches, term, maxLength = 200) {
    if (!matches || matches.length === 0) {
        if (!term) {
            return text.slice(0, maxLength) + (text.length > maxLength ? '...' : '');
        }
        // Fallback to simple search
        const lowerText = text.toLowerCase();
        const idx = lowerText.indexOf(term);
        if (idx < 0) {
            return text.slice(0, maxLength) + (text.length > maxLength ? '...' : '');
        }
        const start = Math.max(0, idx - 50);
        const end = Math.min(text.length, idx + term.length + 150);
        let snippet = (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '');
        const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return snippet.replace(regex, '<mark>$1</mark>');
    }

    // Use Fuse.js match indices
    const indices = matches[0].indices;
    if (!indices || indices.length === 0) {
        return text.slice(0, maxLength) + (text.length > maxLength ? '...' : '');
    }

    // Find first match and create context around it
    const [matchStart, matchEnd] = indices[0];
    const contextStart = Math.max(0, matchStart - 50);
    const contextEnd = Math.min(text.length, matchEnd + 150);

    let snippet = text.slice(contextStart, contextEnd);

    // Highlight all matches within the snippet
    let highlighted = '';
    let lastIdx = 0;

    for (const [start, end] of indices) {
        const snippetStart = start - contextStart;
        const snippetEnd = end - contextStart + 1;

        if (snippetStart >= 0 && snippetEnd <= snippet.length) {
            highlighted += snippet.slice(lastIdx, snippetStart);
            highlighted += '<mark>' + snippet.slice(snippetStart, snippetEnd) + '</mark>';
            lastIdx = snippetEnd;
        }
    }
    highlighted += snippet.slice(lastIdx);

    return (contextStart > 0 ? '...' : '') + highlighted + (contextEnd < text.length ? '...' : '');
}

// Render search results
function renderResults() {
    resultsCount.textContent = `${currentResults.length} videos found`;

    if (currentResults.length === 0) {
        resultsEl.innerHTML = '<p class="no-content">No results found</p>';
        return;
    }

    // Limit display for performance
    const displayResults = currentResults.slice(0, 100);

    resultsEl.innerHTML = displayResults.map((video, idx) => {
        const badges = [];
        if (video.speech) badges.push('<span class="badge badge-speech">Speech</span>');
        if (video.intertitle) badges.push('<span class="badge badge-intertitle">Intertitle</span>');

        // Get snippet from matching transcript
        let snippet = '';
        if (searchTerm && video._matches) {
            // Find match in speech or intertitle
            const speechMatch = video._matches.find(m => m.key === 'speech.text');
            const intertitleMatch = video._matches.find(m => m.key === 'intertitle.text');

            if (speechMatch && video.speech) {
                snippet = createSnippet(video.speech.text, [speechMatch], searchTerm);
            } else if (intertitleMatch && video.intertitle) {
                snippet = createSnippet(video.intertitle.text, [intertitleMatch], searchTerm);
            }
        } else {
            const text = video.speech?.text || video.intertitle?.text || '';
            snippet = createSnippet(text, null, '', 150);
        }

        return `
            <div class="result-card" data-index="${idx}">
                <div class="result-header">
                    <div>
                        <div class="result-title">${video.id}</div>
                        <div class="result-meta">${video.collection} / ${video.year}</div>
                    </div>
                    <div class="result-badges">${badges.join('')}</div>
                </div>
                <div class="result-snippet">${snippet}</div>
            </div>
        `;
    }).join('');

    if (currentResults.length > 100) {
        resultsEl.innerHTML += `<p style="text-align: center; color: #666;">Showing first 100 of ${currentResults.length} results</p>`;
    }
}

// Show transcript viewer
function showViewer(video) {
    const baseGitHub = 'https://github.com/Modern36/journal_digital_corpus/blob/main/corpus';

    let titleHTML = `${video.id} - ${video.collection} / ${video.year}`;
    const links = [];
    if (video.intertitle) {
        links.push(`<a href="${baseGitHub}/intertitle/${video.collection}/${video.year}/${video.id}.srt" target="_blank">Intertitle</a>`);
    }
    if (video.speech) {
        links.push(`<a href="${baseGitHub}/speech/${video.collection}/${video.year}/${video.id}.srt" target="_blank">Speech</a>`);
    }
    if (links.length > 0) {
        titleHTML += ` <span class="source-links">[${links.join(' | ')}]</span>`;
    }
    viewerTitle.innerHTML = titleHTML;

    // Update URL with video parameter
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    params.set('video', `${video.collection}/${video.year}/${video.id}`);
    history.replaceState(null, '', '#' + params.toString());

    // Render intertitle
    if (video.intertitle) {
        intertitleContent.innerHTML = video.intertitle.entries.map(entry => `
            <div class="transcript-entry">
                <div class="entry-time">${formatTime(entry.start)} - ${formatTime(entry.end)}</div>
                <div class="entry-text">${highlightText(entry.text, searchTerm)}</div>
            </div>
        `).join('');
    } else {
        intertitleContent.innerHTML = '<p class="no-content">No intertitle transcript</p>';
    }

    // Render speech
    if (video.speech) {
        speechContent.innerHTML = video.speech.entries.map(entry => `
            <div class="transcript-entry">
                <div class="entry-time">${formatTime(entry.start)} - ${formatTime(entry.end)}</div>
                <div class="entry-text">${highlightText(entry.text, searchTerm)}</div>
            </div>
        `).join('');
    } else {
        speechContent.innerHTML = '<p class="no-content">No speech transcript</p>';
    }

    viewerModal.classList.remove('hidden');
}

function highlightText(text, term) {
    if (!term) return text;
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}

function closeViewerModal() {
    viewerModal.classList.add('hidden');

    // Remove video param from URL
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    params.delete('video');
    const newHash = params.toString();
    history.replaceState(null, '', newHash ? '#' + newHash : window.location.pathname);
}

// Event listeners
searchBtn.addEventListener('click', performSearch);
searchInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') performSearch();
});

// Filter changes trigger search
document.querySelector('.filters').addEventListener('change', performSearch);

// Fuzzy toggle triggers search
document.getElementById('fuzzy-search').addEventListener('change', performSearch);

// Result card clicks
resultsEl.addEventListener('click', e => {
    const card = e.target.closest('.result-card');
    if (card) {
        const idx = parseInt(card.dataset.index);
        showViewer(currentResults[idx]);
    }
});

// Close modal
closeViewer.addEventListener('click', closeViewerModal);

viewerModal.addEventListener('click', e => {
    if (e.target === viewerModal) {
        closeViewerModal();
    }
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !viewerModal.classList.contains('hidden')) {
        closeViewerModal();
    }
});

// Initialize
document.getElementById('app-version').textContent = APP_VERSION;

loadCorpus().catch(err => {
    loadingStatus.textContent = `Error: ${err.message}`;
    console.error(err);
});
