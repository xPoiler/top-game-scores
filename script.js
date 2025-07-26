// Fetches the top games from SteamSpy and ranks them by combined
// Metacritic and user scores. Results are displayed on the page.

/// Proxy used to work around cross‑origin restrictions. We use the
/* Proxy used to work around cross-origin restrictions.
   We use the thingproxy service (https://thingproxy.freeboard.io/)
   which proxies requests and returns raw responses.
   The URL to fetch is URL-encoded and appended to this base.
   A trailing slash is not required here because we construct the full
   proxy URL in fetchJson.
*/
const CORS_PROXY = 'https://thingproxy.freeboard.io/fetch/';


// Utility to fetch JSON with error handling via the CORS proxy. The
// requested URL is encoded and appended to the proxy base. If the
// fetch fails or returns a non‑OK status, an error is thrown. This
// function abstracts away the proxy details so callers can provide
// ordinary URLs from Steam or SteamSpy directly.
async function fetchJson(url) {
  // Encode the original URL so it can be safely transmitted as a
  // query parameter to the proxy. Without encoding, special
  // characters like & or ? would break the proxy request.
  const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;
  const response = await fetch(proxyUrl);
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

async function getGameData(appid) {
  // Fetch game details (including Metacritic score) from the Steam store API.
  // We pass the raw URL into fetchJson; it will be proxied automatically.
  const detailsUrl = `https://store.steampowered.com/api/appdetails?appids=${appid}`;
  const detailsData = await fetchJson(detailsUrl);
  const detailEntry = detailsData[appid];
  if (!detailEntry || !detailEntry.success || !detailEntry.data) {
    return null;
  }
  const data = detailEntry.data;
  const metacriticScore = data.metacritic && typeof data.metacritic.score === 'number' ? data.metacritic.score : null;
  // Skip games without Metacritic score because we cannot combine them.
  if (metacriticScore === null) return null;
  // Fetch user review summary from the Steam reviews API. Again, we
  // provide the raw URL and let fetchJson handle proxying.
  const reviewsUrl = `https://store.steampowered.com/appreviews/${appid}?json=1&purchase_type=all&language=all`;
  const reviewsData = await fetchJson(reviewsUrl);
  if (!reviewsData || !reviewsData.query_summary) return null;
  const positive = reviewsData.query_summary.total_positive;
  const negative = reviewsData.query_summary.total_negative;
  const userScore = computeUserScore(positive, negative);
  if (userScore === null) return null;
  // Combined score (simple sum) used for ranking. A higher combined score means a higher ranking.
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

async function loadTopGames() {
  const listContainer = document.getElementById('game-list');
  // Show loading message.
  listContainer.innerHTML = '<p>Loading data… please wait.</p>';
  try {
    const topUrl = 'https://steamspy.com/api.php?request=top100in2weeks';
    const topData = await fetchJson(topUrl);
    const games = Object.values(topData);
 // Limit to the first 25 games to balance coverage and network load.
    
    // A smaller slice reduces the total number of API calls, improving
    // reliability while still covering a wide range of popular titles.
  const candidates =   games.slice(0, 10);
    const results = [];
    for (const game of candidates) {
      try {
        const info = await getGameData(game.appid);
        if (info) {
          results.push(info);
        }
      } catch (err) {
        console.error(`Error processing app ${game.appid}:`, err);
      }
    }
    if (results.length === 0) {
      listContainer.innerHTML = '<p>No games with both Metacritic and user scores were found.</p>';
      return;
    }
    // Sort and assign rank.
    results.sort((a, b) => b.combined - a.combined);
    allResults = results.map((game, index) => ({ ...game, rank: index + 1 }));
    // Reset display count and render initial set.
    displayCount = 5;
    renderGames();
  } catch (error) {
    console.error('Error fetching game list:', error);
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
  loadTopGames();
});
