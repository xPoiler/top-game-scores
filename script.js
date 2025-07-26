// Fetches the top games from SteamSpy and ranks them by combined
// Metacritic and user scores. Results are displayed on the page.

// In the static version of the site we no longer call external APIs from
// the browser. Instead we fetch a precomputed JSON file (`top_games.json`)
// that lives in this repository. This eliminates any reliance on CORS
// proxies or rate‑limited endpoints and ensures the data loads reliably
// from GitHub Pages. The JSON contains fields for each game, including
// `metacritic_score`, `user_score`, `combined_score`, `header_image` and
// `store_url`. See `top_game_scores_site/top_games.json` for details.



// Global storage for ranked games and how many to display at once.
let allResults = [];
let displayCount = 5;

/**
 * Render a subset of the ranked games into the game list container. The
 * number of games displayed is controlled by the global displayCount
 * variable. This function also updates the visibility of the "load more"
 * button depending on whether additional games remain to be shown.
 */
function renderGames() {
  const listContainer = document.getElementById('game-list');
  listContainer.innerHTML = '';
  const subset = allResults.slice(0, displayCount);
  subset.forEach((game) => {
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
  const loadMoreBtn = document.getElementById('load-more');
  if (loadMoreBtn) {
    if (displayCount >= allResults.length) {
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
function searchGames(query) {
  const listContainer = document.getElementById('game-list');
  const loadMoreBtn = document.getElementById('load-more');
  const searchContainer = document.getElementById('search-results');
  if (!searchContainer) return;
  const trimmed = query.trim().toLowerCase();
  if (trimmed === '') {
    searchContainer.style.display = 'none';
    searchContainer.innerHTML = '';
    listContainer.style.display = '';
    if (displayCount < allResults.length) {
      if (loadMoreBtn) loadMoreBtn.style.display = 'inline-block';
    } else {
      if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    }
    return;
  }
  const matches = allResults.filter((game) => game.name.toLowerCase().includes(trimmed));
  listContainer.style.display = 'none';
  if (loadMoreBtn) loadMoreBtn.style.display = 'none';
  searchContainer.style.display = 'block';
  searchContainer.innerHTML = '';
  if (matches.length === 0) {
    searchContainer.innerHTML = '<p>No results found.</p>';
    return;
  }
  matches.forEach((game) => {
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

async function loadGames() {
  const listContainer = document.getElementById('game-list');
  listContainer.innerHTML = '<p>Loading data… please wait.</p>';
  try {
    const response = await fetch('top_games.json');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      listContainer.innerHTML = '<p>No games data found.</p>';
      return;
    }
    // Copy objects and convert property names to match the format used by the
    // rendering functions. The JSON file uses snake_case keys (e.g.
    // metacritic_score) so we convert them to camelCase for consistency.
    allResults = data.map((item) => ({
      rank: item.rank,
      name: item.name,
      appid: item.appid,
      metacriticScore: item.metacritic_score,
      userScore: item.user_score,
      combined: item.combined_score,
      image: item.header_image,
      url: item.store_url,
    }));
    // Ensure games are sorted by rank just in case the JSON is unordered.
    allResults.sort((a, b) => a.rank - b.rank);
    displayCount = 5;
    renderGames();
  } catch (error) {
    console.error('Error loading static games data:', error);
    listContainer.innerHTML = '<p>Sorry, there was an error loading the data.</p>';
  }
}

// Attach DOMContentLoaded handler to wire up controls and load data.
window.addEventListener('DOMContentLoaded', () => {
  const loadMoreBtn = document.getElementById('load-more');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      // Increase display count by 5 each time and re-render the list.
      displayCount += 5;
      renderGames();
    });
  }
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchGames(e.target.value);
    });
  }
  // Load precomputed games from the local JSON file instead of querying APIs.
  loadGames();
});