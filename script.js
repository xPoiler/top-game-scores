// Fetches the top games from SteamSpy and ranks them by combined
// Metacritic and user scores. Results are displayed on the page.

// We use a custom Cloudflare Worker as a proxy to fetch data from
// SteamSpy and the Steam store. The worker accepts a `url` query
// parameter and forwards the request while adding CORS headers. To
// construct a proxied request, append `encodeURIComponent(originalUrl)`
// to this base.
const CORS_PROXY = 'https://topgamescorefetcher.xpoileremmo.workers.dev/?url=';

// Helper to fetch JSON through the proxy. Encodes the target URL as the
// `url` query parameter. Throws an error on non‑OK responses.
async function fetchJson(url) {
  const proxied = `${CORS_PROXY}${encodeURIComponent(url)}`;
  const response = await fetch(proxied);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

// Compute user score percentage from positive/negative review counts.
function computeUserScore(positive, negative) {
  const total = positive + negative;
  if (total === 0) return null;
  return (positive / total) * 100;
}

// Global storage for ranked games and candidate games. When a batch of
// candidates is processed, valid games are pushed into `allResults`.
let allResults = [];
let candidateList = [];
let candidateIndex = 0;
let candidatePage = 1;

/**
 * Render the currently loaded ranked games into the game list container.
 * Unlike earlier versions that limited the number of visible games using
 * `displayCount`, this implementation shows all games currently present
 * in `allResults`. It also updates the visibility of the "load more" button
 * depending on whether more candidates remain to be processed.
 */
function renderGames() {
  const listContainer = document.getElementById('game-list');
  listContainer.innerHTML = '';
  // Render every game currently in allResults
  allResults.forEach((game) => {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.innerHTML = `
      <img src="${game.image}" alt="${game.name}" />
      <div class="game-content">
        <h2><span class="rank-badge">#${game.rank}</span><a href="${game.url}" target="_blank" rel="noopener noreferrer">${game.name}</a></h2>
        <div class="scores">
          <span class="metacritic">Metacritic: ${game.metacriticScore}</span>
          <span class="user-score">User: ${game.userScore.toFixed(1)}%</span>
        </div>
      </div>
    `;
    listContainer.appendChild(card);
  });
  // Show or hide the load‑more button depending on whether more candidates remain.
  const loadMoreBtn = document.getElementById('load-more');
  if (loadMoreBtn) {
    if (candidateIndex >= candidateList.length) {
      loadMoreBtn.style.display = 'none';
    } else {
      loadMoreBtn.style.display = 'inline-block';
    }
  }
}

/**
 * Populate search results based on a query string. When a query is
 * provided, the main game list and load more button are hidden and only
 * matching results are shown. When the query is empty, the search
 * results are hidden and the main list is shown again.
 *
 * @param {string} query The user’s search term.
 */
/**
 * Search for games by name. If the query is empty, the main list is shown and
 * the search results are hidden. When a query is provided, this function
 * first searches within the currently loaded results (`allResults`). If no
 * matches are found, it attempts to fetch additional pages from SteamSpy and
 * find games whose names include the query. Only a limited number of pages
 * and results are processed to avoid excessive network load. Found games are
 * ranked relative to the combined list of already loaded results and the
 * search results so that a reasonable rank can be displayed.
 *
 * @param {string} query The user’s search term.
 */
async function searchGames(query) {
  const listContainer = document.getElementById('game-list');
  const loadMoreBtn = document.getElementById('load-more');
  const searchContainer = document.getElementById('search-results');
  if (!searchContainer) return;
  const trimmed = query.trim().toLowerCase();
  // When the query is empty, restore the main list and button.
  if (trimmed === '') {
    searchContainer.style.display = 'none';
    searchContainer.innerHTML = '';
    listContainer.style.display = '';
    // Re-render to update the load more button visibility based on current
    // candidate state.
    renderGames();
    return;
  }
  // Hide the main list and load‑more button while searching.
  listContainer.style.display = 'none';
  if (loadMoreBtn) loadMoreBtn.style.display = 'none';
  searchContainer.style.display = 'block';
  // Show a temporary message while performing the search.
  searchContainer.innerHTML = '<p>Searching… please wait.</p>';
  // First search within the already loaded results.
  const localMatches = allResults.filter((game) => game.name.toLowerCase().includes(trimmed));
  let results = [];
  // If any matches are found locally, we use them directly.
  if (localMatches.length > 0) {
    results = localMatches;
  } else {
    // Otherwise, attempt to find matches by scanning additional pages from SteamSpy.
    const MAX_SEARCH_PAGES = 5; // Limit pages scanned to avoid long searches
    const MAX_SEARCH_RESULTS = 10; // Limit the number of search results returned
    let page = 1;
    while (page <= MAX_SEARCH_PAGES && results.length < MAX_SEARCH_RESULTS) {
      try {
        const pageData = await fetchJson(`https://steamspy.com/api.php?request=all&page=${page}`);
        const entries = Object.values(pageData);
        for (const entry of entries) {
          if (results.length >= MAX_SEARCH_RESULTS) break;
          if (entry.name && entry.name.toLowerCase().includes(trimmed)) {
            try {
              const info = await getGameData(entry.appid);
              if (info) {
                results.push(info);
              }
            } catch (err) {
              console.error(`Error fetching data for search app ${entry.appid}:`, err);
            }
          }
        }
      } catch (err) {
        console.error(`Error loading search page ${page}:`, err);
      }
      page++;
    }
  }
  // Clear previous content
  searchContainer.innerHTML = '';
  if (results.length === 0) {
    searchContainer.innerHTML = '<p>No results found.</p>';
    return;
  }
  // Compute ranks relative to existing results. We create a combined list
  // including the current allResults and the search results, then sort it
  // by combined score descending. Each search result’s rank is determined by
  // its position in this combined list.
  const combinedList = allResults.concat(results);
  combinedList.sort((a, b) => b.combined - a.combined);
  const rankMap = new Map();
  combinedList.forEach((game, idx) => {
    rankMap.set(game.appid, idx + 1);
  });
  // Assign ranks and sort search results by rank ascending.
  const rankedResults = results.map((game) => ({ ...game, rank: rankMap.get(game.appid) })).sort((a, b) => a.rank - b.rank);
  // Render the search results
  rankedResults.forEach((game) => {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.innerHTML = `
      <img src="${game.image}" alt="${game.name}" />
      <div class="game-content">
        <h2><span class="rank-badge">#${game.rank}</span><a href="${game.url}" target="_blank" rel="noopener noreferrer">${game.name}</a></h2>
        <div class="scores">
          <span class="metacritic">Metacritic: ${game.metacriticScore}</span>
          <span class="user-score">User: ${game.userScore.toFixed(1)}%</span>
        </div>
      </div>
    `;
    searchContainer.appendChild(card);
  });
}

// Fetch game details and user reviews for a given app ID. Returns
// an object with the necessary information or null if either the
// Metacritic score or user score is missing.
async function getGameData(appid) {
  const detailsUrl = `https://store.steampowered.com/api/appdetails?appids=${appid}`;
  const detailsData = await fetchJson(detailsUrl);
  const detailEntry = detailsData[appid];
  if (!detailEntry || !detailEntry.success || !detailEntry.data) {
    return null;
  }
  const data = detailEntry.data;
  const metacriticScore = data.metacritic && typeof data.metacritic.score === 'number' ? data.metacritic.score : null;
  if (metacriticScore === null) return null;
  const reviewsUrl = `https://store.steampowered.com/appreviews/${appid}?json=1&purchase_type=all&language=all`;
  const reviewsData = await fetchJson(reviewsUrl);
  if (!reviewsData || !reviewsData.query_summary) return null;
  const positive = reviewsData.query_summary.total_positive;
  const negative = reviewsData.query_summary.total_negative;
  const userScore = computeUserScore(positive, negative);
  if (userScore === null) return null;
  const combined = metacriticScore + userScore;
  return {
    appid,
    name: data.name,
    metacriticScore,
    userScore,
    combined,
    image: data.header_image,
    url: `https://store.steampowered.com/app/${appid}`,
  };
}

// Load a page of candidate game entries from SteamSpy. Each page of the
// `all` request returns a large object where keys are app IDs and values
// contain basic information including the `appid` and `name`. We convert
// this object into an array and append it to `candidateList`.
async function loadCandidatePage(page) {
  const url = `https://steamspy.com/api.php?request=all&page=${page}`;
  const data = await fetchJson(url);
  const entries = Object.values(data);
  // Append new candidates to the list
  candidateList = candidateList.concat(entries);
}

// Process the next batch of candidate games. For each candidate, we call
// `getGameData` to retrieve Metacritic and user scores. Only games with
// both scores are added to `allResults`. When the end of the current
// candidateList is reached, this function attempts to load the next page
// of candidates automatically. After processing, the results are sorted
// and ranked, and `renderGames()` is called to update the UI.
async function loadNextBatch(batchSize = 10) {
  const listContainer = document.getElementById('game-list');
  if (!candidateList.length || candidateIndex >= candidateList.length) {
    // If we've exhausted the current candidate list, try to fetch the next page.
    candidatePage += 1;
    try {
      await loadCandidatePage(candidatePage);
    } catch (err) {
      console.error('Error loading additional candidate page:', err);
      return;
    }
  }
  let added = 0;
  // Process candidates until we've added the desired number of games or run out
  while (added < batchSize && candidateIndex < candidateList.length) {
    const cand = candidateList[candidateIndex++];
    try {
      const info = await getGameData(cand.appid);
      if (info) {
        allResults.push(info);
        added++;
      }
    } catch (err) {
      console.error(`Error processing app ${cand.appid}:`, err);
    }
  }
  if (added > 0) {
    // Sort by combined score descending and assign ranks
    allResults.sort((a, b) => b.combined - a.combined);
    allResults = allResults.map((game, idx) => ({ ...game, rank: idx + 1 }));
    renderGames();
  }
}

// Fetch the list of top games from SteamSpy and build a ranked list
// based on the sum of Metacritic and user scores. Limits the number of
// candidates processed to improve performance.
async function loadTopGames() {
  const listContainer = document.getElementById('game-list');
  listContainer.innerHTML = '<p>Loading data… please wait.</p>';
  try {
    // Reset global state
    allResults = [];
    candidateList = [];
    candidateIndex = 0;
    candidatePage = 1;
    // Load the first page of candidates from SteamSpy (all games)
    await loadCandidatePage(candidatePage);
    // Fetch the first batch of games to display
    await loadNextBatch(10);
  } catch (error) {
    console.error('Error initializing game list:', error);
    listContainer.innerHTML = '<p>Sorry, there was an error loading the data.</p>';
  }
}

// Attach DOMContentLoaded handler to wire up controls and load data.
window.addEventListener('DOMContentLoaded', () => {
  const loadMoreBtn = document.getElementById('load-more');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      // Fetch the next batch of games on demand.
      loadNextBatch(10);
    });
  }
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchGames(e.target.value);
    });
  }
  // Fetch and rank games from Steam in real time via the Cloudflare proxy.
  loadTopGames();
});