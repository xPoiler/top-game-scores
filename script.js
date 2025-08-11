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

// Global storage for ranked games.
let allResults = [];

/**
 * Render the currently loaded ranked games into the game list container.
 * This function displays all games present in `allResults`.
 */
function renderGames() {
  const listContainer = document.getElementById('game-list');
  listContainer.innerHTML = '';
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

  // Hide the "load more" button as all top games are loaded at once.
  const loadMoreBtn = document.getElementById('load-more');
  if (loadMoreBtn) {
    loadMoreBtn.style.display = 'none';
  }
}

/**
 * Search for games by name. If the query is empty, the main list is shown and
 * the search results are hidden. When a query is provided, this function
 * searches within the currently loaded results (`allResults`).
 *
 * @param {string} query The user’s search term.
 */
async function searchGames(query) {
  const listContainer = document.getElementById('game-list');
  const searchContainer = document.getElementById('search-results');
  if (!searchContainer) return;

  const trimmed = query.trim().toLowerCase();

  // When the query is empty, restore the main list.
  if (trimmed === '') {
    searchContainer.style.display = 'none';
    searchContainer.innerHTML = '';
    listContainer.style.display = '';
    renderGames();
    return;
  }

  // Hide the main list while searching.
  listContainer.style.display = 'none';
  searchContainer.style.display = 'block';
  searchContainer.innerHTML = '<p>Searching…</p>';

  const localMatches = allResults.filter((game) => game.name.toLowerCase().includes(trimmed));

  searchContainer.innerHTML = '';
  if (localMatches.length === 0) {
    searchContainer.innerHTML = '<p>No results found in the top 100.</p>';
    return;
  }

  // Render search results.
  localMatches.forEach((game) => {
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

// Fetch the list of top games from SteamSpy and build a ranked list
// based on the sum of Metacritic and user scores.
async function loadTopGames() {
  const listContainer = document.getElementById('game-list');
  listContainer.innerHTML = '<p>Loading data… please wait.</p>';

  try {
    // Fetch the top 100 games of all time from SteamSpy.
    const url = 'https://steamspy.com/api.php?request=top100forever';
    const candidateData = await fetchJson(url);
    const candidates = Object.values(candidateData);

    // Process all candidates.
    const gamePromises = candidates.map(cand => getGameData(cand.appid));
    const games = await Promise.all(gamePromises);

    // Filter out games that couldn't be fetched or are missing scores.
    const validGames = games.filter(game => game !== null);

    // Sort by combined score descending and assign ranks.
    validGames.sort((a, b) => b.combined - a.combined);
    allResults = validGames.map((game, idx) => ({ ...game, rank: idx + 1 }));

    renderGames();
  } catch (error) {
    console.error('Error initializing game list:', error);
    listContainer.innerHTML = '<p>Sorry, there was an error loading the data.</p>';
  }
}

// Attach DOMContentLoaded handler to wire up controls and load data.
window.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchGames(e.target.value);
    });
  }

  // Fetch and rank games from Steam in real time via the Cloudflare proxy.
  loadTopGames();
});