// Fetches the top games from SteamSpy and ranks them by combined
// Metacritic and user scores. Results are displayed on the page.

// Proxy used to work around cross‑origin restrictions. We use AllOrigins
// which proxies requests and returns raw responses. The URL to fetch is
// URL‑encoded and appended to this base. See https://api.allorigins.win/
// for details. A trailing slash is not required here because we
// construct the full proxy URL in fetchJson.
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

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
    // Get top games list from SteamSpy. Provide the raw URL; fetchJson
    // will proxy it through AllOrigins.
    const topUrl = 'https://steamspy.com/api.php?request=top100in2weeks';
    const topData = await fetchJson(topUrl);
    const games = Object.values(topData);
    // Limit to the first 25 games to reduce network load while still capturing many popular titles.
    // Fetching too many games can lead to timeouts or rate limiting on the free proxy service.
    const candidates = games.slice(0, 25);
    const results = [];
    // Iterate sequentially to avoid spamming the API too quickly.
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
    // Sort descending by combined score and take top 10.
    results.sort((a, b) => b.combined - a.combined);
    const top10 = results.slice(0, 10);
    // Build the HTML for each game card.
    listContainer.innerHTML = '';
    for (const game of top10) {
      const card = document.createElement('div');
      card.className = 'game-card';
      card.innerHTML = `
        <img src="${game.image}" alt="${game.name}" />
        <div class="game-content">
          <h2><a href="${game.url}" target="_blank" rel="noopener noreferrer">${game.name}</a></h2>
          <div class="scores">
            <span class="metacritic">Metacritic: ${game.metacriticScore}</span>
            <span class="user-score">User: ${game.userScore.toFixed(1)}%</span>
          </div>
        </div>
      `;
      listContainer.appendChild(card);
    }
  } catch (error) {
    console.error('Error fetching game list:', error);
    listContainer.innerHTML = '<p>Sorry, there was an error loading the data.</p>';
  }
}

window.addEventListener('DOMContentLoaded', loadTopGames);